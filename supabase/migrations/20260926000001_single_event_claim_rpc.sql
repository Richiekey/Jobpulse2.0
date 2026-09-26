-- Create a canonical single-event claim RPC for immediate Google Sheets sync

CREATE OR REPLACE FUNCTION public.claim_sync_event(
  p_event_id uuid
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  organization_id uuid,
  application_id uuid,
  integration_id uuid,
  provider text,
  status public.sync_event_status_enum,
  attempts integer,
  max_attempts integer,
  payload jsonb,
  claim_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT se.id
    FROM public.sync_events se
    WHERE se.id = p_event_id
      AND se.status IN ('pending', 'failed')
      AND se.next_retry_at <= NOW()
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sync_events target
  SET
    status = 'processing',
    claim_token = gen_random_uuid(),
    processing_started_at = NOW(),
    attempts = target.attempts + 1,
    updated_at = NOW()
  FROM candidate
  WHERE target.id = candidate.id
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

REVOKE ALL ON FUNCTION public.claim_sync_event(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sync_event(uuid) TO service_role;
