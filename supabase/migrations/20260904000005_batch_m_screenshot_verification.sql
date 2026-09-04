-- =============================================================================
-- Migration 0029: Batch M — Screenshot Verification & Evidence Storage
-- =============================================================================
-- Purpose:
--   1. Create verification_status_enum ('pending', 'verified', 'rejected').
--   2. Extend applications table with verification_status and performance index.
--   3. Create application_verifications table with ON DELETE RESTRICT foreign keys.
--   4. Enforce state integrity:
--      - Status-state constraint (pending has no reviewer; verified/rejected has reviewer).
--      - Reviewer notes length constraint (<= 1000 characters).
--      - Terminal state protection (no transition out of verified or rejected).
--      - Organization provenance consistency (must match application organization).
--      - Soft-deletion protection (no verifications on deleted applications).
--   5. Provide atomic RPCs for verification submission and review.
--   6. Expand application_events audit check constraint for verification events.
--   7. Configure private storage bucket verification-screenshots with strict RLS.
--   8. Configure strict Row Level Security (RLS) on application_verifications.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. VERIFICATION STATUS ENUM
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status_enum') THEN
    CREATE TYPE public.verification_status_enum AS ENUM ('pending', 'verified', 'rejected');
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. EXTEND APPLICATIONS TABLE
-- -----------------------------------------------------------------------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS verification_status public.verification_status_enum NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_applications_verification_status
  ON public.applications(verification_status);

-- -----------------------------------------------------------------------------
-- 3. APPLICATION VERIFICATIONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE RESTRICT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT,
  worker_id UUID NOT NULL REFERENCES auth.users(id),
  screenshot_url TEXT NOT NULL,
  status public.verification_status_enum NOT NULL DEFAULT 'pending',
  reviewer_id UUID REFERENCES auth.users(id),
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Reviewer notes character limit (max 1000)
  CONSTRAINT chk_app_verifications_reviewer_notes_len 
    CHECK (reviewer_notes IS NULL OR length(reviewer_notes) <= 1000),

  -- Database-level state integrity invariant:
  -- Pending state must NOT have reviewer info.
  -- Terminal (verified/rejected) state MUST have reviewer info.
  CONSTRAINT chk_app_verifications_status_state CHECK (
    (status = 'pending' AND reviewer_id IS NULL AND reviewed_at IS NULL)
    OR
    (status IN ('verified', 'rejected') AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

-- Performance & Query Indexes
CREATE INDEX IF NOT EXISTS idx_app_verifications_app_created 
  ON public.application_verifications(application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_verifications_org_status 
  ON public.application_verifications(organization_id, status, created_at DESC) 
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_verifications_worker 
  ON public.application_verifications(worker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_verifications_status 
  ON public.application_verifications(status, created_at DESC);

-- Idempotency protection indexes
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_verifications_pending_submission
  ON public.application_verifications(application_id, worker_id, screenshot_url)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_verifications_idempotency
  ON public.application_verifications(application_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. ORGANIZATION PROVENANCE & DELETION INTEGRITY TRIGGER
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_verification_provenance ON public.application_verifications;
CREATE TRIGGER trg_enforce_verification_provenance
  BEFORE INSERT OR UPDATE ON public.application_verifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verification_organization_provenance();

-- -----------------------------------------------------------------------------
-- 5. STATE MACHINE & FIELD IMMUTABILITY TRIGGER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_verification_state_machine()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Immutable core identity fields
    IF OLD.application_id IS DISTINCT FROM NEW.application_id THEN
      RAISE EXCEPTION 'application_id is immutable on application_verifications'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.worker_id IS DISTINCT FROM NEW.worker_id THEN
      RAISE EXCEPTION 'worker_id is immutable on application_verifications'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- Enforce terminal state: verified and rejected cannot be transitioned or modified
    IF OLD.status IN ('verified', 'rejected') THEN
      IF NEW.status IS DISTINCT FROM OLD.status OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id THEN
        RAISE EXCEPTION 'Terminal state transition prohibited: verification is already in terminal state (%)', OLD.status
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
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

DROP TRIGGER IF EXISTS trg_enforce_verification_state_machine ON public.application_verifications;
CREATE TRIGGER trg_enforce_verification_state_machine
  BEFORE UPDATE ON public.application_verifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verification_state_machine();

-- -----------------------------------------------------------------------------
-- 6. AUDIT EVENTS CHECK CONSTRAINT EXPANSION
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.application_events
    DROP CONSTRAINT IF EXISTS application_events_event_type_check;

  ALTER TABLE public.application_events
    ADD CONSTRAINT application_events_event_type_check
    CHECK (event_type IN (
      'created', 'applied', 'status_changed', 'assigned', 'reassigned', 
      'note_updated', 'details_updated', 'archived', 'note_added', 'comment_added',
      'verification_submitted', 'verification_approved', 'verification_rejected'
    ));
END $$;

-- -----------------------------------------------------------------------------
-- 7. ATOMIC VERIFICATION RPCS
-- -----------------------------------------------------------------------------

-- 7.1 Submit Application Verification (Atomic)
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

  IF p_screenshot_url IS NULL OR length(trim(p_screenshot_url)) = 0 THEN
    RAISE EXCEPTION 'Invalid screenshot URL: Screenshot URL cannot be empty.'
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

-- 7.2 Review Application Verification (Atomic)
CREATE OR REPLACE FUNCTION public.review_application_verification(
  p_verification_id UUID,
  p_status public.verification_status_enum,
  p_reviewer_notes TEXT DEFAULT NULL
)
RETURNS public.application_verifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_verif public.application_verifications;
  v_app RECORD;
  v_updated_verif public.application_verifications;
  v_event_type TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_status NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Invalid review status: Status must be verified or rejected.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_reviewer_notes IS NOT NULL AND length(p_reviewer_notes) > 1000 THEN
    RAISE EXCEPTION 'Reviewer notes exceed maximum allowed length of 1000 characters.'
      USING ERRCODE = 'string_data_right_truncation';
  END IF;

  -- Fetch verification
  SELECT * INTO v_verif
  FROM public.application_verifications
  WHERE id = p_verification_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification record not found: %', p_verification_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- State-machine check: Must be pending
  IF v_verif.status IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Terminal state transition prohibited: Verification is already %', v_verif.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Fetch application
  SELECT id, user_id, worker_id, organization_id, deleted_at, status, verification_status
  INTO v_app
  FROM public.applications
  WHERE id = v_verif.application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced application does not exist: %', v_verif.application_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_app.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot review verification for a deleted application: %', v_app.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Authorization check: Caller must be Org Admin of the application org, or platform admin
  IF NOT (
    (v_app.organization_id IS NOT NULL AND public.is_org_admin(v_app.organization_id))
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'Forbidden: Only organization administrators or platform administrators may review verifications.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Atomically update verification
  UPDATE public.application_verifications
  SET status = p_status,
      reviewer_id = v_caller_id,
      reviewer_notes = p_reviewer_notes,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_verification_id
  RETURNING * INTO v_updated_verif;

  -- Atomically synchronize application verification_status
  UPDATE public.applications
  SET verification_status = p_status,
      updated_at = now()
  WHERE id = v_app.id;

  -- Audit event insertion
  v_event_type := CASE 
    WHEN p_status = 'verified' THEN 'verification_approved'
    ELSE 'verification_rejected'
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
    v_app.id,
    v_app.organization_id,
    v_caller_id,
    'admin',
    v_event_type,
    v_app.status,
    v_app.status,
    jsonb_build_object(
      'verification_id', p_verification_id,
      'new_verification_status', p_status,
      'reviewer_notes', p_reviewer_notes,
      'reviewed_at', v_updated_verif.reviewed_at
    )
  );

  RETURN v_updated_verif;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES ON APPLICATION_VERIFICATIONS
-- -----------------------------------------------------------------------------
ALTER TABLE public.application_verifications ENABLE ROW LEVEL SECURITY;

-- 8.1 SELECT: Owner, Assigned Worker, Org Admin, Platform Admin
DROP POLICY IF EXISTS "authorized_users_view_application_verifications" ON public.application_verifications;
CREATE POLICY "authorized_users_view_application_verifications" ON public.application_verifications
  FOR SELECT USING (
    -- Service role or platform admin
    current_user = 'service_role'
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR public.is_admin()
    -- Submitting worker
    OR worker_id = auth.uid()
    -- Application owner or assigned worker
    OR EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_verifications.application_id
        AND (a.user_id = auth.uid() OR a.worker_id = auth.uid())
    )
    -- Organization Admin
    OR (
      organization_id IS NOT NULL 
      AND public.is_org_admin(organization_id)
    )
  );

-- 8.2 INSERT: Submitter must be authenticated user, authorized on application
DROP POLICY IF EXISTS "authorized_users_insert_application_verifications" ON public.application_verifications;
CREATE POLICY "authorized_users_insert_application_verifications" ON public.application_verifications
  FOR INSERT WITH CHECK (
    -- Service role or platform admin
    current_user = 'service_role'
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR public.is_admin()
    -- Submitting worker must be authenticated user
    OR (
      worker_id = auth.uid()
      AND status = 'pending'
      AND reviewer_id IS NULL
      AND reviewed_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.id = application_verifications.application_id
          AND a.deleted_at IS NULL
          AND (a.user_id = auth.uid() OR a.worker_id = auth.uid())
      )
    )
  );

-- 8.3 UPDATE: Only Organization Admin or Platform Admin can update verification
DROP POLICY IF EXISTS "org_admins_update_application_verifications" ON public.application_verifications;
CREATE POLICY "org_admins_update_application_verifications" ON public.application_verifications
  FOR UPDATE USING (
    -- Service role or platform admin
    current_user = 'service_role'
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR public.is_admin()
    -- Org Admin of the verification organization
    OR (
      organization_id IS NOT NULL 
      AND public.is_org_admin(organization_id)
    )
  ) WITH CHECK (
    current_user = 'service_role'
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR public.is_admin()
    OR (
      organization_id IS NOT NULL 
      AND public.is_org_admin(organization_id)
    )
  );

-- Notice: No DELETE policy is defined. Verifications are permanent records.

-- -----------------------------------------------------------------------------
-- 9. SUPABASE STORAGE BUCKET & STORAGE RLS POLICIES
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-screenshots',
  'verification-screenshots',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[];

-- Storage Policies for verification-screenshots
DROP POLICY IF EXISTS "workers_upload_verification_screenshots" ON storage.objects;
CREATE POLICY "workers_upload_verification_screenshots" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'verification-screenshots'
    AND auth.role() = 'authenticated'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.id::text = (storage.foldername(name))[2]
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
        WHERE a.id::text = (storage.foldername(name))[2]
          AND (
            a.user_id = auth.uid()
            OR a.worker_id = auth.uid()
            OR (a.organization_id IS NOT NULL AND public.is_org_admin(a.organization_id))
          )
      )
    )
  );

-- End Migration 0029
