-- =============================================================================
-- Migration 0031: Batch M Final Storage-Boundary Hardening
-- =============================================================================
-- Purpose:
--   1. Enforce strict cryptographic/semantic binding between screenshot evidence 
--      and the specific organization, application, and authorized worker:
--      Expected pattern: verification-screenshots/{organization_id|personal}/{application_id}/...
--   2. Authoritative DB/RPC boundary enforcement:
--      - CHECK constraint on public.application_verifications enforcing storage path template.
--      - submit_application_verification() rejects cross-tenant, cross-application,
--        cross-verification, or un-scoped bucket paths.
--      - enforce_verification_organization_provenance() trigger enforces this at table level.
--   3. Storage RLS policy hardening:
--      - workers_upload_verification_screenshots verifies both folder[1] (org) and folder[2] (app).
--      - authorized_users_view_verification_screenshots verifies both folder[1] (org) and folder[2] (app).
--   4. Ensure anon EXECUTE privileges remain revoked on RPCs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. HARDEN TABLE CHECK CONSTRAINT: BIND SCREENSHOT URL TO ORG & APPLICATION
-- -----------------------------------------------------------------------------
ALTER TABLE public.application_verifications
  DROP CONSTRAINT IF EXISTS chk_app_verifications_storage_path;

ALTER TABLE public.application_verifications
  ADD CONSTRAINT chk_app_verifications_storage_path
  CHECK (
    (screenshot_url LIKE ('verification-screenshots/' || COALESCE(organization_id::text, 'personal') || '/' || application_id::text || '/%'))
    AND NOT (screenshot_url LIKE 'http://%' OR screenshot_url LIKE 'https://%')
    AND NOT (screenshot_url LIKE '%..%')
    AND (screenshot_url ~* '\.(png|jpe?g|webp|gif)$')
  );

-- -----------------------------------------------------------------------------
-- 2. HARDEN TRIGGER: ENFORCE APPLICATION, ORG & VERIFICATION BINDING
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_verification_organization_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app_org_id UUID;
  v_app_deleted_at TIMESTAMPTZ;
  v_expected_org_scope TEXT;
  v_expected_prefix TEXT;
  v_segment4 TEXT;
BEGIN
  SELECT organization_id, deleted_at INTO v_app_org_id, v_app_deleted_at
  FROM public.applications
  WHERE id = NEW.application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced application does not exist: %', NEW.application_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_app_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot create or modify verification for a deleted/archived application: %', NEW.application_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Auto-derive or enforce organization_id match
  IF NEW.organization_id IS NULL AND v_app_org_id IS NOT NULL THEN
    NEW.organization_id := v_app_org_id;
  ELSIF NEW.organization_id IS DISTINCT FROM v_app_org_id THEN
    RAISE EXCEPTION 'Organization provenance mismatch: verification organization (%) does not match application organization (%)',
      COALESCE(NEW.organization_id::text, 'null'), COALESCE(v_app_org_id::text, 'null')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Enforce deterministic storage boundary binding:
  -- Path MUST match: verification-screenshots/{organization_id|personal}/{application_id}/...
  v_expected_org_scope := COALESCE(v_app_org_id::text, 'personal');
  v_expected_prefix := 'verification-screenshots/' || v_expected_org_scope || '/' || NEW.application_id::text || '/';

  IF NEW.screenshot_url NOT LIKE v_expected_prefix || '%'
     OR NEW.screenshot_url LIKE '%..%'
     OR NEW.screenshot_url !~* '\.(png|jpe?g|webp|gif)$'
  THEN
    RAISE EXCEPTION 'Storage boundary violation: Screenshot path (%) does not belong to application (%) or organization context (%)',
      NEW.screenshot_url, NEW.application_id, v_expected_org_scope
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Cross-verification check: Cannot reuse a storage path already bound to another verification
  IF EXISTS (
    SELECT 1 FROM public.application_verifications
    WHERE screenshot_url = NEW.screenshot_url
      AND id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Storage boundary violation: Screenshot path (%) is already bound to another verification record',
      NEW.screenshot_url
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Cross-verification check: If path contains an embedded UUID segment, ensure it does not reference another verification
  v_segment4 := split_part(NEW.screenshot_url, '/', 4);
  IF v_segment4 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    IF EXISTS (
      SELECT 1 FROM public.application_verifications
      WHERE id = v_segment4::uuid
        AND id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'Storage boundary violation: Screenshot path contains verification ID (%) belonging to another verification',
        v_segment4
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. HARDEN AUTHORITATIVE SUBMISSION RPC: ENFORCE APPLICATION & ORG BINDING
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

  -- Cross-verification check: Reject paths already bound to a non-pending verification or different worker/app
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

  -- Insert verification record
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

-- -----------------------------------------------------------------------------
-- 4. HARDEN STORAGE RLS POLICIES FOR VERIFICATION SCREENSHOTS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "workers_upload_verification_screenshots" ON storage.objects;
CREATE POLICY "workers_upload_verification_screenshots" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'verification-screenshots'
    AND auth.role() = 'authenticated'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.applications a
        WHERE (
          -- Standard upload: name is {org_scope}/{app_id}/...
          (
            (storage.foldername(name))[1] = COALESCE(a.organization_id::text, 'personal')
            AND (storage.foldername(name))[2] = a.id::text
          )
          OR
          -- Explicit bucket prefix: name is verification-screenshots/{org_scope}/{app_id}/...
          (
            (storage.foldername(name))[1] = 'verification-screenshots'
            AND (storage.foldername(name))[2] = COALESCE(a.organization_id::text, 'personal')
            AND (storage.foldername(name))[3] = a.id::text
          )
        )
        AND a.deleted_at IS NULL
        AND (a.user_id = auth.uid() OR a.worker_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "authorized_users_view_verification_screenshots" ON storage.objects;
CREATE POLICY "authorized_users_view_verification_screenshots" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'verification-screenshots'
    AND auth.role() = 'authenticated'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.applications a
        WHERE (
          -- Standard view: name is {org_scope}/{app_id}/...
          (
            (storage.foldername(name))[1] = COALESCE(a.organization_id::text, 'personal')
            AND (storage.foldername(name))[2] = a.id::text
          )
          OR
          -- Explicit bucket prefix: name is verification-screenshots/{org_scope}/{app_id}/...
          (
            (storage.foldername(name))[1] = 'verification-screenshots'
            AND (storage.foldername(name))[2] = COALESCE(a.organization_id::text, 'personal')
            AND (storage.foldername(name))[3] = a.id::text
          )
        )
        AND a.deleted_at IS NULL
        AND (
          a.user_id = auth.uid()
          OR a.worker_id = auth.uid()
          OR (a.organization_id IS NOT NULL AND public.is_org_admin(a.organization_id))
        )
      )
    )
  );

-- End Migration 0031
