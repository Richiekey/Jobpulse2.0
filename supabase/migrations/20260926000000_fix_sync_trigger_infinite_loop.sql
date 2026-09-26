-- Corrective migration: Fix ON CONFLICT constraint and loop in sync trigger
-- The ON CONFLICT clause must exactly match the unique index on sync_events
-- Also adds a check to only enqueue a sync event if relevant fields actually changed

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
  -- Only enqueue if relevant fields changed
  IF TG_OP = 'UPDATE' THEN
    IF OLD.job_title IS NOT DISTINCT FROM NEW.job_title AND
       OLD.company_name IS NOT DISTINCT FROM NEW.company_name AND
       OLD.status IS NOT DISTINCT FROM NEW.status AND
       OLD.applied_at IS NOT DISTINCT FROM NEW.applied_at AND
       OLD.verification_status IS NOT DISTINCT FROM NEW.verification_status AND
       OLD.notes IS NOT DISTINCT FROM NEW.notes AND
       OLD.job_id IS NOT DISTINCT FROM NEW.job_id THEN
      RETURN NEW;
    END IF;
  END IF;

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
  ON CONFLICT (application_id) WHERE (status IN ('pending', 'processing', 'failed'))
  DO UPDATE SET
    payload = EXCLUDED.payload,
    status = 'pending',
    next_retry_at = NOW(),
    updated_at = NOW();

  RETURN NEW;
END;
$$;
