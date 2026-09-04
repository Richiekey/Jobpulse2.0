-- =============================================================================
-- Migration 0025: Batch K — Workforce & Organization Architecture
-- =============================================================================
-- Purpose:
--   1. Create org_role_enum and assignment_status_enum
--   2. Create organizations, organization_members, worker_profiles, job_assignments
--   3. Extend profiles and applications with tenancy columns
--   4. Implement helper functions for tenant role verification
--   5. Implement atomic create_organization RPC
--   6. Enforce strict multi-tenant Row Level Security (RLS)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role_enum') THEN
    CREATE TYPE public.org_role_enum AS ENUM ('owner', 'admin', 'worker');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignment_status_enum') THEN
    CREATE TYPE public.assignment_status_enum AS ENUM ('assigned', 'in_progress', 'completed', 'skipped');
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. ORGANIZATIONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  domain TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. ORGANIZATION MEMBERS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role_enum NOT NULL DEFAULT 'worker',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_member UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_role ON public.organization_members(organization_id, role);

-- -----------------------------------------------------------------------------
-- 4. WORKER PROFILES TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worker_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cv_url TEXT,
  resumes JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills TEXT[] NOT NULL DEFAULT '{}'::text[],
  experience_years NUMERIC(4,1),
  education JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_roles TEXT[] NOT NULL DEFAULT '{}'::text[],
  preferred_locations TEXT[] NOT NULL DEFAULT '{}'::text[],
  availability TEXT NOT NULL DEFAULT 'immediate',
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_worker_profile UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_profiles_org ON public.worker_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_worker_profiles_user ON public.worker_profiles(user_id);

-- -----------------------------------------------------------------------------
-- 5. JOB ASSIGNMENTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status public.assignment_status_enum NOT NULL DEFAULT 'assigned',
  deadline_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_job_worker UNIQUE (organization_id, job_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_job_assignments_worker ON public.job_assignments(worker_id, status);
CREATE INDEX IF NOT EXISTS idx_job_assignments_org ON public.job_assignments(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_job_assignments_job ON public.job_assignments(job_id);

-- -----------------------------------------------------------------------------
-- 6. EXTEND EXISTING TABLES FOR TENANCY
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS worker_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applications_org ON public.applications(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_worker ON public.applications(worker_id) WHERE worker_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 7. HELPER FUNCTIONS FOR TENANT AUTHORIZATION (SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- Helper: Check if user is a member of the organization
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id AND user_id = p_user_id
  ) OR public.is_admin();
$$;

-- Helper: Check if user is an admin or owner of the organization
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = p_user_id
      AND role IN ('owner', 'admin')
  ) OR public.is_admin();
$$;

-- Helper: Get list of organization IDs a user belongs to
CREATE OR REPLACE FUNCTION public.get_user_org_ids(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (organization_id UUID, role public.org_role_enum)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id, role
  FROM public.organization_members
  WHERE user_id = p_user_id;
$$;

-- -----------------------------------------------------------------------------
-- 8. ATOMIC RPC: CREATE ORGANIZATION & ASSIGN OWNER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_name TEXT,
  p_slug TEXT,
  p_domain TEXT DEFAULT NULL,
  p_logo_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_clean_name TEXT := trim(p_name);
  v_clean_slug TEXT := lower(trim(p_slug));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required to create an organization.';
  END IF;

  IF length(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Organization name must be at least 2 characters.';
  END IF;

  IF length(v_clean_slug) < 2 OR v_clean_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Organization slug must contain only lowercase alphanumeric characters and hyphens.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_clean_slug) THEN
    RAISE EXCEPTION 'CONFLICT: Organization slug is already in use.';
  END IF;

  INSERT INTO public.organizations (name, slug, domain, logo_url)
  VALUES (v_clean_name, v_clean_slug, p_domain, p_logo_url)
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  -- Also update creator current_organization_id if not currently set
  UPDATE public.profiles
  SET current_organization_id = v_org_id, updated_at = now()
  WHERE id = v_user_id AND current_organization_id IS NULL;

  RETURN jsonb_build_object(
    'id', v_org_id,
    'name', v_clean_name,
    'slug', v_clean_slug,
    'role', 'owner'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_organization_with_owner FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY POLICIES
-- -----------------------------------------------------------------------------

-- 9.1 Organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_view_org" ON public.organizations;
CREATE POLICY "org_members_view_org" ON public.organizations
  FOR SELECT USING (public.is_org_member(id));

DROP POLICY IF EXISTS "authenticated_create_org" ON public.organizations;
CREATE POLICY "authenticated_create_org" ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "org_admins_update_org" ON public.organizations;
CREATE POLICY "org_admins_update_org" ON public.organizations
  FOR UPDATE USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

-- 9.2 Organization Members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_view_members" ON public.organization_members;
CREATE POLICY "org_members_view_members" ON public.organization_members
  FOR SELECT USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "org_admins_manage_members" ON public.organization_members;
CREATE POLICY "org_admins_manage_members" ON public.organization_members
  FOR INSERT WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "org_admins_update_members" ON public.organization_members;
CREATE POLICY "org_admins_update_members" ON public.organization_members
  FOR UPDATE USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "org_admins_delete_members" ON public.organization_members;
CREATE POLICY "org_admins_delete_members" ON public.organization_members
  FOR DELETE USING (public.is_org_admin(organization_id));

-- 9.3 Worker Profiles
ALTER TABLE public.worker_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workers_and_admins_view_worker_profiles" ON public.worker_profiles;
CREATE POLICY "workers_and_admins_view_worker_profiles" ON public.worker_profiles
  FOR SELECT USING (
    auth.uid() = user_id OR public.is_org_admin(organization_id)
  );

DROP POLICY IF EXISTS "workers_insert_own_profile" ON public.worker_profiles;
CREATE POLICY "workers_insert_own_profile" ON public.worker_profiles
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND public.is_org_member(organization_id)
  );

DROP POLICY IF EXISTS "workers_and_admins_update_worker_profile" ON public.worker_profiles;
CREATE POLICY "workers_and_admins_update_worker_profile" ON public.worker_profiles
  FOR UPDATE USING (
    (auth.uid() = user_id AND public.is_org_member(organization_id)) OR public.is_org_admin(organization_id)
  )
  WITH CHECK (
    (auth.uid() = user_id AND public.is_org_member(organization_id)) OR public.is_org_admin(organization_id)
  );

DROP POLICY IF EXISTS "org_admins_delete_worker_profile" ON public.worker_profiles;
CREATE POLICY "org_admins_delete_worker_profile" ON public.worker_profiles
  FOR DELETE USING (public.is_org_admin(organization_id));

-- 9.4 Job Assignments
ALTER TABLE public.job_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workers_and_admins_view_assignments" ON public.job_assignments;
CREATE POLICY "workers_and_admins_view_assignments" ON public.job_assignments
  FOR SELECT USING (
    auth.uid() = worker_id OR public.is_org_admin(organization_id)
  );

DROP POLICY IF EXISTS "org_admins_create_assignments" ON public.job_assignments;
CREATE POLICY "org_admins_create_assignments" ON public.job_assignments
  FOR INSERT WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "workers_and_admins_update_assignments" ON public.job_assignments;
CREATE POLICY "workers_and_admins_update_assignments" ON public.job_assignments
  FOR UPDATE USING (
    (auth.uid() = worker_id) OR public.is_org_admin(organization_id)
  )
  WITH CHECK (
    (auth.uid() = worker_id) OR public.is_org_admin(organization_id)
  );

DROP POLICY IF EXISTS "org_admins_delete_assignments" ON public.job_assignments;
CREATE POLICY "org_admins_delete_assignments" ON public.job_assignments
  FOR DELETE USING (public.is_org_admin(organization_id));

-- 9.5 Extended Applications Policies for Tenancy
DROP POLICY IF EXISTS "org_admins_view_org_applications" ON public.applications;
CREATE POLICY "org_admins_view_org_applications" ON public.applications
  FOR SELECT USING (
    organization_id IS NOT NULL AND public.is_org_admin(organization_id)
  );

DROP POLICY IF EXISTS "workers_view_assigned_applications" ON public.applications;
CREATE POLICY "workers_view_assigned_applications" ON public.applications
  FOR SELECT USING (
    worker_id IS NOT NULL AND auth.uid() = worker_id
  );
