-- Migration: 20261009000000_harden_claim_leases.sql
-- Description: Adds claim_epoch as a fencing token for lease safety
--   - Prevents stale recovery from stealing an active worker's claim
--   - Adds renew_discovery_claim RPC for periodic lease extension
--   - claim_epoch is set to 1 on claim, incremented on renewal, reset to 0 on release/recovery

-- 1. Add claim_epoch column as fencing token
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS claim_epoch integer NOT NULL DEFAULT 0;

-- 2. Update claim_discovery_candidates to set claim_epoch = 1 on claim
CREATE OR REPLACE FUNCTION public.claim_discovery_candidates(
  p_status text,
  p_worker_id text,
  p_limit integer DEFAULT 50,
  p_lease_interval interval DEFAULT interval '10 minutes'
)
RETURNS SETOF public.discovery_registry
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT id
    FROM public.discovery_registry
    WHERE discovery_status = p_status
      AND (
        claimed_at IS NULL
        OR claimed_at < (now() - p_lease_interval)
      )
    ORDER BY priority_score DESC, first_discovered_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.discovery_registry dr
  SET claimed_at = now(),
      claimed_by = p_worker_id,
      claim_epoch = 1
  FROM claimable c
  WHERE dr.id = c.id
  RETURNING dr.*;
END;
$$;

-- 3. Claim Renewal / Heartbeat RPC (fencing-token aware)
-- Only the owning worker can extend its lease. Bumps epoch and resets claimed_at.
-- Returns the new epoch value so the caller can track it as a fencing token.
CREATE OR REPLACE FUNCTION public.renew_discovery_claim(
  p_id uuid,
  p_worker_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_epoch integer;
BEGIN
  UPDATE public.discovery_registry
  SET claimed_at = now(),
      claim_epoch = claim_epoch + 1
  WHERE id = p_id
    AND claimed_by = p_worker_id
    AND claimed_at IS NOT NULL
  RETURNING claim_epoch INTO v_new_epoch;

  RETURN v_new_epoch;  -- NULL if no row matched (claim was stolen)
END;
$$;

-- 4. Updated release_discovery_claim (resets epoch)
CREATE OR REPLACE FUNCTION public.release_discovery_claim(
  p_id uuid,
  p_worker_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_released boolean := false;
BEGIN
  UPDATE public.discovery_registry
  SET claimed_at = NULL,
      claimed_by = NULL,
      claim_epoch = 0
  WHERE id = p_id
    AND (p_worker_id IS NULL OR claimed_by = p_worker_id);

  IF FOUND THEN
    v_released := true;
  END IF;

  RETURN v_released;
END;
$$;

-- 5. Updated Stale Claim Recovery (resets epoch, safe from renewed leases)
CREATE OR REPLACE FUNCTION public.recover_stale_discovery_claims(
  p_lease_interval interval DEFAULT interval '10 minutes'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recovered_count integer;
BEGIN
  UPDATE public.discovery_registry
  SET claimed_at = NULL,
      claimed_by = NULL,
      claim_epoch = 0
  WHERE claimed_at IS NOT NULL
    AND claimed_at < (now() - p_lease_interval);

  GET DIAGNOSTICS v_recovered_count = ROW_COUNT;
  RETURN v_recovered_count;
END;
$$;

-- 6. Permissions
REVOKE EXECUTE ON FUNCTION public.renew_discovery_claim(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_discovery_claim(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_discovery_claim(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_discovery_claim(uuid, text) TO service_role;
