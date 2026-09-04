-- =============================================================================
-- Migration 0030: Batch M Remediation — Storage Path Enforcement, Terminal Immutability & Privilege Hardening
-- =============================================================================
-- Purpose:
--   1. Make screenshot evidence storage-only:
--      - Enforce that screenshot_url must be a path within 'verification-screenshots/'
--      - Strictly reject http://, https://, path traversal, and non-image extensions
--   2. Make terminal verification records truly immutable:
--      - When status is 'verified' or 'rejected', forbid any update to any column
--      - Enforce immutability of identity/evidence fields while pending
--   3. Remove anonymous EXECUTE access on verification RPCs:
--      - Revoke EXECUTE from PUBLIC and anon on submit_application_verification and review_application_verification
--      - Grant EXECUTE only to authenticated and service_role
--   4. Remove broad admin direct UPDATE escape hatch:
--      - Drop org_admins_update_application_verifications policy
--      - Direct client UPDATE on application_verifications is completely denied
--      - All review state transitions must execute through review_application_verification RPC
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENFORCE STORAGE-ONLY SCREENSHOT PATHS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  -- Add check constraint enforcing private storage bucket path
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_app_verifications_storage_path'
  ) THEN
    ALTER TABLE public.application_verifications
      ADD CONSTRAINT chk_app_verifications_storage_path CHECK (
        screenshot_url LIKE 'verification-screenshots/%'
        AND NOT (screenshot_url LIKE 'http://%' OR screenshot_url LIKE 'https://%')
        AND screenshot_url NOT LIKE '%..%'
        AND screenshot_url ~* '\.(png|jpe?g|webp|gif)$'
      );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. HARDEN SUBMIT RPC TO REJECT EXTERNAL URLS & REQUIRE STORAGE PATH
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
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Strictly reject empty, external HTTP(S) URLs, path traversals, or paths outside verification-screenshots/
  IF p_screenshot_url IS NULL 
     OR length(trim(p_screenshot_url)) = 0
     OR p_screenshot_url LIKE 'http://%'
     OR p_screenshot_url LIKE 'https://%'
     OR p_screenshot_url NOT LIKE 'verification-screenshots/%'
     OR p_screenshot_url LIKE '%..%'
     OR p_screenshot_url !~* '\.(png|jpe?g|webp|gif)$'
  THEN
    RAISE EXCEPTION 'Invalid screenshot evidence: Evidence must be a valid storage path located within verification-screenshots/ ending with .png, .jpg, .jpeg, .webp, or .gif'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Verify application existence, access, and soft-delete state
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

  -- Insert verification record
  INSERT INTO public.application_verifications (
    application_id,
    organization_id,
    worker_id,
    screenshot_url,
    status,
    idempotency_key
  ) VALUES (
    p_application_id,
    v_app.organization_id,
    v_caller_id,
    p_screenshot_url,
    'pending',
    p_idempotency_key
  )
  RETURNING * INTO v_new_verif;

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

-- -----------------------------------------------------------------------------
-- 3. HARDEN TERMINAL IMMUTABILITY TRIGGER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_verification_state_machine()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Complete immutability once terminal: verified or rejected records CANNOT be mutated
    IF OLD.status IN ('verified', 'rejected') THEN
      RAISE EXCEPTION 'Terminal state immutability violation: Verification record is already % and cannot be modified or updated.', OLD.status
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- Immutable fields while pending
    IF OLD.application_id IS DISTINCT FROM NEW.application_id THEN
      RAISE EXCEPTION 'application_id is immutable on application_verifications'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.worker_id IS DISTINCT FROM NEW.worker_id THEN
      RAISE EXCEPTION 'worker_id is immutable on application_verifications'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'organization_id is immutable on application_verifications'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.screenshot_url IS DISTINCT FROM NEW.screenshot_url THEN
      RAISE EXCEPTION 'screenshot_url is immutable on application_verifications'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key THEN
      RAISE EXCEPTION 'idempotency_key is immutable on application_verifications'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- Enforce valid transitions from pending
    IF OLD.status = 'pending' AND NEW.status NOT IN ('pending', 'verified', 'rejected') THEN
      RAISE EXCEPTION 'Invalid verification status transition from pending to %', NEW.status
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. REVOKE ANONYMOUS EXECUTE PRIVILEGES ON RPCS
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.submit_application_verification(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_application_verification(UUID, public.verification_status_enum, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_application_verification(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_application_verification(UUID, public.verification_status_enum, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. REMOVE DIRECT CLIENT UPDATE ESCAPE HATCH
-- -----------------------------------------------------------------------------
-- Drop direct client update policy. Direct client UPDATE on application_verifications is forbidden.
-- Reviews must go through review_application_verification() RPC.
DROP POLICY IF EXISTS "org_admins_update_application_verifications" ON public.application_verifications;

-- End Migration 0030
