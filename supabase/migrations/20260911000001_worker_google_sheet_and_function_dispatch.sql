-- Migration: Worker Google Sheet URL + Function-based dispatches
-- 1. Add google_sheet_url to worker_profiles
ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS google_sheet_url TEXT;
COMMENT ON COLUMN public.worker_profiles.google_sheet_url IS 'Google Sheet URL for syncing applied jobs';

-- 2. Make job_id nullable on job_assignments for function-based dispatches
ALTER TABLE public.job_assignments ALTER COLUMN job_id DROP NOT NULL;

-- 3. Add job_function_slug for category-based dispatches
ALTER TABLE public.job_assignments ADD COLUMN IF NOT EXISTS job_function_slug TEXT;
COMMENT ON COLUMN public.job_assignments.job_function_slug IS 'Job function category slug for function-based dispatches';

-- 4. Add check: either job_id or job_function_slug must be set
ALTER TABLE public.job_assignments ADD CONSTRAINT chk_job_or_function
  CHECK (job_id IS NOT NULL OR job_function_slug IS NOT NULL);

-- 5. Drop the old unique constraint and recreate to allow function-based dispatches
ALTER TABLE public.job_assignments DROP CONSTRAINT IF EXISTS uq_org_job_worker;

-- 6. Add new unique constraints for both dispatch modes
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_job_worker_specific
  ON public.job_assignments (organization_id, job_id, worker_id)
  WHERE job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_function_worker
  ON public.job_assignments (organization_id, job_function_slug, worker_id)
  WHERE job_function_slug IS NOT NULL AND job_id IS NULL;
