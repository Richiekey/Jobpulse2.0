-- =============================================================================
-- Migration 0032: Batch M P2 Concurrency Hardening
-- =============================================================================
-- Purpose:
--   1. Enforce PostgreSQL-level uniqueness for screenshot storage paths:
--      One screenshot storage path may belong to at most one application_verifications record.
--   2. Make submit_application_verification() race-safe under concurrent submissions:
--      - Catches unique_violation.
--      - Returns existing record if this was an identical concurrent submission
--        (same worker, same application, same screenshot path, or matching idempotency key).
--      - Rejects if claimed by another worker, application, or terminal verification.
--   3. Maintain all existing Batch M invariants and privileges.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ADD DATABASE-LEVEL UNIQUE CONSTRAINT FOR SCREENSHOT STORAGE PATHS
-- -----------------------------------------------------------------------------
-- Ensure no duplicate screenshot_url can ever exist in public.application_verifications
ALTER TABLE public.application_verifications
  DROP CONSTRAINT IF EXISTS uq_app_verifications_screenshot_url;

ALTER TABLE public.application_verifications
  ADD CONSTRAINT uq_app_verifications_screenshot_url
  UNIQUE (screenshot_url);

-- -----------------------------------------------------------------------------
-- 2. HARDEN SUBMIT RPC: CONCURRENCY RACE-SAFETY & IDEMPOTENCY RESOLUTION
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_application_verification(
  p_application_id UUID,
  p_screenshot_url TEXT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS public.application_verifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_app RECORD;
  v_existing public.application_verifications;
  v_new_verif public.application_verifications;
  v_actor_type TEXT;
  v_expected_org_scope TEXT;
  v_expected_prefix TEXT;
  v_segment4 TEXT;
  v_custom_verif_id UUID := NULL;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Fetch application to establish authoritative boundaries
  SELECT id, user_id, worker_id, organization_id, deleted_at, status
  INTO v_app
  FROM public.applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found: %', p_application_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_app.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot submit verification for a deleted application: %', p_application_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Authorization check: Caller must be owner, assigned worker, or platform admin
  IF NOT (
    v_app.user_id = v_caller_id
    OR (v_app.worker_id IS NOT NULL AND v_app.worker_id = v_caller_id)
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'Forbidden: You are not authorized to submit verification for this application.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Enforce deterministic storage boundary binding:
  -- Path MUST match: verification-screenshots/{organization_id|personal}/{application_id}/...
  v_expected_org_scope := COALESCE(v_app.organization_id::text, 'personal');
  v_expected_prefix := 'verification-screenshots/' || v_expected_org_scope || '/' || v_app.id::text || '/';

  IF p_screenshot_url IS NULL 
     OR length(trim(p_screenshot_url)) = 0
     OR p_screenshot_url LIKE 'http://%'
     OR p_screenshot_url LIKE 'https://%'
     OR p_screenshot_url NOT LIKE v_expected_prefix || '%'
     OR p_screenshot_url LIKE '%..%'
     OR p_screenshot_url !~* '\.(png|jpe?g|webp|gif)$'
  THEN
    RAISE EXCEPTION 'Storage boundary violation: Screenshot evidence must be a private storage path matching %, ending with .png, .jpg, .jpeg, .webp, or .gif', v_expected_prefix
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Pre-insertion check: Reject paths already bound to a non-pending verification or different worker/app
  IF EXISTS (
    SELECT 1 FROM public.application_verifications
    WHERE screenshot_url = p_screenshot_url
      AND (
        status != 'pending' 
        OR worker_id != v_caller_id 
        OR application_id != p_application_id
      )
  ) THEN
    RAISE EXCEPTION 'Storage boundary violation: Screenshot path (%) is already bound to another verification record', p_screenshot_url
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Cross-verification check: If path contains an embedded UUID segment, ensure it does not reference another verification
  v_segment4 := split_part(p_screenshot_url, '/', 4);
  IF v_segment4 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    IF EXISTS (
      SELECT 1 FROM public.application_verifications
      WHERE id = v_segment4::uuid
        AND (
          status != 'pending'
          OR worker_id != v_caller_id
          OR application_id != p_application_id
        )
    ) THEN
      RAISE EXCEPTION 'Storage boundary violation: Screenshot path contains verification ID (%) belonging to another verification', v_segment4
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_custom_verif_id := v_segment4::uuid;
  END IF;

  -- Idempotency Check: By idempotency_key
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.application_verifications
    WHERE application_id = p_application_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- Idempotency Check: By identical pending submission
  SELECT * INTO v_existing
  FROM public.application_verifications
  WHERE application_id = p_application_id 
    AND worker_id = v_caller_id 
    AND screenshot_url = p_screenshot_url
    AND status = 'pending';

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Insert verification record with concurrency race safety (handling parallel execution)
  BEGIN
    INSERT INTO public.application_verifications (
      id,
      application_id,
      organization_id,
      worker_id,
      screenshot_url,
      status,
      idempotency_key
    ) VALUES (
      COALESCE(v_custom_verif_id, gen_random_uuid()),
      p_application_id,
      v_app.organization_id,
      v_caller_id,
      p_screenshot_url,
      'pending',
      p_idempotency_key
    )
    RETURNING * INTO v_new_verif;
  EXCEPTION
    WHEN unique_violation THEN
      -- Resolve concurrent race:
      -- 1. If matching pending submission was committed concurrently by same worker
      SELECT * INTO v_existing
      FROM public.application_verifications
      WHERE application_id = p_application_id 
        AND worker_id = v_caller_id 
        AND screenshot_url = p_screenshot_url
        AND status = 'pending';

      IF FOUND THEN
        RETURN v_existing;
      END IF;

      -- 2. If matching idempotency key was committed concurrently
      IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.application_verifications
        WHERE application_id = p_application_id AND idempotency_key = p_idempotency_key;

        IF FOUND THEN
          RETURN v_existing;
        END IF;
      END IF;

      -- 3. Otherwise, reject as unauthorized concurrent duplicate claim
      RAISE EXCEPTION 'Storage boundary violation: Screenshot path (%) is already claimed by another verification record', p_screenshot_url
        USING ERRCODE = 'unique_violation';
  END;

  -- Synchronize application verification_status
  UPDATE public.applications
  SET verification_status = 'pending',
      updated_at = now()
  WHERE id = p_application_id;

  -- Authoritative audit event insertion
  v_actor_type := CASE 
    WHEN v_caller_id = v_app.worker_id THEN 'worker'
    WHEN public.is_admin() THEN 'admin'
    ELSE 'user'
  END;

  INSERT INTO public.application_events (
    application_id,
    organization_id,
    actor_id,
    actor_type,
    event_type,
    from_status,
    to_status,
    metadata
  ) VALUES (
    p_application_id,
    v_app.organization_id,
    v_caller_id,
    v_actor_type,
    'verification_submitted',
    v_app.status,
    v_app.status,
    jsonb_build_object(
      'verification_id', v_new_verif.id,
      'screenshot_url', p_screenshot_url,
      'idempotency_key', p_idempotency_key
    )
  );

  RETURN v_new_verif;
END;
$$;

-- Maintain restricted EXECUTE privileges
REVOKE ALL ON FUNCTION public.submit_application_verification(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_application_verification(UUID, TEXT, TEXT) TO authenticated, service_role;

-- End Migration 0032
