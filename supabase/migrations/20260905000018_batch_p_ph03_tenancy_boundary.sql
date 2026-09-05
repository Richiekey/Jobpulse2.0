-- ============================================================================
-- JobPulse 2.0 — Batch P Final P-H03 Tenancy Boundary Hardening
-- Version: 20260905290000
-- Description:
--   Enforce strict multi-tenant boundary inside complete_assignment_with_application:
--   1. Preserve global UNIQUE(user_id, job_id) application model.
--   2. In cross-organization collisions (application already belongs to foreign Org A,
--      while assignment belongs to Org B):
--      a. NEVER mutate Org A's application (no note overwrites, no status changes,
--         no updated_at changes).
--      b. NEVER fire application events or sync events on Org A's application.
--      c. NEVER leak Org A's application fields in the Org B response ('application' is NULL).
--      d. Mark Org B assignment completed and record Org B assignment event.
--   3. In same-organization or personal adoption:
--      Upsert/update application under assignment's organization as normal.
-- ============================================================================

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
  v_existing_app RECORD;
  v_app RECORD;
  v_app_json JSONB := NULL;
  v_job RECORD;
  v_company_name TEXT;
  v_job_title TEXT;
  v_is_member BOOLEAN;
  v_cross_org BOOLEAN := false;
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
    WHERE user_id = v_caller_id
      AND job_id = v_assignment.job_id
      AND (organization_id = v_assignment.organization_id OR organization_id IS NULL)
    LIMIT 1;

    IF v_app.id IS NOT NULL THEN
      v_app_json := row_to_json(v_app);
    END IF;

    RETURN jsonb_build_object(
      'assignment', row_to_json(v_assignment),
      'application', v_app_json,
      'cross_organization_application', (v_app_json IS NULL),
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

  -- Check for existing application for (worker, job)
  SELECT *
  INTO v_existing_app
  FROM public.applications
  WHERE user_id = v_caller_id
    AND job_id = v_assignment.job_id
  FOR UPDATE;

  IF v_existing_app.id IS NOT NULL THEN
    -- Application already exists
    IF v_existing_app.organization_id IS NOT NULL 
       AND v_existing_app.organization_id != v_assignment.organization_id THEN
      -- CROSS-ORGANIZATION COLLISION (P-H03):
      -- The existing application belongs to foreign Org A.
      -- Invariant: Do NOT mutate Org A's application row!
      -- Do NOT overwrite notes, do NOT update status, do NOT fire Org A events or syncs.
      -- Do NOT leak Org A application data in this Org B operation response.
      v_app_json := NULL;
      v_cross_org := true;
    ELSE
      -- SAME-ORGANIZATION (or adopting unassigned personal application):
      UPDATE public.applications
      SET status = CASE WHEN status = 'saved' THEN 'applied' ELSE status END,
          notes = COALESCE(p_notes, notes),
          organization_id = COALESCE(organization_id, v_assignment.organization_id),
          worker_id = COALESCE(worker_id, v_caller_id),
          updated_at = now()
      WHERE id = v_existing_app.id
      RETURNING * INTO v_app;

      v_app_json := row_to_json(v_app);
    END IF;
  ELSE
    -- NEW APPLICATION: Create under current assignment organization
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
    ) RETURNING * INTO v_app;

    v_app_json := row_to_json(v_app);
  END IF;

  -- 2. Transition assignment to completed
  -- trg_capture_assignment_event fires automatically under v_assignment.organization_id
  UPDATE public.job_assignments
  SET status = 'completed',
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_assignment_id
    AND status = v_assignment.status
  RETURNING * INTO v_assignment;

  RETURN jsonb_build_object(
    'assignment', row_to_json(v_assignment),
    'application', v_app_json,
    'cross_organization_application', v_cross_org,
    'idempotent', false
  );
END;
$$;

-- Ensure privileges remain locked down
REVOKE ALL ON FUNCTION public.complete_assignment_with_application(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_assignment_with_application(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RECORD MIGRATION ENTRY
-- -----------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20260905290000', ARRAY['-- Batch P: P-H03 strict multi-tenant boundary hardening on complete_assignment_with_application'], 'batch_p_ph03_tenancy_boundary')
ON CONFLICT (version) DO NOTHING;
