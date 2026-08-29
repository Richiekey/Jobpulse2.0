-- Migration: 20260829000004_distributed_locks_and_dispatch_queue.sql
-- Description: M03 Durable Dispatch Queue (SKIP LOCKED) and M05 Atomic Distributed Scrape Lease Lock.

-- 1. Create singleton scrape_locks table
CREATE TABLE IF NOT EXISTS public.scrape_locks (
  lock_key TEXT PRIMARY KEY,
  holder_id TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- RLS on scrape_locks: Service role / worker only
ALTER TABLE public.scrape_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Worker manage scrape_locks" ON public.scrape_locks;
CREATE POLICY "Worker manage scrape_locks" ON public.scrape_locks
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- 2. Atomic Lease Lock Acquisition with Automatic TTL Crash Recovery
CREATE OR REPLACE FUNCTION public.try_acquire_scrape_lock(
  p_lock_key TEXT,
  p_holder_id TEXT,
  p_ttl_seconds INT DEFAULT 900
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_acquired BOOLEAN := false;
BEGIN
  -- Delete expired locks
  DELETE FROM public.scrape_locks WHERE lock_key = p_lock_key AND expires_at < v_now;

  -- Try to insert or reclaim expired lock
  INSERT INTO public.scrape_locks (lock_key, holder_id, acquired_at, expires_at)
  VALUES (p_lock_key, p_holder_id, v_now, v_now + (p_ttl_seconds || ' seconds')::interval)
  ON CONFLICT (lock_key) DO UPDATE
    SET holder_id = EXCLUDED.holder_id,
        acquired_at = v_now,
        expires_at = v_now + (p_ttl_seconds || ' seconds')::interval
    WHERE public.scrape_locks.expires_at < v_now;

  GET DIAGNOSTICS v_acquired = ROW_COUNT;
  RETURN v_acquired > 0;
END;
$$;

-- 3. Release Scrape Lock
CREATE OR REPLACE FUNCTION public.release_scrape_lock(
  p_lock_key TEXT,
  p_holder_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_released INT;
BEGIN
  DELETE FROM public.scrape_locks 
  WHERE lock_key = p_lock_key AND holder_id = p_holder_id;
  
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released > 0;
END;
$$;

-- 4. Force Unlock (Admin only)
CREATE OR REPLACE FUNCTION public.force_unlock_scrape(p_lock_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can force unlock scrape runs';
  END IF;

  DELETE FROM public.scrape_locks WHERE lock_key = p_lock_key;
  RETURN true;
END;
$$;

-- 5. Claim next pending scrape run atomically with SKIP LOCKED
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

-- Grant execution to service_role (and admin where appropriate)
REVOKE ALL ON FUNCTION public.try_acquire_scrape_lock FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_scrape_lock TO service_role;

REVOKE ALL ON FUNCTION public.release_scrape_lock FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_scrape_lock TO service_role;

REVOKE ALL ON FUNCTION public.claim_next_pending_scrape_run FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_pending_scrape_run TO service_role;

GRANT EXECUTE ON FUNCTION public.force_unlock_scrape TO authenticated, service_role;
