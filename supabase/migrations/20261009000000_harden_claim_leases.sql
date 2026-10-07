-- Migration: 20261009000000_harden_claim_leases.sql
-- Description: Adds claim_epoch for heartbeat-based lease renewal
--   - Prevents stale recovery from stealing an active worker's claim
--   - Adds renew_discovery_claim RPC for lease extension

-- 1. Add claim_epoch column for tracking claim renewals
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS claim_epoch integer NOT NULL DEFAULT 0;

-- 2. Claim Renewal / Heartbeat RPC
-- Only the owning worker can extend its lease. Bumps epoch and resets claimed_at.
CREATE OR REPLACE FUNCTION public.renew_discovery_claim(
  p_id uuid,
  p_worker_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_renewed boolean := false;
BEGIN
  UPDATE public.discovery_registry
  SET claimed_at = now(),
      claim_epoch = claim_epoch + 1
  WHERE id = p_id
    AND claimed_by = p_worker_id
    AND claimed_at IS NOT NULL;

  IF FOUND THEN
    v_renewed := true;
  END IF;

  RETURN v_renewed;
END;
$$;

-- 3. Updated Stale Claim Recovery (safe from reclaiming renewed leases)
-- Resets claims where claimed_at + lease_interval < now(), which naturally
-- excludes claims that were recently renewed (since renewal resets claimed_at).
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

-- 4. Permissions
REVOKE EXECUTE ON FUNCTION public.renew_discovery_claim(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_discovery_claim(uuid, text) TO service_role;
