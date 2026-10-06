-- ============================================================================
-- Phase 1 & 2: Fix Discovery Status Constraint & Funnel Join
-- ============================================================================

-- Drop ALL possible constraint names to ensure idempotency
ALTER TABLE public.discovery_registry
  DROP CONSTRAINT IF EXISTS discovery_status_valid;

ALTER TABLE public.discovery_registry
  DROP CONSTRAINT IF EXISTS discovery_registry_discovery_status_check;

-- Recreate the single authoritative constraint
ALTER TABLE public.discovery_registry
  ADD CONSTRAINT discovery_status_valid CHECK (
    discovery_status IN (
      'DISCOVERED', 'VERIFYING', 'VERIFIED',
      'ADAPTER_RESOLVED', 'CRAWL_QUEUED', 'TRIAL_CRAWLING',
      'CRAWLED', 'SUCCESS', 'EMPTY', 'FAILED'
    )
  );

-- Fix get_ats_observability_funnel join
DROP FUNCTION IF EXISTS public.get_ats_observability_funnel();

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
LANGUAGE sql STABLE SECURITY DEFINER
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
      s.adapter_name AS ats_provider,
      SUM(srs.jobs_discovered) AS jobs_discovered,
      SUM(srs.jobs_inserted) + SUM(srs.jobs_updated) AS jobs_accepted,
      SUM(srs.jobs_discovered) - (SUM(srs.jobs_inserted) + SUM(srs.jobs_updated)) AS jobs_rejected,
      SUM(srs.jobs_inserted) AS jobs_inserted,
      SUM(srs.jobs_updated) AS jobs_updated
    FROM public.company_sources cs
    JOIN public.sources s ON s.id = cs.source_id
    JOIN public.scrape_run_sources srs ON srs.company_source_id = cs.id
    GROUP BY s.adapter_name
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
