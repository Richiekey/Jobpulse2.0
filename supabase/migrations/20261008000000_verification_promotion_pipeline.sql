-- Migration: 20261008000000_verification_promotion_pipeline.sql
-- Description: Automated Verification & Promotion Pipeline V1
--   - Adds retry counters, error tracking, promotion lifecycle, and atomic claim fields
--   - Implements atomic candidate claiming RPC via FOR UPDATE SKIP LOCKED
--   - Implements stale claim recovery RPC

-- 1. Add pipeline tracking and atomic claim columns
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_error text,
  ADD COLUMN IF NOT EXISTS adapter_resolution_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_crawl_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_failure_reason text,
  ADD COLUMN IF NOT EXISTS promotion_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS promotion_reason text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text;

-- 2. Index for atomic claiming and stale recovery
CREATE INDEX IF NOT EXISTS idx_discovery_registry_claiming
  ON public.discovery_registry(discovery_status, claimed_at);

CREATE INDEX IF NOT EXISTS idx_discovery_registry_stale_claims
  ON public.discovery_registry(claimed_at)
  WHERE claimed_at IS NOT NULL;

-- 3. Atomic Candidate Claiming RPC (MC-1)
-- Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent double-claiming across concurrent workers.
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
      claimed_by = p_worker_id
  FROM claimable c
  WHERE dr.id = c.id
  RETURNING dr.*;
END;
$$;

-- 4. Stale Claim Recovery RPC (MC-1)
-- Resets claims held longer than lease_interval back to unassigned.
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
      claimed_by = NULL
  WHERE claimed_at IS NOT NULL
    AND claimed_at < (now() - p_lease_interval);

  GET DIAGNOSTICS v_recovered_count = ROW_COUNT;
  RETURN v_recovered_count;
END;
$$;

-- 5. Release Discovery Claim RPC
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
      claimed_by = NULL
  WHERE id = p_id
    AND (p_worker_id IS NULL OR claimed_by = p_worker_id);

  IF FOUND THEN
    v_released := true;
  END IF;

  RETURN v_released;
END;
$$;

-- 6. Permissions
REVOKE EXECUTE ON FUNCTION public.claim_discovery_candidates(text, text, integer, interval) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_discovery_candidates(text, text, integer, interval) TO service_role;

REVOKE EXECUTE ON FUNCTION public.recover_stale_discovery_claims(interval) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recover_stale_discovery_claims(interval) TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_discovery_claim(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_discovery_claim(uuid, text) TO service_role;
