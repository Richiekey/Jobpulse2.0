-- Phase 10: Full ATS Observability Funnel

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
      COUNT(*) FILTER (WHERE discovery_status IN ('ADAPTER_RESOLVED', 'CRAWL_QUEUED', 'CRAWLED', 'SUCCESS', 'EMPTY', 'FAILED')) AS adapter_ready,
      COUNT(*) FILTER (WHERE discovery_status IN ('CRAWLED', 'SUCCESS', 'EMPTY', 'FAILED')) AS crawl_attempted
    FROM public.discovery_registry
    GROUP BY ats_provider
  ),
  production_stats AS (
    SELECT
      s.adapter_name AS ats_provider,
      SUM(srs.jobs_discovered) AS jobs_discovered,
      SUM(srs.jobs_inserted) + SUM(srs.jobs_updated) AS jobs_accepted,
      SUM(sr.jobs_rejected) AS jobs_rejected,
      SUM(srs.jobs_inserted) AS jobs_inserted,
      SUM(srs.jobs_updated) AS jobs_updated
    FROM public.company_sources cs
    JOIN public.sources s ON s.id = cs.source_id
    JOIN public.scrape_run_sources srs ON srs.company_source_id = cs.id
    JOIN public.scrape_runs sr ON sr.id = srs.scrape_run_id
    GROUP BY s.adapter_name
  )
  SELECT 
    COALESCE(d.ats_provider, p.ats_provider) AS technology,
    COALESCE(d.discovered, 0) AS discovered,
    COALESCE(d.verified, 0) AS verified,
    COALESCE(d.adapter_ready, 0) AS adapter_ready,
    COALESCE(d.crawl_attempted, 0) AS crawl_attempted,
    COALESCE(p.jobs_discovered, 0) AS jobs_discovered,
    COALESCE(p.jobs_accepted, 0) AS jobs_accepted,
    COALESCE(p.jobs_rejected, 0) AS jobs_rejected,
    COALESCE(p.jobs_inserted, 0) AS jobs_inserted,
    COALESCE(p.jobs_updated, 0) AS jobs_updated
  FROM discovery_stats d
  FULL OUTER JOIN production_stats p ON d.ats_provider = p.ats_provider
  ORDER BY technology;
$$;
