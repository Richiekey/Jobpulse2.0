-- ============================================================================
-- JobPulse 2.0 — Repair Workday and ATS Identifiers
-- ============================================================================

DO $$ BEGIN
  PERFORM public.reconcile_company_source(
      'salesforce', 'workday', 'salesforce/wd12/External_Career_Site', 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site'
  );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped salesforce'; END $$;

DO $$ BEGIN
  PERFORM public.reconcile_company_source(
      'netflix', 'workday', 'netflix/wd1/Netflix', 'https://netflix.wd1.myworkdayjobs.com/en-US/Netflix'
  );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped netflix'; END $$;

DO $$ BEGIN
  PERFORM public.reconcile_company_source(
      'amazon', 'workday', 'amazon/wd5/AmazonNew', 'https://amazon.wd5.myworkdayjobs.com/en-US/AmazonNew'
  );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped amazon'; END $$;

DO $$ BEGIN
  PERFORM public.reconcile_company_source(
      'microsoft', 'workday', 'microsoft/wd5/Global', 'https://microsoft.wd5.myworkdayjobs.com/en-US/Global'
  );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped microsoft'; END $$;

DO $$ BEGIN
  PERFORM public.reconcile_company_source(
      'ibm', 'workday', 'ibm/wd1/IBM_Careers', 'https://ibm.wd1.myworkdayjobs.com/en-US/IBM_Careers'
  );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped ibm'; END $$;

DO $$ BEGIN
  PERFORM public.reconcile_company_source(
      'nvidia', 'workday', 'nvidia/wd5/NVIDIAExternalCareerSite', 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite'
  );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped nvidia'; END $$;

DO $$ BEGIN
  PERFORM public.reconcile_company_source(
      'visa', 'workday', 'visa/wd5/Visa', 'https://visa.wd5.myworkdayjobs.com/en-US/Visa'
  );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped visa'; END $$;

-- Note: Google, Apple, and Meta do not use Workday (they use custom/proprietary systems). 
-- They were added as workday sources erroneously.
UPDATE public.company_sources cs
SET 
  health_status = 'disabled',
  is_active = false
FROM public.companies c, public.sources s
WHERE cs.company_id = c.id AND cs.source_id = s.id
  AND c.normalized_name IN ('google', 'apple', 'meta') 
  AND s.adapter_name = 'workday';
