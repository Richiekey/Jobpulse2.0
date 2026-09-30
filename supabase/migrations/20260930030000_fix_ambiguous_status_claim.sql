-- Corrective migration: Fix ambiguous status column in claim_next_pending_scrape_run

CREATE OR REPLACE FUNCTION public.claim_next_pending_scrape_run()
RETURNS TABLE (
  id UUID,
  started_at TIMESTAMPTZ,
  status public.scrape_run_status_enum,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.verify_worker_access() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not authorized to claim queued scrape runs';
  END IF;

  -- Concurrency Guard: If any run is already running globally, do NOT claim another run!
  IF EXISTS (SELECT 1 FROM public.scrape_runs WHERE public.scrape_runs.status = 'running') THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.scrape_runs
  SET status = 'running',
      started_at = clock_timestamp()
  WHERE public.scrape_runs.id = (
    SELECT r.id
    FROM public.scrape_runs r
    WHERE r.status = 'pending'
    ORDER BY r.started_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING public.scrape_runs.id, public.scrape_runs.started_at, public.scrape_runs.status, public.scrape_runs.metadata;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_pending_scrape_run FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_pending_scrape_run TO service_role;
