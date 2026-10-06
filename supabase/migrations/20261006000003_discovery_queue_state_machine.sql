-- Phase 6: Discovery Queue State Machine
-- Separate from the job ingestion queue to prevent mixing discovery failures with job parsing failures.

-- Add the discovery pipeline status column with proper enum states
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS discovery_status text NOT NULL DEFAULT 'DISCOVERED';

-- Track board identifier resolved during verification
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS board_identifier text;

-- Track discovery-specific error messages separately from job ingestion errors
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS discovery_error text;

-- Track crawl results
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS crawl_job_count integer;
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS crawl_jobs_inserted integer;
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS last_crawled_at timestamptz;

-- Add a company_source_id FK for records that have been promoted to the production pipeline
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS company_source_id uuid REFERENCES public.company_sources(id) ON DELETE SET NULL;

-- Index for the queue processor to efficiently claim work
CREATE INDEX IF NOT EXISTS idx_discovery_registry_status ON public.discovery_registry(discovery_status);

-- Composite index for funnel metrics queries
CREATE INDEX IF NOT EXISTS idx_discovery_registry_funnel ON public.discovery_registry(ats_provider, discovery_status, adapter_status);

-- Add a CHECK constraint to enforce valid state transitions
ALTER TABLE public.discovery_registry
  ADD CONSTRAINT discovery_status_valid CHECK (
    discovery_status IN (
      'DISCOVERED',
      'VERIFYING',
      'VERIFIED',
      'ADAPTER_RESOLVED',
      'CRAWL_QUEUED',
      'CRAWLED',
      'SUCCESS',
      'EMPTY',
      'FAILED'
    )
  );

-- RPC to get discovery funnel metrics per ATS provider
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
  failed bigint
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
    COUNT(*) FILTER (WHERE dr.discovery_status = 'FAILED') AS failed
  FROM public.discovery_registry dr
  GROUP BY dr.ats_provider
  ORDER BY dr.ats_provider;
$$;

GRANT EXECUTE ON FUNCTION public.get_discovery_funnel_metrics() TO service_role;
