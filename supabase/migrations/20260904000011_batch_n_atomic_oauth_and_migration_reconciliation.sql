-- Migration 0035: Batch N Final Surgical Remediation — Atomic OAuth Upsert & Record-by-Record Reconciliation
-- Ensures integration metadata and OAuth secrets are created/updated in a single atomic database transaction.
-- Enforces record-by-record reconciliation guarantees on integration secrets.

-- 1. Create atomic integration & secret upsert RPC
CREATE OR REPLACE FUNCTION public.upsert_user_integration_with_secret(
  p_user_id UUID,
  p_organization_id UUID,
  p_provider TEXT,
  p_config JSONB,
  p_encrypted_refresh_token TEXT,
  p_token_iv TEXT,
  p_token_auth_tag TEXT,
  p_token_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_key_version INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_service_role BOOLEAN := (auth.role() = 'service_role');
  v_existing_id UUID;
  v_existing_secret_id UUID;
  v_res JSONB;
BEGIN
  -- 1. Authorization check
  IF NOT v_is_service_role THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF v_caller_id != p_user_id THEN
      RAISE EXCEPTION 'Forbidden: User identity mismatch.';
    END IF;

    IF p_organization_id IS NOT NULL AND NOT public.is_org_admin(p_organization_id, v_caller_id) THEN
      RAISE EXCEPTION 'Forbidden: Organization administrator privileges required.';
    END IF;
  END IF;

  -- 2. Find existing integration for this user/org and provider
  IF p_organization_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.user_integrations
    WHERE organization_id = p_organization_id AND provider = p_provider
    LIMIT 1;
  ELSE
    SELECT id INTO v_existing_id
    FROM public.user_integrations
    WHERE user_id = p_user_id AND organization_id IS NULL AND provider = p_provider
    LIMIT 1;
  END IF;

  -- 3. Atomic Invariant Handling
  IF v_existing_id IS NULL THEN
    -- NEW INTEGRATION: Durable refresh token is mandatory
    IF p_encrypted_refresh_token IS NULL OR p_token_iv IS NULL OR p_token_auth_tag IS NULL THEN
      RAISE EXCEPTION 'Cannot activate new Google integration without durable credentials.';
    END IF;

    -- Insert metadata into user_integrations
    INSERT INTO public.user_integrations (
      user_id,
      organization_id,
      provider,
      config,
      is_active,
      last_error,
      created_at,
      updated_at
    ) VALUES (
      p_user_id,
      p_organization_id,
      p_provider,
      p_config,
      true,
      null,
      NOW(),
      NOW()
    ) RETURNING id INTO v_existing_id;

    -- Insert isolated secret into integration_secrets
    INSERT INTO public.integration_secrets (
      integration_id,
      encrypted_refresh_token,
      token_iv,
      token_auth_tag,
      token_expires_at,
      key_version,
      created_at,
      updated_at
    ) VALUES (
      v_existing_id,
      p_encrypted_refresh_token,
      p_token_iv,
      p_token_auth_tag,
      p_token_expires_at,
      COALESCE(p_key_version, 1),
      NOW(),
      NOW()
    );

  ELSE
    -- EXISTING INTEGRATION: Check existing secret record
    SELECT id INTO v_existing_secret_id
    FROM public.integration_secrets
    WHERE integration_id = v_existing_id;

    -- If a new refresh token is provided, update or upsert secret
    IF p_encrypted_refresh_token IS NOT NULL THEN
      INSERT INTO public.integration_secrets (
        integration_id,
        encrypted_refresh_token,
        token_iv,
        token_auth_tag,
        token_expires_at,
        key_version,
        created_at,
        updated_at
      ) VALUES (
        v_existing_id,
        p_encrypted_refresh_token,
        p_token_iv,
        p_token_auth_tag,
        p_token_expires_at,
        COALESCE(p_key_version, 1),
        NOW(),
        NOW()
      )
      ON CONFLICT (integration_id) DO UPDATE SET
        encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
        token_iv = EXCLUDED.token_iv,
        token_auth_tag = EXCLUDED.token_auth_tag,
        token_expires_at = EXCLUDED.token_expires_at,
        key_version = EXCLUDED.key_version,
        updated_at = NOW();
    ELSE
      -- Google omitted refresh_token (re-consent): preserve existing secret if present
      IF v_existing_secret_id IS NULL THEN
        RAISE EXCEPTION 'Cannot re-activate existing Google integration: missing durable credentials.';
      END IF;
    END IF;

    -- Update metadata in user_integrations
    UPDATE public.user_integrations
    SET
      config = p_config,
      is_active = true,
      last_error = null,
      updated_at = NOW()
    WHERE id = v_existing_id;

  END IF;

  -- 4. Return sanitized public integration record
  SELECT json_build_object(
    'id', id,
    'user_id', user_id,
    'organization_id', organization_id,
    'provider', provider,
    'config', config,
    'is_active', is_active,
    'last_synced_at', last_synced_at,
    'last_error', last_error,
    'created_at', created_at,
    'updated_at', updated_at
  )::jsonb INTO v_res
  FROM public.user_integrations
  WHERE id = v_existing_id;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_user_integration_with_secret FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_user_integration_with_secret TO authenticated, service_role;

-- 2. Record-by-Record Migration Reconciliation
DO $$
DECLARE
  r RECORD;
  v_orphan_count INT := 0;
  v_dup_count INT := 0;
BEGIN
  -- Invariant 1: Every active google_sheets integration MUST have exactly one secret
  FOR r IN 
    SELECT ui.id, ui.user_id, ui.organization_id 
    FROM public.user_integrations ui
    LEFT JOIN public.integration_secrets s ON ui.id = s.integration_id
    WHERE ui.is_active = true AND ui.provider = 'google_sheets' AND s.id IS NULL
  LOOP
    RAISE EXCEPTION 'Reconciliation failure: Active integration % (user: %, org: %) lacks corresponding integration_secrets record.',
      r.id, r.user_id, r.organization_id;
  END LOOP;

  -- Invariant 2: No orphan secrets exist without a parent integration
  SELECT COUNT(*) INTO v_orphan_count
  FROM public.integration_secrets s
  LEFT JOIN public.user_integrations ui ON s.integration_id = ui.id
  WHERE ui.id IS NULL;

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION 'Reconciliation failure: Found % orphan integration_secrets records.', v_orphan_count;
  END IF;

  -- Invariant 3: No duplicate secrets per integration_id
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT integration_id 
    FROM public.integration_secrets 
    GROUP BY integration_id 
    HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Reconciliation failure: Found % integration_id entries with duplicate secrets.', v_dup_count;
  END IF;

  -- Invariant 4: Check parent integration validity
  FOR r IN
    SELECT s.id as secret_id, s.integration_id, ui.user_id, ui.provider
    FROM public.integration_secrets s
    JOIN public.user_integrations ui ON s.integration_id = ui.id
    WHERE ui.user_id IS NULL OR ui.provider IS NULL
  LOOP
    RAISE EXCEPTION 'Reconciliation failure: Secret % has malformed parent integration %.', r.secret_id, r.integration_id;
  END LOOP;
END;
$$;

-- 3. Record migration in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20260904220000', ARRAY['-- Batch N: Atomic OAuth Upsert & Record-by-Record Reconciliation'], 'batch_n_atomic_oauth_and_migration_reconciliation')
ON CONFLICT (version) DO NOTHING;
