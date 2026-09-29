-- Migration to optimize Jobright collections scheduling and disable the empty internship index

-- 1. Disable the useless catalog collection
UPDATE public.company_sources 
SET is_active = false 
WHERE source_identifier = '2026-Internship' 
  AND source_id = (SELECT id FROM public.sources WHERE adapter_name = 'jobright' LIMIT 1);

-- 2. Adjust scheduling for giant, highly-overlapping collections to 360 minutes (6 hours)
UPDATE public.company_sources 
SET schedule_interval_minutes = 360 
WHERE source_identifier IN (
    '2026-Engineering-New-Grad',
    '2026-Software-Engineer-New-Grad',
    '2026-Data-Analysis-New-Grad'
) AND source_id = (SELECT id FROM public.sources WHERE adapter_name = 'jobright' LIMIT 1);

-- Ensure H1B collection stays at 60 minutes
UPDATE public.company_sources 
SET schedule_interval_minutes = 60 
WHERE source_identifier = 'Daily-H1B-Jobs-In-Tech' 
  AND source_id = (SELECT id FROM public.sources WHERE adapter_name = 'jobright' LIMIT 1);
