-- =============================================================================
-- Migration 0039: Batch P — Controlled Test Cleanup & Dual-Condition Event Immutability Guard
-- =============================================================================
-- Purpose:
--   1. Harden prevent_application_event_mutation() with a dual-condition guard:
--      requires BOTH explicit test cleanup flag AND authorized service context.
--   2. Implement authoritative, service-role-only cleanup procedures that accept
--      exact organization IDs and exact run-specific prefixes.
--   3. Delete child and parent test entities in strict foreign-key dependency order.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. DUAL-CONDITION APPEND-ONLY IMMUTABILITY TRIGGER FUNCTION
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_application_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Dual-condition security guard:
  -- 1. Explicit cleanup flag must be active
  -- 2. Caller must be in the authorized test cleanup service context
  -- 3. Execution role must be service_role or postgres (never anon or client authenticated)
  IF current_setting('app.allow_test_cleanup', true) = 'on'
     AND current_setting('app.cleanup_context', true) = 'test_cleanup_service'
     AND (current_user IN ('postgres', 'service_role') OR session_user IN ('postgres', 'service_role')) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'application_events table is append-only: UPDATE and DELETE operations are strictly prohibited.'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

-- -----------------------------------------------------------------------------
-- 1.1 ORG MEMBER ESCALATION TRIGGER: RECOGNIZE DUAL-CONDITION CLEANUP & POSTGRES
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_org_member_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role public.org_role_enum;
  v_owner_count INTEGER;
  v_member_count INTEGER;
BEGIN
  -- Service role, postgres, platform superadmin, or authorized test cleanup context bypasses
  IF current_user IN ('service_role', 'postgres') 
     OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR (
       current_setting('app.allow_test_cleanup', true) = 'on' 
       AND current_setting('app.cleanup_context', true) = 'test_cleanup_service'
       AND (current_user IN ('postgres', 'service_role') OR session_user IN ('postgres', 'service_role'))
     )
     OR public.is_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- 3.1 INSERT RULES
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO v_member_count
    FROM public.organization_members
    WHERE organization_id = NEW.organization_id;

    IF v_member_count = 0 THEN
      IF NEW.role != 'owner' THEN
        RAISE EXCEPTION 'INVALID_OPERATION: The initial organization member must be an owner.';
      END IF;
      RETURN NEW;
    END IF;

    SELECT role INTO v_caller_role
    FROM public.organization_members
    WHERE organization_id = NEW.organization_id
      AND user_id = v_caller_id;

    IF NEW.role = 'owner' AND v_caller_role != 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: Only organization owners can create owner memberships.';
    END IF;

    IF v_caller_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'FORBIDDEN: Insufficient permissions to add organization members.';
    END IF;

    RETURN NEW;
  END IF;

  -- 3.2 UPDATE RULES
  IF TG_OP = 'UPDATE' THEN
    SELECT role INTO v_caller_role
    FROM public.organization_members
    WHERE organization_id = OLD.organization_id
      AND user_id = v_caller_id;

    IF NEW.organization_id != OLD.organization_id OR NEW.user_id != OLD.user_id THEN
      RAISE EXCEPTION 'INVALID_OPERATION: Cannot alter organization_id or user_id of an existing membership.';
    END IF;

    IF NEW.role != OLD.role THEN
      IF NEW.role = 'owner' AND v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only organization owners can grant the owner role.';
      END IF;

      IF OLD.role = 'owner' AND v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'FORBIDDEN: Organization admins cannot modify owner memberships.';
      END IF;

      IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
        SELECT count(*) INTO v_owner_count
        FROM public.organization_members
        WHERE organization_id = OLD.organization_id AND role = 'owner';

        IF v_owner_count <= 1 THEN
          RAISE EXCEPTION 'FORBIDDEN: Cannot demote the sole owner of the organization.';
        END IF;
      END IF;
    END IF;

    IF v_caller_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'FORBIDDEN: Workers cannot modify organization memberships.';
    END IF;

    RETURN NEW;
  END IF;

  -- 3.3 DELETE RULES
  IF TG_OP = 'DELETE' THEN
    SELECT role INTO v_caller_role
    FROM public.organization_members
    WHERE organization_id = OLD.organization_id
      AND user_id = v_caller_id;

    IF OLD.role = 'owner' AND v_caller_role != 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: Organization admins cannot delete owner memberships.';
    END IF;

    IF OLD.role = 'owner' THEN
      SELECT count(*) INTO v_owner_count
      FROM public.organization_members
      WHERE organization_id = OLD.organization_id AND role = 'owner';

      IF v_owner_count <= 1 THEN
        RAISE EXCEPTION 'FORBIDDEN: Cannot delete the sole owner of the organization.';
      END IF;
    END IF;

    IF v_caller_role NOT IN ('owner', 'admin') AND OLD.user_id != v_caller_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Workers cannot delete other organization memberships.';
    END IF;

    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 2. CONTROLLED TEST FIXTURE CLEANUP BY EXACT ORGANIZATION IDS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_test_fixtures_by_ids(p_target_org_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_del_app_events integer := 0;
  v_del_app_verifs integer := 0;
  v_del_sync_events integer := 0;
  v_del_apps integer := 0;
  v_del_asgn_events integer := 0;
  v_del_asgns integer := 0;
  v_del_members integer := 0;
  v_del_orgs integer := 0;
BEGIN
  -- Safety checks: array must not be empty
  IF p_target_org_ids IS NULL OR array_length(p_target_org_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Safety check failed: p_target_org_ids array cannot be empty.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Safety verification: ensure all target orgs are test organizations
  IF EXISTS (
    SELECT 1 FROM public.organizations 
    WHERE id = ANY(p_target_org_ids) 
      AND slug NOT LIKE 'int-org-%' 
      AND slug NOT LIKE 'test-%'
  ) THEN
    RAISE EXCEPTION 'Safety check failed: All target organization IDs must match test slug patterns (int-org- or test-).'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Establish dual-condition authorization for this transaction
  SET LOCAL app.allow_test_cleanup = 'on';
  SET LOCAL app.cleanup_context = 'test_cleanup_service';

  -- 1. Delete application_events referencing target applications or organizations
  WITH del AS (
    DELETE FROM public.application_events
    WHERE organization_id = ANY(p_target_org_ids)
       OR application_id IN (SELECT id FROM public.applications WHERE organization_id = ANY(p_target_org_ids))
    RETURNING id
  )
  SELECT count(*) INTO v_del_app_events FROM del;

  -- 2. Delete application_verifications (if any)
  WITH del AS (
    DELETE FROM public.application_verifications
    WHERE organization_id = ANY(p_target_org_ids)
       OR application_id IN (SELECT id FROM public.applications WHERE organization_id = ANY(p_target_org_ids))
    RETURNING id
  )
  SELECT count(*) INTO v_del_app_verifs FROM del;

  -- 3. Delete sync_events (if any)
  WITH del AS (
    DELETE FROM public.sync_events
    WHERE organization_id = ANY(p_target_org_ids)
       OR application_id IN (SELECT id FROM public.applications WHERE organization_id = ANY(p_target_org_ids))
    RETURNING id
  )
  SELECT count(*) INTO v_del_sync_events FROM del;

  -- 4. Delete applications in target organizations
  WITH del AS (
    DELETE FROM public.applications
    WHERE organization_id = ANY(p_target_org_ids)
    RETURNING id
  )
  SELECT count(*) INTO v_del_apps FROM del;

  -- 5. Delete assignment_events in target organizations
  WITH del AS (
    DELETE FROM public.assignment_events
    WHERE organization_id = ANY(p_target_org_ids)
       OR assignment_id IN (SELECT id FROM public.job_assignments WHERE organization_id = ANY(p_target_org_ids))
    RETURNING id
  )
  SELECT count(*) INTO v_del_asgn_events FROM del;

  -- 6. Delete job_assignments in target organizations
  WITH del AS (
    DELETE FROM public.job_assignments
    WHERE organization_id = ANY(p_target_org_ids)
    RETURNING id
  )
  SELECT count(*) INTO v_del_asgns FROM del;

  -- 7. Delete organization_members in target organizations
  WITH del AS (
    DELETE FROM public.organization_members
    WHERE organization_id = ANY(p_target_org_ids)
    RETURNING organization_id
  )
  SELECT count(*) INTO v_del_members FROM del;

  -- 8. Delete organizations
  WITH del AS (
    DELETE FROM public.organizations
    WHERE id = ANY(p_target_org_ids)
    RETURNING id
  )
  SELECT count(*) INTO v_del_orgs FROM del;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_application_events', v_del_app_events,
    'deleted_application_verifications', v_del_app_verifs,
    'deleted_sync_events', v_del_sync_events,
    'deleted_applications', v_del_apps,
    'deleted_assignment_events', v_del_asgn_events,
    'deleted_job_assignments', v_del_asgns,
    'deleted_organization_members', v_del_members,
    'deleted_organizations', v_del_orgs
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. CONTROLLED TEST FIXTURE CLEANUP BY EXACT RUN PREFIX
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_test_run_by_prefix(p_run_slug_prefix text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_matching_org_ids uuid[];
BEGIN
  -- Strict safety gate: prefix must be run-specific (minimum length 12) and start with test patterns
  IF p_run_slug_prefix IS NULL 
     OR length(p_run_slug_prefix) < 12
     OR (p_run_slug_prefix NOT LIKE 'int-org-%' AND p_run_slug_prefix NOT LIKE 'test-%') THEN
    RAISE EXCEPTION 'Safety check failed: p_run_slug_prefix must be run-specific (at least 12 chars) starting with int-org- or test-.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Find exact matching test org IDs
  SELECT array_agg(id) INTO v_matching_org_ids
  FROM public.organizations
  WHERE slug LIKE p_run_slug_prefix || '%';

  IF v_matching_org_ids IS NULL OR array_length(v_matching_org_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'deleted_organizations', 0,
      'message', 'No matching test organizations found for prefix'
    );
  END IF;

  -- Delegate to the authoritative ID-based cleanup function
  RETURN public.cleanup_test_fixtures_by_ids(v_matching_org_ids);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. ACCESS CONTROL & LEAST PRIVILEGE
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.cleanup_test_fixtures_by_ids(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_test_fixtures_by_ids(uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_test_run_by_prefix(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_test_run_by_prefix(text) TO service_role;
