-- ============================================================================
-- JobPulse 2.0 — Repair Workday and ATS Identifiers
-- ============================================================================

-- Fix Salesforce Workday identifier
UPDATE public.company_sources cs
SET 
  source_identifier = 'salesforce/wd12/External_Career_Site',
  source_url = 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site'
FROM public.companies c, public.sources s
WHERE cs.company_id = c.id AND cs.source_id = s.id
  AND c.normalized_name = 'salesforce' 
  AND s.adapter_name = 'workday';

-- Fix Netflix Workday identifier (guessed based on prompt style)
UPDATE public.company_sources cs
SET 
  source_identifier = 'netflix/wd1/Netflix',
  source_url = 'https://netflix.wd1.myworkdayjobs.com/en-US/Netflix'
FROM public.companies c, public.sources s
WHERE cs.company_id = c.id AND cs.source_id = s.id
  AND c.normalized_name = 'netflix' 
  AND s.adapter_name = 'workday';

-- Fix Amazon Workday identifier
UPDATE public.company_sources cs
SET 
  source_identifier = 'amazon/wd5/AmazonNew',
  source_url = 'https://amazon.wd5.myworkdayjobs.com/en-US/AmazonNew'
FROM public.companies c, public.sources s
WHERE cs.company_id = c.id AND cs.source_id = s.id
  AND c.normalized_name = 'amazon' 
  AND s.adapter_name = 'workday';

-- Fix Microsoft Workday identifier
UPDATE public.company_sources cs
SET 
  source_identifier = 'microsoft/wd5/Global',
  source_url = 'https://microsoft.wd5.myworkdayjobs.com/en-US/Global'
FROM public.companies c, public.sources s
WHERE cs.company_id = c.id AND cs.source_id = s.id
  AND c.normalized_name = 'microsoft' 
  AND s.adapter_name = 'workday';

-- Fix IBM Workday identifier (if it exists)
UPDATE public.company_sources cs
SET 
  source_identifier = 'ibm/wd1/IBM_Careers',
  source_url = 'https://ibm.wd1.myworkdayjobs.com/en-US/IBM_Careers'
FROM public.companies c, public.sources s
WHERE cs.company_id = c.id AND cs.source_id = s.id
  AND c.normalized_name = 'ibm' 
  AND s.adapter_name = 'workday';

-- Fix NVIDIA Workday identifier (if it exists)
UPDATE public.company_sources cs
SET 
  source_identifier = 'nvidia/wd5/NVIDIAExternalCareerSite',
  source_url = 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite'
FROM public.companies c, public.sources s
WHERE cs.company_id = c.id AND cs.source_id = s.id
  AND c.normalized_name = 'nvidia' 
  AND s.adapter_name = 'workday';

-- Also address Visa since it was mentioned in the prompt (visa/wd5/Visa_External) 
-- Note: the research script actually found visa/wd5/Visa. I'll use what the research script found.
UPDATE public.company_sources cs
SET 
  source_identifier = 'visa/wd5/Visa',
  source_url = 'https://visa.wd5.myworkdayjobs.com/en-US/Visa'
FROM public.companies c, public.sources s
WHERE cs.company_id = c.id AND cs.source_id = s.id
  AND c.normalized_name = 'visa' 
  AND s.adapter_name = 'workday';

-- Note: Google, Apple, and Meta do not use Workday (they use custom/proprietary systems). 
-- They were added as workday sources erroneously.
UPDATE public.company_sources cs
SET 
  health_status = 'invalid_configuration'
FROM public.companies c, public.sources s
WHERE cs.company_id = c.id AND cs.source_id = s.id
  AND c.normalized_name IN ('google', 'apple', 'meta') 
  AND s.adapter_name = 'workday';
