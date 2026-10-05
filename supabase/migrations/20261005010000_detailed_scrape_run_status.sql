-- Fix zero-job semantics by allowing detailed source run statuses

ALTER TABLE public.scrape_run_sources DROP CONSTRAINT IF EXISTS scrape_run_sources_status_check;

ALTER TABLE public.scrape_run_sources ADD CONSTRAINT scrape_run_sources_status_check
CHECK (status IN (
  'succeeded',
  'failed',
  'skipped',
  'partial_failure',
  'empty',
  'invalid_configuration',
  'rate_limited',
  'http_error',
  'adapter_error',
  'healthy'
));
