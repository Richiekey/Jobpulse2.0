-- =============================================================================
-- Migration 0026: Batch K — Security & State-Machine Hardening
-- =============================================================================
-- Purpose:
--   1. Finding 1: Database-level role escalation prevention (admin -> owner blocked,
--      last-owner demotion/deletion blocked, atomic ownership transfer RPC).
--   2. Finding 2: Assignment lifecycle state-machine enforcement (terminal assignments
--      cannot be reset to assigned; core relationship immutability).
--   3. Finding 3: Worker profile tenancy hardening (requires both auth.uid() = user_id
--      AND active membership in the organization).
--   4. Finding 4: Organization direct creation bypass prevention (block direct INSERT
--      on organizations for ordinary users; enforce atomic create_organization_with_owner RPC).
--   5. Finding 5: Explicit platform super-admin bypass boundaries.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. HARDEN ORGANIZATIONS DIRECT INSERT (FINDING 4)
-- -----------------------------------------------------------------------------
-- Remove unrestricted authenticated INSERT policy.
-- Normal users must create organizations via atomic create_organization_with_owner() RPC.
DROP POLICY IF EXISTS "authenticated_create_org" ON public.organizations;
CREATE POLICY "authenticated_create_org" ON public.organizations
  FOR INSERT WITH CHECK (
    public.is_admin() 
    OR current_user = 'service_role'
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
  );

-- -----------------------------------------------------------------------------
-- 2. HARDEN WORKER PROFILES SELECT TENANCY (FINDING 3)
-- -----------------------------------------------------------------------------
-- Worker self-access strictly requires BOTH user_id = auth.uid() AND active membership.
DROP POLICY IF EXISTS "workers_and_admins_view_worker_profiles" ON public.worker_profiles;
CREATE POLICY "workers_and_admins_view_worker_profiles" ON public.worker_profiles
  FOR SELECT USING (
    (auth.uid() = user_id AND public.is_org_member(organization_id))
    OR public.is_org_admin(organization_id)
  );

-- -----------------------------------------------------------------------------
-- 3. ROLE ESCALATION & OWNERSHIP SECURITY TRIGGER (FINDING 1)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_org_member_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role public.org_role_enum;
  v_owner_count INTEGER;
  v_member_count INTEGER;
BEGIN
  -- Service role or platform superadmin bypasses
  IF current_user = 'service_role' 
     OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.is_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- 3.1 INSERT RULES
  IF TG_OP = 'INSERT' THEN
    -- Check if organization currently has 0 members (initial bootstrap via create_organization_with_owner)
    SELECT count(*) INTO v_member_count
    FROM public.organization_members
    WHERE organization_id = NEW.organization_id;

    IF v_member_count = 0 THEN
      -- Bootstrapping the first member: MUST be 'owner'
      IF NEW.role != 'owner' THEN
        RAISE EXCEPTION 'INVALID_OPERATION: The initial organization member must be an owner.';
      END IF;
      RETURN NEW;
    END IF;

    -- Resolve caller role in this organization
    SELECT role INTO v_caller_role
    FROM public.organization_members
    WHERE organization_id = NEW.organization_id
      AND user_id = v_caller_id;

    -- Admin cannot create an owner
    IF NEW.role = 'owner' AND v_caller_role != 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: Only organization owners can create owner memberships.';
    END IF;

    -- Only owner or admin can add members
    IF v_caller_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'FORBIDDEN: Insufficient permissions to add organization members.';
    END IF;

    RETURN NEW;
  END IF;

  -- 3.2 UPDATE RULES
  IF TG_OP = 'UPDATE' THEN
    -- Resolve caller role in this organization
    SELECT role INTO v_caller_role
    FROM public.organization_members
    WHERE organization_id = OLD.organization_id
      AND user_id = v_caller_id;

    -- Prevent altering core relationship keys
    IF NEW.organization_id != OLD.organization_id OR NEW.user_id != OLD.user_id THEN
      RAISE EXCEPTION 'INVALID_OPERATION: Cannot alter organization_id or user_id of an existing membership.';
    END IF;

    -- Role transition restrictions
    IF NEW.role != OLD.role THEN
      -- Admin cannot promote self or anyone else to owner
      IF NEW.role = 'owner' AND v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only organization owners can grant the owner role.';
      END IF;

      -- Admin cannot demote or alter an owner
      IF OLD.role = 'owner' AND v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'FORBIDDEN: Organization admins cannot modify owner memberships.';
      END IF;

      -- Prevent demoting the last owner
      IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
        SELECT count(*) INTO v_owner_count
        FROM public.organization_members
        WHERE organization_id = OLD.organization_id AND role = 'owner';

        IF v_owner_count <= 1 THEN
          RAISE EXCEPTION 'FORBIDDEN: Cannot demote the sole owner of the organization.';
        END IF;
      END IF;
    END IF;

    -- Workers cannot update memberships
    IF v_caller_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'FORBIDDEN: Workers cannot modify organization memberships.';
    END IF;

    RETURN NEW;
  END IF;

  -- 3.3 DELETE RULES
  IF TG_OP = 'DELETE' THEN
    -- Resolve caller role in this organization
    SELECT role INTO v_caller_role
    FROM public.organization_members
    WHERE organization_id = OLD.organization_id
      AND user_id = v_caller_id;

    -- Admin cannot delete an owner
    IF OLD.role = 'owner' AND v_caller_role != 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: Organization admins cannot delete owner memberships.';
    END IF;

    -- Prevent deleting the sole owner
    IF OLD.role = 'owner' THEN
      SELECT count(*) INTO v_owner_count
      FROM public.organization_members
      WHERE organization_id = OLD.organization_id AND role = 'owner';

      IF v_owner_count <= 1 THEN
        RAISE EXCEPTION 'FORBIDDEN: Cannot delete the sole owner of the organization.';
      END IF;
    END IF;

    -- Workers cannot delete memberships (except self-leave if permitted)
    IF v_caller_role NOT IN ('owner', 'admin') AND OLD.user_id != v_caller_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Workers cannot delete other organization memberships.';
    END IF;

    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_org_member_escalation ON public.organization_members;
CREATE TRIGGER trg_prevent_org_member_escalation
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_member_escalation();

-- -----------------------------------------------------------------------------
-- 4. ATOMIC OWNERSHIP TRANSFER RPC (FINDING 1)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_organization_ownership(
  p_organization_id UUID,
  p_new_owner_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role public.org_role_enum;
  v_target_exists BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required.';
  END IF;

  -- Authorize: Must be current owner or platform superadmin
  IF NOT public.is_admin() THEN
    SELECT role INTO v_caller_role
    FROM public.organization_members
    WHERE organization_id = p_organization_id AND user_id = v_caller_id;

    IF v_caller_role != 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: Only organization owners can transfer ownership.';
    END IF;
  END IF;

  -- Target user must be an active member of this organization
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id AND user_id = p_new_owner_user_id
  ) INTO v_target_exists;

  IF NOT v_target_exists THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Target user is not a member of this organization.';
  END IF;

  IF v_caller_id = p_new_owner_user_id THEN
    RETURN jsonb_build_object(
      'success', true,
      'organizationId', p_organization_id,
      'owner', p_new_owner_user_id,
      'message', 'User is already owner.'
    );
  END IF;

  -- Promote new owner
  UPDATE public.organization_members
  SET role = 'owner', updated_at = now()
  WHERE organization_id = p_organization_id AND user_id = p_new_owner_user_id;

  -- Demote previous owner to admin if caller was owner
  IF v_caller_role = 'owner' THEN
    UPDATE public.organization_members
    SET role = 'admin', updated_at = now()
    WHERE organization_id = p_organization_id AND user_id = v_caller_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'organizationId', p_organization_id,
    'previousOwner', v_caller_id,
    'newOwner', p_new_owner_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transfer_organization_ownership FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_organization_ownership TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. ASSIGNMENT LIFECYCLE INVARIANT ENFORCEMENT (FINDING 2)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_assignment_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  -- Service role bypasses
  IF current_user = 'service_role' 
     OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Immutable assignment identities
    IF NEW.organization_id != OLD.organization_id 
       OR NEW.job_id != OLD.job_id 
       OR NEW.worker_id != OLD.worker_id 
       OR NEW.assigned_by != OLD.assigned_by THEN
      RAISE EXCEPTION 'INVALID_OPERATION: Cannot alter assignment core identities (organization, job, worker, assigned_by).';
    END IF;

    -- Invariant: Terminal assignments cannot transition to assigned or in_progress
    IF OLD.status = 'completed' AND NEW.status != 'completed' THEN
      RAISE EXCEPTION 'INVALID_STATE_TRANSITION: Completed assignment is terminal and cannot change status.';
    END IF;

    IF OLD.status = 'skipped' AND NEW.status IN ('assigned', 'in_progress') THEN
      RAISE EXCEPTION 'INVALID_STATE_TRANSITION: Skipped assignment cannot be transitioned to %.', NEW.status;
    END IF;

    -- Direct jump from assigned to completed without in_progress is forbidden
    IF OLD.status = 'assigned' AND NEW.status = 'completed' THEN
      RAISE EXCEPTION 'INVALID_STATE_TRANSITION: Assignment must transition to in_progress before completed.';
    END IF;

    -- Worker mutation restrictions
    IF v_caller_id = OLD.worker_id THEN
      IF OLD.status IN ('completed', 'skipped') AND NEW.status != OLD.status THEN
        RAISE EXCEPTION 'FORBIDDEN: Workers cannot mutate terminal assignments.';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_assignment_lifecycle ON public.job_assignments;
CREATE TRIGGER trg_enforce_assignment_lifecycle
  BEFORE UPDATE ON public.job_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_lifecycle();
