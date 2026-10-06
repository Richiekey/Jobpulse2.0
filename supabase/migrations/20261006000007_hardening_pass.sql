-- Phase 10: Hardening Pass Migrations

-- 1. Add promotion and validation fields, and sync state tracking
ALTER TABLE public.discovery_registry 
ADD COLUMN IF NOT EXISTS promotion_status text CHECK (promotion_status IN ('pending', 'promoted', 'not_promoted')),
ADD COLUMN IF NOT EXISTS promoted_at timestamptz,
ADD COLUMN IF NOT EXISTS crawl_eligible_job_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS crawl_rejected_job_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.discovery_sync_state
ADD COLUMN IF NOT EXISTS sync_status text CHECK (sync_status IN ('running', 'success', 'failed')) DEFAULT 'success',
ADD COLUMN IF NOT EXISTS sync_error text;

-- 2. Update CHECK constraint on discovery_status to include TRIAL_CRAWLING
ALTER TABLE public.discovery_registry DROP CONSTRAINT IF EXISTS discovery_registry_discovery_status_check;
ALTER TABLE public.discovery_registry ADD CONSTRAINT discovery_registry_discovery_status_check 
  CHECK (discovery_status IN ('DISCOVERED', 'VERIFYING', 'VERIFIED', 'ADAPTER_RESOLVED', 'CRAWL_QUEUED', 'TRIAL_CRAWLING', 'CRAWLED', 'SUCCESS', 'EMPTY', 'FAILED'));

-- 3. Fix IMMUTABLE function calling now() -> change to STABLE (Issue 9)
CREATE OR REPLACE FUNCTION public.compute_discovery_priority(
  p_verification_status text,
  p_adapter_status text,
  p_discovery_status text,
  p_crawl_job_count integer,
  p_first_discovered_at timestamptz,
  p_last_success_at timestamptz,
  p_detection_url text,
  p_board_identifier text
) RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  score integer := 50; -- Base score
BEGIN
  -- Verification bonuses
  IF p_verification_status = 'verified' THEN
    score := score + 20;
  ELSIF p_verification_status = 'probable' THEN
    score := score + 10;
  END IF;

  -- Adapter bonus
  IF p_adapter_status = 'ready' THEN
    score := score + 15;
  END IF;

  -- Past production bonus
  IF p_crawl_job_count > 0 THEN
    score := score + 15;
  END IF;
  
  -- Recency bonus (discovered in the last 7 days)
  IF p_first_discovered_at >= (now() - interval '7 days') THEN
    score := score + 5;
  END IF;

  -- Stale penalty
  IF p_verification_status = 'stale' THEN
    score := score - 40;
  END IF;

  -- Inaccessible penalty
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

-- 4. Fix Observability Funnel to correctly join ats_platforms and include TRIAL_CRAWLING
CREATE OR REPLACE FUNCTION public.get_ats_observability_funnel()
RETURNS TABLE (
  technology text,
  discovered bigint,
  verified bigint,
  adapter_ready bigint,
  crawl_attempted bigint,
  jobs_discovered bigint,
  jobs_accepted bigint,
  jobs_rejected bigint,
  jobs_inserted bigint,
  jobs_updated bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH discovery_stats AS (
    SELECT
      ats_provider,
      COUNT(*) AS discovered,
      COUNT(*) FILTER (WHERE verification_status IN ('verified', 'probable')) AS verified,
      COUNT(*) FILTER (WHERE discovery_status IN ('ADAPTER_RESOLVED', 'CRAWL_QUEUED', 'TRIAL_CRAWLING', 'SUCCESS', 'EMPTY', 'FAILED') OR promotion_status = 'promoted') AS adapter_ready,
      COUNT(*) FILTER (WHERE discovery_status IN ('TRIAL_CRAWLING', 'SUCCESS', 'EMPTY', 'FAILED')) AS crawl_attempted,
      SUM(crawl_job_count) AS trial_jobs_discovered,
      SUM(crawl_eligible_job_count) AS trial_jobs_accepted,
      SUM(crawl_rejected_job_count) AS trial_jobs_rejected
    FROM public.discovery_registry
    GROUP BY ats_provider
  ),
  production_stats AS (
    SELECT
      ap.slug AS ats_provider,
      SUM(srs.jobs_discovered) AS jobs_discovered,
      SUM(srs.jobs_inserted) + SUM(srs.jobs_updated) AS jobs_accepted,
      SUM(srs.jobs_discovered) - (SUM(srs.jobs_inserted) + SUM(srs.jobs_updated)) AS jobs_rejected,
      SUM(srs.jobs_inserted) AS jobs_inserted,
      SUM(srs.jobs_updated) AS jobs_updated
    FROM public.company_sources cs
    JOIN public.ats_platforms ap ON ap.id = cs.source_id
    JOIN public.scrape_run_sources srs ON srs.company_source_id = cs.id
    GROUP BY ap.slug
  )
  SELECT 
    COALESCE(d.ats_provider, p.ats_provider) AS technology,
    COALESCE(d.discovered, 0) AS discovered,
    COALESCE(d.verified, 0) AS verified,
    COALESCE(d.adapter_ready, 0) AS adapter_ready,
    COALESCE(d.crawl_attempted, 0) AS crawl_attempted,
    COALESCE(d.trial_jobs_discovered, 0) + COALESCE(p.jobs_discovered, 0) AS jobs_discovered,
    COALESCE(d.trial_jobs_accepted, 0) + COALESCE(p.jobs_accepted, 0) AS jobs_accepted,
    COALESCE(d.trial_jobs_rejected, 0) + COALESCE(p.jobs_rejected, 0) AS jobs_rejected,
    COALESCE(p.jobs_inserted, 0) AS jobs_inserted,
    COALESCE(p.jobs_updated, 0) AS jobs_updated
  FROM discovery_stats d
  FULL OUTER JOIN production_stats p ON d.ats_provider = p.ats_provider
  ORDER BY technology;
$$;
