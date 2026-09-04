-- ============================================================================
-- JobPulse 2.0 — Batch O: Application Sync Engine
-- Version: 20260904240000
-- Description: Durable, asynchronous replication queue to Google Sheets.
--              Includes sync_events table, queue claiming RPC with SKIP LOCKED,
--              status update RPCs, RLS, and automatic application sync enqueue trigger.
-- ============================================================================

-- 1. Sync Event Status Enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_event_status_enum') THEN
    CREATE TYPE public.sync_event_status_enum AS ENUM (
      'pending',
      'processing',
      'synced',
      'failed',
      'dead_letter'
    );
  END IF;
END;
$$;

-- 2. Sync Events Table (Durable Queue)
CREATE TABLE IF NOT EXISTS public.sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.user_integrations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google_sheets',
  status public.sync_event_status_enum NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  external_row_id TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for Queue Throughput & Deduplication
-- Coalesce pending/processing sync events for the same application
CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_events_active_application 
  ON public.sync_events(application_id) 
  WHERE (status IN ('pending', 'processing'));

-- Partial index for fast worker queue popping
CREATE INDEX IF NOT EXISTS idx_sync_events_queue 
  ON public.sync_events(status, next_retry_at ASC) 
  WHERE (status IN ('pending', 'failed'));

CREATE INDEX IF NOT EXISTS idx_sync_events_user_time 
  ON public.sync_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_events_org_time 
  ON public.sync_events(organization_id, created_at DESC) 
  WHERE organization_id IS NOT NULL;

-- 4. Row Level Security
ALTER TABLE public.sync_events ENABLE ROW LEVEL SECURITY;

-- Read policy: Users see own sync events; Org Admins see org sync events; service_role sees all
DROP POLICY IF EXISTS "Allow users and org admins to view sync events" ON public.sync_events;
CREATE POLICY "Allow users and org admins to view sync events"
  ON public.sync_events FOR SELECT
  USING (
    auth.uid() = user_id 
    OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id, auth.uid()))
    OR (auth.role() = 'service_role')
  );

-- Modifying policy: Restricted strictly to service_role
DROP POLICY IF EXISTS "Allow service_role full control on sync_events" ON public.sync_events;
CREATE POLICY "Allow service_role full control on sync_events"
  ON public.sync_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Queue Claiming RPC (Atomic with SKIP LOCKED)
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
  payload JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT se.id
    FROM public.sync_events se
    WHERE se.status IN ('pending', 'failed')
      AND se.next_retry_at <= NOW()
    ORDER BY se.next_retry_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  UPDATE public.sync_events target
  SET status = 'processing',
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
    target.payload;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_pending_sync_events(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_pending_sync_events(INT) TO service_role;

-- 6. Complete Sync Event RPC
CREATE OR REPLACE FUNCTION public.complete_sync_event(p_event_id UUID, p_external_row_id TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app_id UUID;
BEGIN
  UPDATE public.sync_events
  SET status = 'synced',
      external_row_id = COALESCE(p_external_row_id, external_row_id),
      synced_at = NOW(),
      updated_at = NOW(),
      last_error = NULL
  WHERE id = p_event_id
  RETURNING application_id INTO v_app_id;

  IF v_app_id IS NOT NULL THEN
    UPDATE public.applications
    SET sync_status = 'synced',
        synced_at = NOW(),
        last_sync_error = NULL,
        updated_at = NOW()
    WHERE id = v_app_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_sync_event(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sync_event(UUID, TEXT) TO service_role;

-- 7. Fail Sync Event RPC (Exponential Backoff or Dead Letter)
CREATE OR REPLACE FUNCTION public.fail_sync_event(
  p_event_id UUID, 
  p_error_message TEXT, 
  p_retry_delay_seconds INT DEFAULT 60
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app_id UUID;
  v_attempts INT;
  v_max_attempts INT;
  v_is_dead_letter BOOLEAN;
BEGIN
  SELECT application_id, attempts, max_attempts
  INTO v_app_id, v_attempts, v_max_attempts
  FROM public.sync_events
  WHERE id = p_event_id;

  IF v_app_id IS NULL THEN
    RETURN;
  END IF;

  v_is_dead_letter := (v_attempts >= v_max_attempts);

  UPDATE public.sync_events
  SET status = CASE WHEN v_is_dead_letter THEN 'dead_letter'::public.sync_event_status_enum ELSE 'failed'::public.sync_event_status_enum END,
      next_retry_at = CASE WHEN v_is_dead_letter THEN NOW() + interval '365 days' ELSE NOW() + (p_retry_delay_seconds * interval '1 second') END,
      last_error = p_error_message,
      updated_at = NOW()
  WHERE id = p_event_id;

  UPDATE public.applications
  SET sync_status = 'failed',
      last_sync_error = p_error_message,
      updated_at = NOW()
  WHERE id = v_app_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_sync_event(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_sync_event(UUID, TEXT, INT) TO service_role;

-- 8. Enqueue Trigger Function on applications
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

  -- Deduplicate active sync events (coalesce pending/processing into updated payload)
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
    jsonb_build_object(
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
    ),
    NOW(),
    NOW()
  )
  ON CONFLICT (application_id) WHERE (status IN ('pending', 'processing'))
  DO UPDATE SET
    payload = EXCLUDED.payload,
    status = 'pending',
    next_retry_at = NOW(),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_application_sync ON public.applications;
CREATE TRIGGER trg_enqueue_application_sync
  AFTER INSERT OR UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_application_sync_event();

-- 9. Record migration in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20260904240000', ARRAY['-- Batch O: Application Sync Engine'], 'batch_o_application_sync_engine')
ON CONFLICT (version) DO NOTHING;
