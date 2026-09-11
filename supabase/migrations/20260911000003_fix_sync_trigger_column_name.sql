-- Corrective migration: Fix column name mismatch in sync trigger and backfill RPC
-- The trigger `enqueue_application_sync_event` and RPC `enqueue_existing_applications_for_sync`
-- both reference `j.application_url` which does not exist on the `jobs` table.
-- The correct column name is `j.apply_url`.

-- 1. Fix the trigger function
CREATE OR REPLACE FUNCTION public.enqueue_application_sync_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- FIXED: was `j.application_url`, correct column is `j.apply_url`
  IF NEW.job_id IS NOT NULL THEN
    SELECT j.apply_url, array_to_string(j.locations, ', ')
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

-- 2. Fix the backfill RPC function
CREATE OR REPLACE FUNCTION public.enqueue_existing_applications_for_sync(
  p_integration_id UUID,
  p_limit INT DEFAULT 500
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_int RECORD;
  v_migrated_count INT := 0;
  v_batch_limit INT;
BEGIN
  v_batch_limit := LEAST(GREATEST(p_limit, 1), 5000);

  SELECT * INTO v_int
  FROM public.user_integrations
  WHERE id = p_integration_id AND provider = 'google_sheets' AND is_active = true;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Migrate any orphaned sync events from old integrations
  UPDATE public.sync_events
  SET integration_id = v_int.id,
      status = 'pending',
      next_retry_at = NOW(),
      updated_at = NOW()
  WHERE status IN ('pending', 'processing', 'failed')
  AND user_id = v_int.user_id
  AND integration_id != v_int.id;

  GET DIAGNOSTICS v_migrated_count = ROW_COUNT;

  -- Backfill applications that do not currently have an active sync event
  -- FIXED: was `j.application_url`, correct column is `j.apply_url`
  WITH candidate_apps AS (
    SELECT a.id, a.user_id, a.organization_id, a.job_title, a.company_name, a.status,
           a.applied_at, a.verification_status, a.notes, a.updated_at,
           j.apply_url, array_to_string(j.locations, ', ') AS job_location
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
        'directApplyUrl', COALESCE(ca.apply_url, ''),
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
  SELECT COUNT(*) + v_migrated_count INTO v_migrated_count FROM inserted;

  RETURN v_migrated_count;
END;
$$;
