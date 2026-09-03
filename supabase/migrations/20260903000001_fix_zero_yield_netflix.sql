-- ============================================================================
-- JobPulse 2.0 — Fix Zero-Yield Netflix Source (Workday wd108 Cluster Migration)
-- Version: 20260903000001
-- Description: Netflix career portal migrated from wd1 to wd108 cluster.
--              Updating source_identifier, source_url, and adapter_config.
--              Idempotent and safe to run multiple times.
-- ============================================================================

UPDATE public.company_sources cs
SET 
  source_identifier = 'netflix.wd108.myworkdayjobs.com/Netflix',
  source_url = 'https://netflix.wd108.myworkdayjobs.com/Netflix',
  adapter_config = jsonb_build_object(
    'host', 'netflix.wd108.myworkdayjobs.com',
    'site', 'Netflix',
    'tenant', 'netflix'
  ),
  health_status = 'healthy',
  consecutive_failures = 0,
  updated_at = now()
FROM public.companies c
WHERE cs.company_id = c.id
  AND c.normalized_name = 'netflix';
