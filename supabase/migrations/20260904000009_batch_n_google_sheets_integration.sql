-- Migration 0033: Batch N - Google Sheets Integration & Token Security
-- Extends public.user_integrations with organization scoping, AES-256-GCM encrypted token storage,
-- lifecycle timestamps, granular RLS, and updated_at triggers.

-- 1. Extend user_integrations columns
ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS encrypted_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS token_iv TEXT,
  ADD COLUMN IF NOT EXISTS token_auth_tag TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- 2. Drop restrictive (user_id, provider) unique constraint if present to allow both personal and org integrations
ALTER TABLE public.user_integrations DROP CONSTRAINT IF EXISTS uq_user_provider;

-- 3. Add separate unique constraints for personal and organization integrations
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_personal_provider 
  ON public.user_integrations (user_id, provider) 
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_provider 
  ON public.user_integrations (organization_id, provider) 
  WHERE organization_id IS NOT NULL;

-- 4. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_user_integrations_org_provider 
  ON public.user_integrations (organization_id, provider);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user_provider 
  ON public.user_integrations (user_id, provider);

-- 5. Updated_at trigger function and trigger
CREATE OR REPLACE FUNCTION public.set_user_integrations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_integrations_updated_at ON public.user_integrations;
CREATE TRIGGER trg_user_integrations_updated_at
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_integrations_updated_at();

-- 6. Granular Row Level Security
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their integrations" ON public.user_integrations;
DROP POLICY IF EXISTS "user_integrations_select_policy" ON public.user_integrations;
DROP POLICY IF EXISTS "user_integrations_insert_policy" ON public.user_integrations;
DROP POLICY IF EXISTS "user_integrations_update_policy" ON public.user_integrations;
DROP POLICY IF EXISTS "user_integrations_delete_policy" ON public.user_integrations;

-- SELECT: Users can view their own personal integrations OR integrations for orgs where they are members
CREATE POLICY "user_integrations_select_policy"
  ON public.user_integrations
  FOR SELECT
  USING (
    (auth.uid() = user_id)
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()))
  );

-- INSERT: Users can insert their own personal integrations OR org admins can insert org integrations
CREATE POLICY "user_integrations_insert_policy"
  ON public.user_integrations
  FOR INSERT
  WITH CHECK (
    (auth.uid() = user_id)
    AND (
      organization_id IS NULL 
      OR public.is_org_admin(organization_id, auth.uid())
    )
  );

-- UPDATE: Users can update their own personal integrations OR org admins can update org integrations
CREATE POLICY "user_integrations_update_policy"
  ON public.user_integrations
  FOR UPDATE
  USING (
    (auth.uid() = user_id AND organization_id IS NULL)
    OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id, auth.uid()))
  )
  WITH CHECK (
    (auth.uid() = user_id AND organization_id IS NULL)
    OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id, auth.uid()))
  );

-- DELETE: Users can delete their own personal integrations OR org admins can delete org integrations
CREATE POLICY "user_integrations_delete_policy"
  ON public.user_integrations
  FOR DELETE
  USING (
    (auth.uid() = user_id AND organization_id IS NULL)
    OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id, auth.uid()))
  );
