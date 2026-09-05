-- ============================================================================
-- JobPulse 2.0 — Batch O Final Surgical Integrity Pass
-- Version: 20260905260000
-- Description: 
--   1. Fix O-18: When complete_sync_event detects pending_payload, application 
--      sync_status remains 'pending' (not 'synced').
--   2. Fix O-17: Introduce retry_sync_events_bulk RPC that atomically increments 
--      manual_retry_count = manual_retry_count + 1 for bulk replay operations.
--   3. Fix O-19: In enqueue_existing_applications_for_sync, safely migrate stale
--      pending/failed events from inactive integrations to the newly active integration
--      without mutating live processing claims.
-- ============================================================================

-- 1. Updated complete_sync_event RPC (O-18 Fix)
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

  -- O-18 Fix: If pending_payload existed, application is still waiting for newer payload to replicate -> remains 'pending'
  IF v_app_id IS NOT NULL THEN
    IF v_has_pending_update THEN
      UPDATE public.applications
      SET sync_status = 'pending',
          last_sync_error = NULL,
          updated_at = NOW()
      WHERE id = v_app_id;
    ELSE
      UPDATE public.applications
      SET sync_status = 'synced',
          synced_at = NOW(),
          last_sync_error = NULL,
          updated_at = NOW()
      WHERE id = v_app_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'eventId', p_event_id,
    'status', v_result_status,
    'hasPendingUpdate', v_has_pending_update,
    'applicationSyncStatus', CASE WHEN v_has_pending_update THEN 'pending' ELSE 'synced' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_sync_event(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sync_event(UUID, UUID, TEXT) TO service_role;

-- 2. Bulk Retry RPC with Atomic Counter Increment (O-17 Fix)
CREATE OR REPLACE FUNCTION public.retry_sync_events_bulk(
  p_user_id UUID,
  p_organization_id UUID DEFAULT NULL,
  p_max_manual_retries INT DEFAULT 5
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  WITH eligible AS (
    SELECT id
    FROM public.sync_events
    WHERE (
      (p_organization_id IS NOT NULL AND organization_id = p_organization_id)
      OR
      (p_organization_id IS NULL AND user_id = p_user_id AND organization_id IS NULL)
    )
    AND status IN ('failed', 'dead_letter')
    AND manual_retry_count < p_max_manual_retries
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sync_events target
  SET status = 'pending',
      claim_token = NULL,
      processing_started_at = NULL,
      next_retry_at = NOW(),
      last_error = NULL,
      manual_retry_count = target.manual_retry_count + 1,
      updated_at = NOW()
  FROM eligible
  WHERE target.id = eligible.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_sync_events_bulk(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_sync_events_bulk(UUID, UUID, INT) TO service_role;

-- 3. Backfill with Stale Inactive Integration Migration (O-19 Fix)
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
  v_migrated_count INT := 0;
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

  -- O-19: Migrate any stale 'pending' or 'failed' events bound to inactive integrations
  -- to this newly active integration. DO NOT mutate live 'processing' claims!
  UPDATE public.sync_events
  SET integration_id = v_int.id,
      status = 'pending',
      claim_token = NULL,
      processing_started_at = NULL,
      next_retry_at = NOW(),
      last_error = NULL,
      updated_at = NOW()
  WHERE (
    (v_int.organization_id IS NOT NULL AND organization_id = v_int.organization_id)
    OR
    (v_int.organization_id IS NULL AND user_id = v_int.user_id AND organization_id IS NULL)
  )
  AND status IN ('pending', 'failed')
  AND integration_id != v_int.id;

  GET DIAGNOSTICS v_migrated_count = ROW_COUNT;

  -- Backfill applications that do not currently have an active sync event
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

  RETURN v_migrated_count + v_enqueued_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_existing_applications_for_sync(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_existing_applications_for_sync(UUID, INT) TO service_role;

-- 4. Record migration in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20260905260000', ARRAY['-- Batch O: Final integrity pass on complete_sync_event, retry_sync_events_bulk, and stale integration migration'], 'batch_o_final_integrity')
ON CONFLICT (version) DO NOTHING;
