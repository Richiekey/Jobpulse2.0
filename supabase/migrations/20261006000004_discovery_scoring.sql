-- Phase 7: Discovery source priority scoring
-- Assigns each discovered source a priority score for crawl ordering.

ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS priority_score integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_discovery_registry_priority
  ON public.discovery_registry(priority_score DESC)
  WHERE discovery_status IN ('ADAPTER_RESOLVED', 'CRAWL_QUEUED', 'SUCCESS');

-- Scoring function: computes priority from verification, adapter, crawl, and freshness signals.
-- Called per-record. Returns 0–100 score.
CREATE OR REPLACE FUNCTION public.compute_discovery_priority(
  p_verification_status text,
  p_adapter_status text,
  p_discovery_status text,
  p_crawl_job_count integer,
  p_first_discovered_at timestamptz,
  p_last_success_at timestamptz,
  p_detection_url text,
  p_board_identifier text
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  score integer := 0;
BEGIN
  -- === High-priority signals (additive) ===

  -- ATS verified
  IF p_verification_status = 'verified' THEN
    score := score + 30;
  ELSIF p_verification_status = 'probable' THEN
    score := score + 15;
  END IF;

  -- Recruiting domain verified (detection URL resolved)
  IF p_detection_url IS NOT NULL AND p_detection_url <> '' THEN
    score := score + 10;
  END IF;

  -- Board identifier resolved
  IF p_board_identifier IS NOT NULL AND p_board_identifier <> '' THEN
    score := score + 5;
  END IF;

  -- Adapter exists and ready
  IF p_adapter_status = 'ready' THEN
    score := score + 20;
  END IF;

  -- Source previously produced jobs
  IF COALESCE(p_crawl_job_count, 0) > 0 THEN
    score := score + 25;
  END IF;

  -- Successful crawl in the past
  IF p_discovery_status = 'SUCCESS' THEN
    score := score + 10;
  END IF;

  -- Recent TechnologyChecker detection (within 30 days)
  IF p_first_discovered_at IS NOT NULL
     AND p_first_discovered_at > (now() - interval '30 days') THEN
    score := score + 10;
  -- Within 90 days
  ELSIF p_first_discovered_at IS NOT NULL
     AND p_first_discovered_at > (now() - interval '90 days') THEN
    score := score + 5;
  END IF;

  -- Recent successful crawl (within 7 days)
  IF p_last_success_at IS NOT NULL
     AND p_last_success_at > (now() - interval '7 days') THEN
    score := score + 10;
  END IF;

  -- === Lower-priority signals (penalties) ===

  -- ATS detected but recruiting endpoint unresolved
  IF p_verification_status = 'unresolved' THEN
    score := score - 10;
  END IF;

  -- Stale detection
  IF p_verification_status = 'stale' THEN
    score := score - 15;
  END IF;

  -- Inaccessible domain
  IF p_verification_status = 'inaccessible' THEN
    score := score - 20;
  END IF;

  -- Adapter unavailable
  IF p_adapter_status = 'unavailable' THEN
    score := score - 10;
  END IF;

  -- Mismatch (TechnologyChecker said X, we detected Y)
  IF p_verification_status = 'mismatch' THEN
    score := score - 25;
  END IF;

  -- Clamp to 0–100
  RETURN GREATEST(0, LEAST(100, score));
END;
$$;

-- Batch-update all scores in discovery_registry
CREATE OR REPLACE FUNCTION public.refresh_discovery_scores()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.discovery_registry
  SET priority_score = public.compute_discovery_priority(
    verification_status,
    adapter_status,
    discovery_status,
    crawl_job_count,
    first_discovered_at,
    last_success_at,
    detection_url,
    board_identifier
  );
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_discovery_priority(text, text, text, integer, timestamptz, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_discovery_scores() TO service_role;

-- Enhanced funnel metrics RPC with priority breakdown
DROP FUNCTION IF EXISTS public.get_discovery_funnel_metrics();
CREATE OR REPLACE FUNCTION public.get_discovery_funnel_metrics()
RETURNS TABLE (
  ats_provider text,
  discovered bigint,
  verifying bigint,
  verified bigint,
  adapter_resolved bigint,
  crawl_queued bigint,
  crawled bigint,
  success bigint,
  empty bigint,
  failed bigint,
  avg_priority numeric,
  high_priority bigint,
  low_priority bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    dr.ats_provider,
    COUNT(*) FILTER (WHERE dr.discovery_status = 'DISCOVERED') AS discovered,
    COUNT(*) FILTER (WHERE dr.discovery_status = 'VERIFYING') AS verifying,
    COUNT(*) FILTER (WHERE dr.discovery_status = 'VERIFIED') AS verified,
    COUNT(*) FILTER (WHERE dr.discovery_status = 'ADAPTER_RESOLVED') AS adapter_resolved,
    COUNT(*) FILTER (WHERE dr.discovery_status = 'CRAWL_QUEUED') AS crawl_queued,
    COUNT(*) FILTER (WHERE dr.discovery_status = 'CRAWLED') AS crawled,
    COUNT(*) FILTER (WHERE dr.discovery_status = 'SUCCESS') AS success,
    COUNT(*) FILTER (WHERE dr.discovery_status = 'EMPTY') AS empty,
    COUNT(*) FILTER (WHERE dr.discovery_status = 'FAILED') AS failed,
    ROUND(AVG(dr.priority_score), 1) AS avg_priority,
    COUNT(*) FILTER (WHERE dr.priority_score >= 60) AS high_priority,
    COUNT(*) FILTER (WHERE dr.priority_score < 30) AS low_priority
  FROM public.discovery_registry dr
  GROUP BY dr.ats_provider
  ORDER BY dr.ats_provider;
$$;
