-- =============================================================================
-- Migration 0028: Batch L Remediation — Event Integrity, Immutability & Lifecycle Authority
-- =============================================================================
-- Purpose:
--   1. Remove ON DELETE CASCADE from application_events and enforce ON DELETE RESTRICT.
--   2. Add soft-deletion support (deleted_at) on public.applications.
--   3. Enforce database-level append-only immutability (block UPDATE/DELETE on events).
--   4. Enforce organization provenance consistency on event insertion.
--   5. Support explicit actor attribution (actor_type: user, worker, admin, system).
--   6. Establish single authoritative lifecycle trigger covering all application mutations.
--   7. Align RLS authorization with API semantics (owner, assigned worker, org admin).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. EXTEND APPLICATIONS FOR SOFT DELETION
-- -----------------------------------------------------------------------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_deleted_at 
  ON public.applications(deleted_at) 
  WHERE deleted_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. HARDEN APPLICATION_EVENTS SCHEMA & FOREIGN KEYS
-- -----------------------------------------------------------------------------
-- 2.1 Allow actor_id to be NULL for system operations
ALTER TABLE public.application_events 
  ALTER COLUMN actor_id DROP NOT NULL;

-- 2.2 Add actor_type column with check constraint
ALTER TABLE public.application_events
  ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'user'
  CHECK (actor_type IN ('user', 'worker', 'admin', 'system'));

CREATE INDEX IF NOT EXISTS idx_app_events_actor_type 
  ON public.application_events(actor_type, created_at DESC);

-- 2.3 Remove ON DELETE CASCADE, replace with ON DELETE RESTRICT
ALTER TABLE public.application_events
  DROP CONSTRAINT IF EXISTS application_events_application_id_fkey,
  DROP CONSTRAINT IF EXISTS application_events_organization_id_fkey;

ALTER TABLE public.application_events
  ADD CONSTRAINT application_events_application_id_fkey
    FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE RESTRICT,
  ADD CONSTRAINT application_events_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- 3. DATABASE-LEVEL IMMUTABILITY TRIGGER (APPEND-ONLY ENFORCEMENT)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_application_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'application_events table is append-only: UPDATE and DELETE operations are strictly prohibited.'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_application_event_mutation ON public.application_events;
CREATE TRIGGER trg_prevent_application_event_mutation
  BEFORE UPDATE OR DELETE ON public.application_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_application_event_mutation();

-- -----------------------------------------------------------------------------
-- 4. ORGANIZATION PROVENANCE ENFORCEMENT TRIGGER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_event_organization_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app_org_id UUID;
BEGIN
  SELECT organization_id INTO v_app_org_id
  FROM public.applications
  WHERE id = NEW.application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced application does not exist: %', NEW.application_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Enforce that event organization matches application organization
  IF NEW.organization_id IS DISTINCT FROM v_app_org_id THEN
    RAISE EXCEPTION 'Organization provenance mismatch: event organization (%) does not match application organization (%)',
      COALESCE(NEW.organization_id::text, 'null'), COALESCE(v_app_org_id::text, 'null')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_event_provenance ON public.application_events;
CREATE TRIGGER trg_enforce_event_provenance
  BEFORE INSERT ON public.application_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_organization_provenance();

-- -----------------------------------------------------------------------------
-- 5. SINGLE AUTHORITATIVE LIFECYCLE EVENT TRIGGER ON APPLICATIONS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capture_application_lifecycle_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_type TEXT := 'user';
  v_event_type TEXT;
  v_from_status public.application_status_enum := NULL;
  v_to_status public.application_status_enum := NULL;
  v_metadata JSONB := '{}'::jsonb;
BEGIN
  -- 5.1 Explicit Actor Attribution
  IF v_actor_id IS NULL THEN
    v_actor_id := NULL;
    v_actor_type := 'system';
  ELSE
    IF NEW.organization_id IS NOT NULL AND public.is_org_admin(NEW.organization_id, v_actor_id) THEN
      v_actor_type := 'admin';
    ELSIF NEW.worker_id = v_actor_id THEN
      v_actor_type := 'worker';
    ELSE
      v_actor_type := 'user';
    END IF;
  END IF;

  -- 5.2 ON INSERT: Emit created / applied event
  IF TG_OP = 'INSERT' THEN
    v_event_type := CASE WHEN NEW.status = 'applied' THEN 'applied' ELSE 'created' END;
    v_from_status := NULL;
    v_to_status := NEW.status;
    v_metadata := jsonb_build_object(
      'job_id', NEW.job_id,
      'company_name', NEW.company_name,
      'job_title', NEW.job_title,
      'initial_status', NEW.status,
      'notes', NEW.notes
    );

    INSERT INTO public.application_events (
      application_id,
      organization_id,
      actor_id,
      actor_type,
      event_type,
      from_status,
      to_status,
      metadata,
      created_at
    ) VALUES (
      NEW.id,
      NEW.organization_id,
      v_actor_id,
      v_actor_type,
      v_event_type,
      v_from_status,
      v_to_status,
      v_metadata,
      now()
    );

    RETURN NEW;
  END IF;

  -- 5.3 ON UPDATE: Complete CRM and Lifecycle Audit Coverage
  IF TG_OP = 'UPDATE' THEN
    -- Case A: Application Soft-Deleted / Archived
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      INSERT INTO public.application_events (
        application_id,
        organization_id,
        actor_id,
        actor_type,
        event_type,
        from_status,
        to_status,
        metadata,
        created_at
      ) VALUES (
        NEW.id,
        NEW.organization_id,
        v_actor_id,
        v_actor_type,
        'archived',
        OLD.status,
        NEW.status,
        jsonb_build_object(
          'reason', 'Application deleted or archived',
          'deleted_at', NEW.deleted_at,
          'previous_status', OLD.status
        ),
        now()
      );
      RETURN NEW;
    END IF;

    -- Case B: Status Changed
    IF NEW.status != OLD.status THEN
      INSERT INTO public.application_events (
        application_id,
        organization_id,
        actor_id,
        actor_type,
        event_type,
        from_status,
        to_status,
        metadata,
        created_at
      ) VALUES (
        NEW.id,
        NEW.organization_id,
        v_actor_id,
        v_actor_type,
        'status_changed',
        OLD.status,
        NEW.status,
        jsonb_build_object(
          'previous_status', OLD.status,
          'new_status', NEW.status,
          'notes', NEW.notes
        ),
        now()
      );
    END IF;

    -- Case C: Worker Assigned / Reassigned
    IF NEW.worker_id IS DISTINCT FROM OLD.worker_id THEN
      INSERT INTO public.application_events (
        application_id,
        organization_id,
        actor_id,
        actor_type,
        event_type,
        from_status,
        to_status,
        metadata,
        created_at
      ) VALUES (
        NEW.id,
        NEW.organization_id,
        v_actor_id,
        v_actor_type,
        CASE WHEN OLD.worker_id IS NULL THEN 'assigned' ELSE 'reassigned' END,
        OLD.status,
        NEW.status,
        jsonb_build_object(
          'previous_worker_id', OLD.worker_id,
          'new_worker_id', NEW.worker_id,
          'assigned_by', NEW.assigned_by
        ),
        now()
      );
    END IF;

    -- Case D: Notes Updated Independently
    IF NEW.status = OLD.status AND (NEW.notes IS DISTINCT FROM OLD.notes) THEN
      INSERT INTO public.application_events (
        application_id,
        organization_id,
        actor_id,
        actor_type,
        event_type,
        from_status,
        to_status,
        metadata,
        created_at
      ) VALUES (
        NEW.id,
        NEW.organization_id,
        v_actor_id,
        v_actor_type,
        'note_updated',
        OLD.status,
        NEW.status,
        jsonb_build_object(
          'previous_notes', OLD.notes,
          'notes', NEW.notes
        ),
        now()
      );
    END IF;

    -- Case E: Details Updated (company_name or job_title edited)
    IF (NEW.company_name IS DISTINCT FROM OLD.company_name) OR (NEW.job_title IS DISTINCT FROM OLD.job_title) THEN
      INSERT INTO public.application_events (
        application_id,
        organization_id,
        actor_id,
        actor_type,
        event_type,
        from_status,
        to_status,
        metadata,
        created_at
      ) VALUES (
        NEW.id,
        NEW.organization_id,
        v_actor_id,
        v_actor_type,
        'details_updated',
        OLD.status,
        NEW.status,
        jsonb_build_object(
          'previous_company_name', OLD.company_name,
          'new_company_name', NEW.company_name,
          'previous_job_title', OLD.job_title,
          'new_job_title', NEW.job_title
        ),
        now()
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_application_events ON public.applications;
CREATE TRIGGER trg_capture_application_events
  AFTER INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.capture_application_lifecycle_event();

-- -----------------------------------------------------------------------------
-- 6. SYMMETRIC ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
-- 6.1 SELECT: Owner, Assigned Worker, Organization Admin, or Superadmin
DROP POLICY IF EXISTS "authorized_users_view_application_events" ON public.application_events;
CREATE POLICY "authorized_users_view_application_events" ON public.application_events
  FOR SELECT USING (
    -- Case A: User is the application owner or assigned worker
    EXISTS (
      SELECT 1 FROM public.applications a 
      WHERE a.id = application_events.application_id 
        AND (a.user_id = auth.uid() OR a.worker_id = auth.uid())
    )
    -- Case B: User is an admin of the organization associated with this event
    OR (
      organization_id IS NOT NULL 
      AND public.is_org_admin(organization_id)
    )
    -- Case C: Platform superadmin
    OR public.is_admin()
  );

-- 6.2 INSERT: Authorized actors inserting user CRM notes/comments (NO LIFECYCLE FORGING)
DROP POLICY IF EXISTS "authorized_users_insert_application_events" ON public.application_events;
CREATE POLICY "authorized_users_insert_application_events" ON public.application_events
  FOR INSERT WITH CHECK (
    -- Service role or platform superadmin
    current_user = 'service_role'
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR public.is_admin()
    -- Normal authenticated user inserting a legitimate CRM note/comment
    OR (
      auth.uid() = actor_id
      AND event_type IN ('note_added', 'comment_added')
      AND (
        EXISTS (
          SELECT 1 FROM public.applications a 
          WHERE a.id = application_events.application_id 
            AND (
              a.user_id = auth.uid() 
              OR a.worker_id = auth.uid()
              OR (a.organization_id IS NOT NULL AND public.is_org_admin(a.organization_id))
            )
        )
      )
    )
  );

-- Ensure NO UPDATE or DELETE policies exist for application_events
DROP POLICY IF EXISTS "anyone_update_application_events" ON public.application_events;
DROP POLICY IF EXISTS "anyone_delete_application_events" ON public.application_events;
