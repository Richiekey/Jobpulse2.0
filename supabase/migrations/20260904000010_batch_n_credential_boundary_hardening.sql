-- Migration 0034: Batch N Surgical Security Remediation — Credential Boundary Hardening
-- Isolate OAuth secret material from public.user_integrations into public.integration_secrets
-- Enforce database-level immutability on integration identity and ownership fields

-- 1. Create public.integration_secrets table
CREATE TABLE IF NOT EXISTS public.integration_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.user_integrations(id) ON DELETE CASCADE,
  encrypted_refresh_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_auth_tag TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  key_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_integration_secrets_integration_id UNIQUE (integration_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_secrets_integration_id 
  ON public.integration_secrets(integration_id);

-- 2. Trigger for updated_at on integration_secrets
CREATE OR REPLACE FUNCTION public.set_integration_secrets_updated_at()
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

DROP TRIGGER IF EXISTS trg_integration_secrets_updated_at ON public.integration_secrets;
CREATE TRIGGER trg_integration_secrets_updated_at
  BEFORE UPDATE ON public.integration_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_integration_secrets_updated_at();

-- 3. Safely migrate any existing encrypted credentials from user_integrations to integration_secrets
DO $$
DECLARE
  v_source_count INT := 0;
  v_migrated_count INT := 0;
BEGIN
  SELECT COUNT(*) INTO v_source_count 
  FROM public.user_integrations 
  WHERE encrypted_refresh_token IS NOT NULL;

  IF v_source_count > 0 THEN
    INSERT INTO public.integration_secrets (
      integration_id,
      encrypted_refresh_token,
      token_iv,
      token_auth_tag,
      token_expires_at,
      key_version,
      created_at,
      updated_at
    )
    SELECT 
      id,
      encrypted_refresh_token,
      token_iv,
      token_auth_tag,
      token_expires_at,
      1,
      NOW(),
      NOW()
    FROM public.user_integrations
    WHERE encrypted_refresh_token IS NOT NULL
    ON CONFLICT (integration_id) DO UPDATE SET
      encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
      token_iv = EXCLUDED.token_iv,
      token_auth_tag = EXCLUDED.token_auth_tag,
      token_expires_at = EXCLUDED.token_expires_at,
      updated_at = NOW();

    SELECT COUNT(*) INTO v_migrated_count FROM public.integration_secrets;

    IF v_migrated_count < v_source_count THEN
      RAISE EXCEPTION 'Credential migration verification failed: expected % records, found %', v_source_count, v_migrated_count;
    END IF;
  END IF;
END;
$$;

-- 4. Drop legacy credential columns from public.user_integrations
ALTER TABLE public.user_integrations
  DROP COLUMN IF EXISTS encrypted_refresh_token,
  DROP COLUMN IF EXISTS token_iv,
  DROP COLUMN IF EXISTS token_auth_tag,
  DROP COLUMN IF EXISTS token_expires_at;

-- 5. Row Level Security for public.integration_secrets
-- Physical and logical isolation: default deny for anon and authenticated.
-- Only the trusted service_role can access integration_secrets.
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.integration_secrets FROM anon, authenticated;
GRANT ALL ON TABLE public.integration_secrets TO service_role;

-- 6. Enforce database-level immutability on integration identity and ownership fields
-- Prevents ordinary updates from mutating user_id, organization_id, or provider.
CREATE OR REPLACE FUNCTION public.enforce_integration_ownership_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Integration identity is immutable: user_id cannot be changed.';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Integration scope is immutable: organization_id cannot be changed.';
  END IF;

  IF NEW.provider IS DISTINCT FROM OLD.provider THEN
    RAISE EXCEPTION 'Integration provider is immutable.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_integration_ownership_immutability ON public.user_integrations;
CREATE TRIGGER trg_enforce_integration_ownership_immutability
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_integration_ownership_immutability();

-- 7. Record migration in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20260904180000', ARRAY['-- Batch N: Credential Boundary Hardening'], 'batch_n_credential_boundary_hardening')
ON CONFLICT (version) DO NOTHING;
