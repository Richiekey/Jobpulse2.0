-- Create an index to dramatically speed up retention cleanup queries
CREATE INDEX IF NOT EXISTS idx_raw_job_payloads_fetched_at ON public.raw_job_payloads (fetched_at);
CREATE INDEX IF NOT EXISTS idx_jobs_last_seen_at ON public.jobs (last_seen_at);
