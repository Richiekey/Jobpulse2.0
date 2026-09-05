-- ============================================================================
-- JobPulse 2.0 — Batch P Production Hardening Pass
-- Version: 20260905270000
-- Description:
--   1. Fix P-01: Introduce complete_assignment_with_application atomic RPC
--      for single-transaction assignment completion and application creation.
--   2. Fix P-02: Enforce atomic status transition on job_assignments with FSM locking.
--   3. Fix P-03: Create immutable assignment_events audit table + trigger on
--      job_assignments, eliminating synthetic activity event guesses.
--   4. Fix P-04: Implement get_worker_activity_stream RPC for database-backed pagination.
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. ASSIGNMENT EVENTS IMMUTABLE AUDIT TABLE (P-03)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assignment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.job_assignments(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'assigned', 'started', 'completed', 'skipped'
  from_status public.assignment_status_enum,
  to_status public.assignment_status_enum NOT NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignment_events_worker 
  ON public.assignment_events(worker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignment_events_org 
  ON public.assignment_events(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignment_events_asgn 
  ON public.assignment_events(assignment_id, created_at ASC);

ALTER TABLE public.assignment_events ENABLE ROW LEVEL SECURITY;

-- View policy: Worker themselves, organization admins, or platform superadmin
DROP POLICY IF EXISTS "authorized_users_view_assignment_events" ON public.assignment_events;
CREATE POLICY "authorized_users_view_assignment_events" ON public.assignment_events
  FOR SELECT USING (
    worker_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
    OR public.is_admin()
  );

-- Insert policy: Service role, admin, or authenticated actor
DROP POLICY IF EXISTS "authorized_users_insert_assignment_events" ON public.assignment_events;
CREATE POLICY "authorized_users_insert_assignment_events" ON public.assignment_events
  FOR INSERT WITH CHECK (
    current_user = 'service_role'
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR public.is_admin()
    OR auth.uid() = actor_id
  );

-- -----------------------------------------------------------------------------
-- 2. AUTOMATIC EVENT TRIGGER ON JOB_ASSIGNMENTS (P-03)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capture_assignment_lifecycle_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_event_type TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    v_actor_id := COALESCE(NEW.assigned_by, NEW.worker_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.assignment_events (
      assignment_id,
      organization_id,
      worker_id,
      actor_id,
      event_type,
      from_status,
      to_status,
      notes,
      metadata,
      created_at
    ) VALUES (
      NEW.id,
      NEW.organization_id,
      NEW.worker_id,
      v_actor_id,
      'assigned',
      NULL,
      NEW.status,
      NEW.notes,
      jsonb_build_object('deadline_at', NEW.deadline_at, 'job_id', NEW.job_id),
      now()
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status != OLD.status THEN
      v_event_type := CASE 
        WHEN NEW.status = 'in_progress' THEN 'started'
        WHEN NEW.status = 'completed' THEN 'completed'
        WHEN NEW.status = 'skipped' THEN 'skipped'
        ELSE 'status_changed'
      END;

      INSERT INTO public.assignment_events (
        assignment_id,
        organization_id,
        worker_id,
        actor_id,
        event_type,
        from_status,
        to_status,
        notes,
        metadata,
        created_at
      ) VALUES (
        NEW.id,
        NEW.organization_id,
        NEW.worker_id,
        v_actor_id,
        v_event_type,
        OLD.status,
        NEW.status,
        NEW.notes,
        jsonb_build_object('previous_status', OLD.status, 'new_status', NEW.status, 'job_id', NEW.job_id),
        now()
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_assignment_event ON public.job_assignments;
CREATE TRIGGER trg_capture_assignment_event
  AFTER INSERT OR UPDATE ON public.job_assignments
  FOR EACH ROW EXECUTE FUNCTION public.capture_assignment_lifecycle_event();

-- Backfill initial 'assigned' events for existing assignments
INSERT INTO public.assignment_events (
  assignment_id,
  organization_id,
  worker_id,
  actor_id,
  event_type,
  from_status,
  to_status,
  notes,
  metadata,
  created_at
)
SELECT 
  id,
  organization_id,
  worker_id,
  assigned_by,
  'assigned',
  NULL,
  'assigned',
  notes,
  jsonb_build_object('deadline_at', deadline_at, 'job_id', job_id, 'is_backfilled', true),
  created_at
FROM public.job_assignments ja
WHERE NOT EXISTS (
  SELECT 1 FROM public.assignment_events ae WHERE ae.assignment_id = ja.id
);

-- -----------------------------------------------------------------------------
-- 3. ATOMIC ASSIGNMENT COMPLETION + APPLICATION UPSERT RPC (P-01 & P-02)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_assignment_with_application(
  p_assignment_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_company_name TEXT DEFAULT NULL,
  p_job_title TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_assignment RECORD;
  v_app RECORD;
  v_job RECORD;
  v_company_name TEXT;
  v_job_title TEXT;
  v_is_member BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required to complete assignment.';
  END IF;

  -- Lock assignment row for update to eliminate concurrent mutations
  SELECT *
  INTO v_assignment
  FROM public.job_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Assignment % not found.', p_assignment_id;
  END IF;

  -- Verify worker ownership
  IF v_assignment.worker_id != v_caller_id THEN
    RAISE EXCEPTION 'FORBIDDEN: You are not authorized to complete this assignment.';
  END IF;

  -- Verify tenant membership
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_assignment.organization_id
      AND user_id = v_caller_id
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'FORBIDDEN: You are not a member of the assignment organization.';
  END IF;

  -- Idempotency check: if assignment is already completed, return current state safely
  IF v_assignment.status = 'completed' THEN
    SELECT * INTO v_app
    FROM public.applications
    WHERE user_id = v_caller_id AND job_id = v_assignment.job_id
    LIMIT 1;

    RETURN jsonb_build_object(
      'assignment', row_to_json(v_assignment),
      'application', CASE WHEN v_app.id IS NOT NULL THEN row_to_json(v_app) ELSE NULL END,
      'idempotent', true
    );
  END IF;

  -- Cannot complete skipped assignment
  IF v_assignment.status = 'skipped' THEN
    RAISE EXCEPTION 'CONFLICT: Cannot complete an assignment with status skipped.';
  END IF;

  -- FSM check: can transition from assigned or in_progress to completed
  IF v_assignment.status NOT IN ('assigned', 'in_progress') THEN
    RAISE EXCEPTION 'CONFLICT: Cannot transition assignment from % to completed.', v_assignment.status;
  END IF;

  -- Resolve company name and job title if not provided
  IF p_company_name IS NULL OR p_job_title IS NULL THEN
    SELECT j.id, j.display_title, j.canonical_title, c.name AS comp_name
    INTO v_job
    FROM public.jobs j
    LEFT JOIN public.companies c ON c.id = j.company_id
    WHERE j.id = v_assignment.job_id;

    v_job_title := COALESCE(p_job_title, v_job.display_title, v_job.canonical_title, 'Position');
    v_company_name := COALESCE(p_company_name, v_job.comp_name, 'Company');
  ELSE
    v_job_title := p_job_title;
    v_company_name := p_company_name;
  END IF;

  -- 1. Create or resolve application (atomic upsert)
  -- trg_capture_application_events and trg_enqueue_application_sync fire automatically
  INSERT INTO public.applications (
    user_id,
    job_id,
    company_name,
    job_title,
    status,
    notes,
    organization_id,
    worker_id,
    applied_at,
    updated_at
  ) VALUES (
    v_caller_id,
    v_assignment.job_id,
    v_company_name,
    v_job_title,
    'applied',
    COALESCE(p_notes, 'Application logged via Worker Command Center'),
    v_assignment.organization_id,
    v_caller_id,
    now(),
    now()
  )
  ON CONFLICT (user_id, job_id)
  DO UPDATE SET
    status = CASE WHEN public.applications.status = 'saved' THEN 'applied' ELSE public.applications.status END,
    notes = COALESCE(EXCLUDED.notes, public.applications.notes),
    organization_id = COALESCE(public.applications.organization_id, EXCLUDED.organization_id),
    worker_id = COALESCE(public.applications.worker_id, EXCLUDED.worker_id),
    updated_at = now()
  RETURNING * INTO v_app;

  -- 2. Transition assignment to completed
  -- trg_capture_assignment_event fires automatically
  UPDATE public.job_assignments
  SET status = 'completed',
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_assignment_id
    AND status = v_assignment.status
  RETURNING * INTO v_assignment;

  RETURN jsonb_build_object(
    'assignment', row_to_json(v_assignment),
    'application', row_to_json(v_app),
    'idempotent', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_assignment_with_application(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. AUTHORITATIVE EVENT STREAM PAGINATION RPC (P-03 & P-04)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_worker_activity_stream(
  p_organization_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT 'all',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_items JSONB;
  v_total INT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required.';
  END IF;

  IF p_organization_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_organization_id AND user_id = v_caller_id
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN: You are not a member of this organization.';
    END IF;
  END IF;

  WITH unified_events AS (
    -- 1. Assignment Events
    SELECT
      'asgn-ev-' || ae.id::text AS id,
      'assignment' AS category,
      ae.event_type AS event_type,
      CASE 
        WHEN ae.event_type = 'assigned' THEN 'Assigned: ' || COALESCE(j.display_title, j.canonical_title, 'Position')
        WHEN ae.event_type = 'started' THEN 'Started: ' || COALESCE(j.display_title, j.canonical_title, 'Position')
        WHEN ae.event_type = 'completed' THEN 'Completed: ' || COALESCE(j.display_title, j.canonical_title, 'Position')
        WHEN ae.event_type = 'skipped' THEN 'Skipped: ' || COALESCE(j.display_title, j.canonical_title, 'Position')
        ELSE 'Assignment: ' || COALESCE(j.display_title, j.canonical_title, 'Position')
      END AS title,
      CASE
        WHEN ae.event_type = 'assigned' THEN 'Dispatched for ' || COALESCE(c.name, 'Company') || COALESCE(' — ' || ae.notes, '')
        ELSE COALESCE(c.name, 'Company') || ' assignment marked as ' || ae.to_status::text || COALESCE(' — ' || ae.notes, '')
      END AS description,
      ae.to_status::text AS status,
      ae.created_at AS occurred_at,
      ae.organization_id AS organization_id,
      jsonb_build_object(
        'assignmentId', ae.assignment_id,
        'jobId', ja.job_id,
        'fromStatus', ae.from_status,
        'toStatus', ae.to_status
      ) || ae.metadata AS metadata
    FROM public.assignment_events ae
    JOIN public.job_assignments ja ON ja.id = ae.assignment_id
    LEFT JOIN public.jobs j ON j.id = ja.job_id
    LEFT JOIN public.companies c ON c.id = j.company_id
    WHERE ae.worker_id = v_caller_id
      AND (p_organization_id IS NULL OR ae.organization_id = p_organization_id)
      AND (p_category = 'all' OR p_category = 'assignment')

    UNION ALL

    -- 2. Application Events
    SELECT
      'app-ev-' || ape.id::text AS id,
      'application' AS category,
      ape.event_type AS event_type,
      CASE 
        WHEN ape.event_type IN ('applied', 'created') THEN 'Application Logged: ' || a.job_title
        WHEN ape.event_type = 'status_changed' THEN 'Stage Updated: ' || a.job_title
        ELSE 'Application: ' || a.job_title
      END AS title,
      CASE
        WHEN ape.event_type IN ('applied', 'created') THEN 'Tracked application to ' || a.company_name || ' in ' || COALESCE(ape.to_status::text, a.status::text) || ' stage'
        WHEN ape.event_type = 'status_changed' THEN a.company_name || ' application is now in ' || COALESCE(ape.to_status::text, a.status::text) || ' stage'
        ELSE 'Application event: ' || ape.event_type
      END AS description,
      COALESCE(ape.to_status::text, a.status::text) AS status,
      ape.created_at AS occurred_at,
      ape.organization_id AS organization_id,
      jsonb_build_object(
        'applicationId', ape.application_id,
        'fromStatus', ape.from_status,
        'toStatus', ape.to_status
      ) || ape.metadata AS metadata
    FROM public.application_events ape
    JOIN public.applications a ON a.id = ape.application_id
    WHERE (a.user_id = v_caller_id OR a.worker_id = v_caller_id)
      AND (p_organization_id IS NULL OR ape.organization_id = p_organization_id)
      AND (p_category = 'all' OR p_category = 'application')

    UNION ALL

    -- 3. Verification Events (Submitted)
    SELECT
      'verif-sub-' || av.id::text AS id,
      'verification' AS category,
      'verification_submitted' AS event_type,
      'Proof Uploaded: ' || a.job_title AS title,
      'Screenshot evidence submitted for ' || a.company_name AS description,
      av.status::text AS status,
      av.created_at AS occurred_at,
      av.organization_id AS organization_id,
      jsonb_build_object('verificationId', av.id, 'applicationId', av.application_id) AS metadata
    FROM public.application_verifications av
    JOIN public.applications a ON a.id = av.application_id
    WHERE av.worker_id = v_caller_id
      AND (p_organization_id IS NULL OR av.organization_id = p_organization_id)
      AND (p_category = 'all' OR p_category = 'verification')

    UNION ALL

    -- 4. Verification Events (Reviewed)
    SELECT
      'verif-rev-' || av.id::text AS id,
      'verification' AS category,
      CASE WHEN av.status = 'verified' THEN 'verification_approved' ELSE 'verification_rejected' END AS event_type,
      'Proof ' || CASE WHEN av.status = 'verified' THEN 'Approved: ' ELSE 'Rejected: ' END || a.job_title AS title,
      CASE 
        WHEN av.status = 'verified' THEN 'Admin verified application proof for ' || a.company_name
        ELSE 'Verification rejected: ' || COALESCE(av.rejection_reason, av.notes, 'Evidence insufficient')
      END AS description,
      av.status::text AS status,
      av.reviewed_at AS occurred_at,
      av.organization_id AS organization_id,
      jsonb_build_object('verificationId', av.id, 'applicationId', av.application_id) AS metadata
    FROM public.application_verifications av
    JOIN public.applications a ON a.id = av.application_id
    WHERE av.worker_id = v_caller_id
      AND av.reviewed_at IS NOT NULL
      AND av.status != 'pending'
      AND (p_organization_id IS NULL OR av.organization_id = p_organization_id)
      AND (p_category = 'all' OR p_category = 'verification')

    UNION ALL

    -- 5. Sync Events
    SELECT
      'sync-' || se.id::text AS id,
      'sync' AS category,
      'sync_' || se.status::text AS event_type,
      CASE
        WHEN se.status = 'synced' THEN 'Synced to Sheets: ' || a.job_title
        ELSE 'Sync Issue: ' || a.job_title
      END AS title,
      CASE
        WHEN se.status = 'synced' THEN 'Successfully exported ' || a.company_name || ' application to Google Sheets'
        ELSE 'Google Sheets sync issue: ' || COALESCE(se.last_error, 'Export pending/failed')
      END AS description,
      se.status::text AS status,
      COALESCE(se.updated_at, se.created_at) AS occurred_at,
      se.organization_id AS organization_id,
      jsonb_build_object('syncEventId', se.id, 'applicationId', se.application_id, 'attempts', se.attempts) AS metadata
    FROM public.sync_events se
    JOIN public.applications a ON a.id = se.application_id
    WHERE (se.user_id = v_caller_id OR a.user_id = v_caller_id OR a.worker_id = v_caller_id)
      AND (p_organization_id IS NULL OR se.organization_id = p_organization_id)
      AND (p_category = 'all' OR p_category = 'sync')
  )
  SELECT COUNT(*) INTO v_total FROM unified_events;

  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb) INTO v_items
  FROM (
    SELECT * FROM unified_events
    ORDER BY occurred_at DESC
    LIMIT p_limit OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'hasMore', (p_offset + p_limit) < v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_worker_activity_stream(UUID, TEXT, INT, INT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. RECORD MIGRATION ENTRY
-- -----------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20260905270000', ARRAY['-- Batch P: Production hardening pass (atomic completion, assignment events, and activity stream)'], 'batch_p_production_hardening')
ON CONFLICT (version) DO NOTHING;
