-- ============================================================================
-- JobPulse 2.0 — Batch O Remediation: Fencing, Leases, State Guards & Backfill
-- Version: 20260904250000
-- Description: Hardens sync_events queue against concurrency races, stale workers,
--              stuck processing events, and payload overwrite races.
--              Adds claim_token, processing_started_at, pending_payload,
--              manual_retry_count, lease recovery, and application backfill.
-- ============================================================================

-- 1. Alter sync_events table with remediation columns
ALTER TABLE public.sync_events
  ADD COLUMN IF NOT EXISTS claim_token UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pending_payload JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS manual_retry_count INT NOT NULL DEFAULT 0;

-- 2. Indexes
-- Update unique active application index to include 'failed' so active/retryable events coalesce
DROP INDEX IF EXISTS public.uq_sync_events_active_application;
CREATE UNIQUE INDEX uq_sync_events_active_application 
  ON public.sync_events(application_id) 
  WHERE (status IN ('pending', 'processing', 'failed'));

-- Stale processing index for fast recovery scans
CREATE INDEX IF NOT EXISTS idx_sync_events_stale_processing 
  ON public.sync_events(processing_started_at) 
  WHERE (status = 'processing');

-- 3. Stale Processing Lease Recovery RPC
CREATE OR REPLACE FUNCTION public.recover_stale_sync_events(p_lease_seconds INT DEFAULT 300)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recovered_count INT := 0;
BEGIN
  WITH stale AS (
    SELECT id
    FROM public.sync_events
    WHERE status = 'processing'
      AND processing_started_at IS NOT NULL
      AND processing_started_at < NOW() - (p_lease_seconds * interval '1 second')
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sync_events target
  SET status = CASE 
        WHEN target.attempts >= target.max_attempts THEN 'dead_letter'::public.sync_event_status_enum 
        ELSE 'failed'::public.sync_event_status_enum 
      END,
      claim_token = NULL,
      processing_started_at = NULL,
      next_retry_at = CASE 
        WHEN target.attempts >= target.max_attempts THEN NOW() + interval '365 days' 
        ELSE NOW() + interval '30 seconds' 
      END,
      last_error = 'Processing lease expired (worker timeout/crash)',
      payload = COALESCE(target.pending_payload, target.payload),
      pending_payload = NULL,
      updated_at = NOW()
  FROM stale
  WHERE target.id = stale.id;

  GET DIAGNOSTICS v_recovered_count = ROW_COUNT;
  RETURN v_recovered_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stale_sync_events(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_sync_events(INT) TO service_role;

-- 4. Guarded Queue Claiming RPC with Fencing Token & Bounded Batch Size
DROP FUNCTION IF EXISTS public.claim_next_pending_sync_events(INT);
CREATE OR REPLACE FUNCTION public.claim_next_pending_sync_events(p_batch_size INT DEFAULT 10)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  organization_id UUID,
  application_id UUID,
  integration_id UUID,
  provider TEXT,
  status public.sync_event_status_enum,
  attempts INT,
  max_attempts INT,
  payload JSONB,
  claim_token UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_effective_batch INT;
BEGIN
  -- Bound batch size: minimum 1, maximum 100
  IF p_batch_size < 1 OR p_batch_size > 100 THEN
    RAISE EXCEPTION 'p_batch_size must be between 1 and 100 (got %)', p_batch_size;
  END IF;

  v_effective_batch := p_batch_size;

  -- Opportunistically recover stale processing leases older than 5 minutes
  PERFORM public.recover_stale_sync_events(300);

  RETURN QUERY
  WITH claimed AS (
    SELECT se.id
    FROM public.sync_events se
    WHERE se.status IN ('pending', 'failed')
      AND se.next_retry_at <= NOW()
    ORDER BY se.next_retry_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_effective_batch
  )
  UPDATE public.sync_events target
  SET status = 'processing',
      claim_token = gen_random_uuid(),
      processing_started_at = NOW(),
      attempts = target.attempts + 1,
      updated_at = NOW()
  FROM claimed
  WHERE target.id = claimed.id
  RETURNING 
    target.id,
    target.user_id,
    target.organization_id,
    target.application_id,
    target.integration_id,
    target.provider,
    target.status,
    target.attempts,
    target.max_attempts,
    target.payload,
    target.claim_token;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_pending_sync_events(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_pending_sync_events(INT) TO service_role;

-- 5. Fenced Complete Sync Event RPC
DROP FUNCTION IF EXISTS public.complete_sync_event(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.complete_sync_event(
  p_event_id UUID, 
  p_claim_token UUID,
  p_external_row_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event RECORD;
  v_has_pending_update BOOLEAN;
  v_app_id UUID;
  v_result_status TEXT;
BEGIN
  -- Verify event existence and claim fencing
  SELECT id, application_id, status, claim_token, pending_payload, external_row_id
  INTO v_event
  FROM public.sync_events
  WHERE id = p_event_id;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Sync event not found: %', p_event_id;
  END IF;

  -- Guarded state machine: Must be in 'processing' and have matching claim_token
  IF v_event.status != 'processing'::public.sync_event_status_enum OR v_event.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'Fencing violation: Sync event % has status % with mismatched claim token. Stale worker execution rejected.',
      p_event_id, v_event.status;
  END IF;

  v_has_pending_update := (v_event.pending_payload IS NOT NULL);
  v_app_id := v_event.application_id;

  IF v_has_pending_update THEN
    -- Application was updated while worker was executing with v1 payload.
    -- v1 succeeded on external sheet (recorded row id), so re-enqueue latest v2 payload as 'pending'
    UPDATE public.sync_events
    SET status = 'pending',
        payload = v_event.pending_payload,
        pending_payload = NULL,
        claim_token = NULL,
        processing_started_at = NULL,
        external_row_id = COALESCE(p_external_row_id, v_event.external_row_id),
        synced_at = NOW(),
        next_retry_at = NOW(),
        updated_at = NOW(),
        last_error = NULL
    WHERE id = p_event_id;

    v_result_status := 're_enqueued_pending';
  ELSE
    -- Clean completion
    UPDATE public.sync_events
    SET status = 'synced',
        claim_token = NULL,
        processing_started_at = NULL,
        external_row_id = COALESCE(p_external_row_id, v_event.external_row_id),
        synced_at = NOW(),
        updated_at = NOW(),
        last_error = NULL
    WHERE id = p_event_id;

    v_result_status := 'synced';
  END IF;

  IF v_app_id IS NOT NULL THEN
    UPDATE public.applications
    SET sync_status = 'synced',
        synced_at = NOW(),
        last_sync_error = NULL,
        updated_at = NOW()
    WHERE id = v_app_id;
  END IF;

  RETURN jsonb_build_object(
    'eventId', p_event_id,
    'status', v_result_status,
    'hasPendingUpdate', v_has_pending_update
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_sync_event(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sync_event(UUID, UUID, TEXT) TO service_role;

-- 6. Fenced Fail Sync Event RPC
DROP FUNCTION IF EXISTS public.fail_sync_event(UUID, TEXT, INT);
CREATE OR REPLACE FUNCTION public.fail_sync_event(
  p_event_id UUID, 
  p_claim_token UUID,
  p_error_message TEXT, 
  p_retry_delay_seconds INT DEFAULT 60,
  p_is_non_retryable BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event RECORD;
  v_is_dead_letter BOOLEAN;
  v_new_status public.sync_event_status_enum;
  v_next_retry TIMESTAMPTZ;
BEGIN
  SELECT id, application_id, status, claim_token, attempts, max_attempts, pending_payload
  INTO v_event
  FROM public.sync_events
  WHERE id = p_event_id;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Sync event not found: %', p_event_id;
  END IF;

  -- Guarded state machine: Must be in 'processing' and have matching claim_token
  IF v_event.status != 'processing'::public.sync_event_status_enum OR v_event.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'Fencing violation: Sync event % has status % with mismatched claim token. Stale worker execution rejected.',
      p_event_id, v_event.status;
  END IF;

  v_is_dead_letter := p_is_non_retryable OR (v_event.attempts >= v_event.max_attempts);
  v_new_status := CASE WHEN v_is_dead_letter THEN 'dead_letter'::public.sync_event_status_enum ELSE 'failed'::public.sync_event_status_enum END;
  v_next_retry := CASE WHEN v_is_dead_letter THEN NOW() + interval '365 days' ELSE NOW() + (p_retry_delay_seconds * interval '1 second') END;

  UPDATE public.sync_events
  SET status = v_new_status,
      claim_token = NULL,
      processing_started_at = NULL,
      next_retry_at = v_next_retry,
      last_error = p_error_message,
      payload = COALESCE(v_event.pending_payload, payload),
      pending_payload = NULL,
      updated_at = NOW()
  WHERE id = p_event_id;

  UPDATE public.applications
  SET sync_status = 'failed',
      last_sync_error = p_error_message,
      updated_at = NOW()
  WHERE id = v_event.application_id;

  RETURN jsonb_build_object(
    'eventId', p_event_id,
    'status', v_new_status::text,
    'isDeadLetter', v_is_dead_letter
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fail_sync_event(UUID, UUID, TEXT, INT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_sync_event(UUID, UUID, TEXT, INT, BOOLEAN) TO service_role;

-- 7. Application Sync Enqueue Trigger (Fixing processing -> pending Race)
CREATE OR REPLACE FUNCTION public.enqueue_application_sync_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_integration_id UUID;
  v_job_url TEXT;
  v_job_location TEXT;
  v_new_payload JSONB;
BEGIN
  -- Find active google_sheets integration for this application's org or user
  IF NEW.organization_id IS NOT NULL THEN
    SELECT id INTO v_integration_id
    FROM public.user_integrations
    WHERE organization_id = NEW.organization_id AND provider = 'google_sheets' AND is_active = true
    LIMIT 1;
  ELSE
    SELECT id INTO v_integration_id
    FROM public.user_integrations
    WHERE user_id = NEW.user_id AND organization_id IS NULL AND provider = 'google_sheets' AND is_active = true
    LIMIT 1;
  END IF;

  -- If no active integration exists, do nothing
  IF v_integration_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fetch optional job metadata if job_id is linked
  IF NEW.job_id IS NOT NULL THEN
    SELECT j.application_url, array_to_string(j.locations, ', ')
    INTO v_job_url, v_job_location
    FROM public.jobs j
    WHERE j.id = NEW.job_id;
  END IF;

  v_new_payload := jsonb_build_object(
    'applicationId', NEW.id,
    'jobTitle', NEW.job_title,
    'companyName', NEW.company_name,
    'status', NEW.status,
    'appliedAt', NEW.applied_at,
    'verificationStatus', COALESCE(NEW.verification_status, 'pending'),
    'directApplyUrl', COALESCE(v_job_url, ''),
    'location', COALESCE(v_job_location, ''),
    'notes', COALESCE(NEW.notes, ''),
    'updatedAt', NEW.updated_at
  );

  -- Atomic Coalesce:
  -- 1. If currently 'processing': DO NOT change status! Preserve processing claim, set pending_payload.
  -- 2. If currently 'pending' or 'failed': Update payload, set status to 'pending', reset retry time.
  -- 3. In all conflict cases: DO NOT mutate integration_id (preserving integration immutability).
  INSERT INTO public.sync_events (
    user_id,
    organization_id,
    application_id,
    integration_id,
    provider,
    status,
    payload,
    next_retry_at,
    updated_at
  ) VALUES (
    NEW.user_id,
    NEW.organization_id,
    NEW.id,
    v_integration_id,
    'google_sheets',
    'pending',
    v_new_payload,
    NOW(),
    NOW()
  )
  ON CONFLICT (application_id) WHERE (status IN ('pending', 'processing', 'failed'))
  DO UPDATE SET
    status = CASE 
      WHEN public.sync_events.status = 'processing'::public.sync_event_status_enum THEN public.sync_events.status
      ELSE 'pending'::public.sync_event_status_enum
    END,
    payload = CASE 
      WHEN public.sync_events.status = 'processing'::public.sync_event_status_enum THEN public.sync_events.payload
      ELSE EXCLUDED.payload
    END,
    pending_payload = CASE 
      WHEN public.sync_events.status = 'processing'::public.sync_event_status_enum THEN EXCLUDED.payload
      ELSE NULL
    END,
    next_retry_at = CASE
      WHEN public.sync_events.status = 'processing'::public.sync_event_status_enum THEN public.sync_events.next_retry_at
      ELSE NOW()
    END,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- 8. Existing Applications Backfill RPC
CREATE OR REPLACE FUNCTION public.enqueue_existing_applications_for_sync(
  p_integration_id UUID,
  p_limit INT DEFAULT 500
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_int RECORD;
  v_enqueued_count INT := 0;
  v_batch_limit INT;
BEGIN
  v_batch_limit := LEAST(GREATEST(p_limit, 1), 1000);

  SELECT id, user_id, organization_id, provider, is_active
  INTO v_int
  FROM public.user_integrations
  WHERE id = p_integration_id;

  IF v_int.id IS NULL OR NOT v_int.is_active OR v_int.provider != 'google_sheets' THEN
    RETURN 0;
  END IF;

  WITH candidate_apps AS (
    SELECT a.id, a.user_id, a.organization_id, a.job_title, a.company_name, a.status,
           a.applied_at, a.verification_status, a.notes, a.updated_at,
           j.application_url, array_to_string(j.locations, ', ') AS job_location
    FROM public.applications a
    LEFT JOIN public.jobs j ON j.id = a.job_id
    WHERE (
      (v_int.organization_id IS NOT NULL AND a.organization_id = v_int.organization_id)
      OR
      (v_int.organization_id IS NULL AND a.user_id = v_int.user_id AND a.organization_id IS NULL)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.sync_events se
      WHERE se.application_id = a.id
        AND se.status IN ('pending', 'processing', 'synced')
    )
    ORDER BY a.created_at DESC
    LIMIT v_batch_limit
  ),
  inserted AS (
    INSERT INTO public.sync_events (
      user_id,
      organization_id,
      application_id,
      integration_id,
      provider,
      status,
      payload,
      next_retry_at,
      updated_at
    )
    SELECT
      ca.user_id,
      ca.organization_id,
      ca.id,
      v_int.id,
      'google_sheets',
      'pending',
      jsonb_build_object(
        'applicationId', ca.id,
        'jobTitle', ca.job_title,
        'companyName', ca.company_name,
        'status', ca.status,
        'appliedAt', ca.applied_at,
        'verificationStatus', COALESCE(ca.verification_status, 'pending'),
        'directApplyUrl', COALESCE(ca.application_url, ''),
        'location', COALESCE(ca.job_location, ''),
        'notes', COALESCE(ca.notes, ''),
        'updatedAt', ca.updated_at
      ),
      NOW(),
      NOW()
    FROM candidate_apps ca
    ON CONFLICT (application_id) WHERE (status IN ('pending', 'processing', 'failed')) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_enqueued_count FROM inserted;

  RETURN v_enqueued_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_existing_applications_for_sync(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_existing_applications_for_sync(UUID, INT) TO service_role;

-- 9. Record migration in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20260904250000', ARRAY['-- Batch O: Remediation fencing, leases, state guards and backfill'], 'batch_o_remediation')
ON CONFLICT (version) DO NOTHING;
