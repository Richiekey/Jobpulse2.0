-- 1. Index on fetched_at to prevent statement timeouts during purge
CREATE INDEX IF NOT EXISTS idx_raw_job_payloads_fetched_at ON public.raw_job_payloads(fetched_at);

-- 2. Drop the older version of purge_orphaned_jobs to resolve signature ambiguity
DROP FUNCTION IF EXISTS public.purge_orphaned_jobs(integer, integer);
