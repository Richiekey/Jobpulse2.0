-- ============================================================================
-- JobPulse 2.0 — Add Missing ATS Platforms, Sources, and Onboard Companies
-- Version: 20261005000000
-- Description: Registers missing ATS platforms and adapters, and onboards
--              verified companies across Rippling, JobDiva, Lever, Workday,
--              SmartRecruiters, Workable, BambooHR, Teamtailor, and Personio.
-- ============================================================================

-- 1. Insert missing ATS Platforms
INSERT INTO public.ats_platforms (id, name, slug, domains, capabilities, is_active)
VALUES
('00000000-0000-0000-0000-000000000006', 'SmartRecruiters', 'smartrecruiters', ARRAY['smartrecruiters.com', 'jobs.smartrecruiters.com'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000007', 'iCIMS', 'icims', ARRAY['icims.com', 'jobs.icims.com', 'careers.icims.com'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000008', 'SAP SuccessFactors', 'successfactors', ARRAY['successfactors.com', 'successfactors.eu'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000009', 'Oracle Cloud HCM', 'oracle', ARRAY['oraclecloud.com', 'taleo.net'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000010', 'Workable', 'workable', ARRAY['workable.com', 'apply.workable.com'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000011', 'BambooHR', 'bamboohr', ARRAY['bamboohr.com'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000012', 'Rippling', 'rippling', ARRAY['ats.rippling.com'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000013', 'Jobvite', 'jobvite', ARRAY['jobs.jobvite.com'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000014', 'Recruitee', 'recruitee', ARRAY['recruitee.com'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000015', 'ApplyToJob (JazzHR)', 'applytojob', ARRAY['applytojob.com'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000016', 'Teamtailor', 'teamtailor', ARRAY['teamtailor.com'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000017', 'Breezy HR', 'breezy', ARRAY['breezy.hr'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000018', 'Personio', 'personio', ARRAY['jobs.personio.com', 'jobs.personio.de'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000019', 'ADP Workforce Now', 'adp', ARRAY['workforcenow.adp.com'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true),
('00000000-0000-0000-0000-000000000021', 'JobDiva', 'jobdiva', ARRAY['jobdiva.com', 'www.jobdiva.com'], '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  domains = EXCLUDED.domains,
  capabilities = EXCLUDED.capabilities,
  is_active = EXCLUDED.is_active;

-- 2. Insert missing Sources
INSERT INTO public.sources (id, ats_platform_id, type, name, domain, adapter_name, status, metadata)
VALUES
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'ats_direct'::source_type_enum, 'Workday Jobs API', 'myworkdayjobs.com', 'workday', 'healthy'::health_status_enum, '{"parser_version": "workday_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 'ats_direct'::source_type_enum, 'SmartRecruiters Public Boards API', 'jobs.smartrecruiters.com', 'smartrecruiters', 'healthy'::health_status_enum, '{"parser_version": "smartrecruiters_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007', 'ats_direct'::source_type_enum, 'iCIMS Jobs Portal', 'icims.com', 'icims', 'healthy'::health_status_enum, '{"parser_version": "icims_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000008', 'ats_direct'::source_type_enum, 'SuccessFactors Jobs', 'successfactors.com', 'successfactors', 'healthy'::health_status_enum, '{"parser_version": "successfactors_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000009', 'ats_direct'::source_type_enum, 'Oracle Cloud HCM Jobs', 'oraclecloud.com', 'oracle', 'healthy'::health_status_enum, '{"parser_version": "oracle_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000010', 'ats_direct'::source_type_enum, 'Workable Board API', 'apply.workable.com', 'workable', 'healthy'::health_status_enum, '{"parser_version": "workable_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011', 'ats_direct'::source_type_enum, 'BambooHR Careers', 'bamboohr.com', 'bamboohr', 'healthy'::health_status_enum, '{"parser_version": "bamboohr_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000012', 'ats_direct'::source_type_enum, 'Rippling ATS Jobs', 'ats.rippling.com', 'rippling', 'healthy'::health_status_enum, '{"parser_version": "rippling_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000013', 'ats_direct'::source_type_enum, 'Jobvite Careers', 'jobs.jobvite.com', 'jobvite', 'healthy'::health_status_enum, '{"parser_version": "jobvite_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000014', 'ats_direct'::source_type_enum, 'Recruitee Offers API', 'recruitee.com', 'recruitee', 'healthy'::health_status_enum, '{"parser_version": "recruitee_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000015', 'ats_direct'::source_type_enum, 'ApplyToJob (JazzHR)', 'applytojob.com', 'applytojob', 'healthy'::health_status_enum, '{"parser_version": "applytojob_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000016', 'ats_direct'::source_type_enum, 'Teamtailor Jobs API', 'teamtailor.com', 'teamtailor', 'healthy'::health_status_enum, '{"parser_version": "teamtailor_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000017', 'ats_direct'::source_type_enum, 'Breezy HR Jobs', 'breezy.hr', 'breezy', 'healthy'::health_status_enum, '{"parser_version": "breezy_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000018', 'ats_direct'::source_type_enum, 'Personio Jobs API', 'jobs.personio.com', 'personio', 'healthy'::health_status_enum, '{"parser_version": "personio_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000019', 'ats_direct'::source_type_enum, 'ADP Workforce Now API', 'workforcenow.adp.com', 'adp', 'healthy'::health_status_enum, '{"parser_version": "adp_v1", "rate_limit_rps": 2}'::jsonb),
('10000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', 'ats_direct'::source_type_enum, 'JobDiva Portal API', 'jobdiva.com', 'jobdiva', 'healthy'::health_status_enum, '{"parser_version": "jobdiva_v1", "rate_limit_rps": 2}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type,
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  adapter_name = EXCLUDED.adapter_name,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata;

-- 3. Insert Researched Companies
INSERT INTO public.companies (name, normalized_name, slug, industry, status)
VALUES
-- Rippling
('Framework', 'framework', 'framework', 'Consumer Hardware', 'active'),
('TheGuarantors', 'theguarantors', 'theguarantors', 'Fintech', 'active'),
('Everflow', 'everflow', 'everflow', 'Adtech', 'active'),
('Hivery', 'hivery', 'hivery', 'AI', 'active'),
('Crafty', 'crafty', 'crafty', 'Food Services', 'active'),

-- Lever
('Shopify', 'shopify', 'shopify', 'E-Commerce', 'active'),
('Shield AI', 'shield ai', 'shield-ai', 'Defense', 'active'),
('Klarna', 'klarna', 'klarna', 'Fintech', 'active'),
('CI&T', 'cit', 'cit', 'Tech Consulting', 'active'),

-- Workday
('Netflix', 'netflix', 'netflix', 'Entertainment', 'active'),
('Salesforce', 'salesforce', 'salesforce', 'SaaS', 'active'),
('Amazon', 'amazon', 'amazon', 'Tech', 'active'),
('Apple', 'apple', 'apple', 'Tech', 'active'),
('Meta', 'meta', 'meta', 'Social Media', 'active'),
('Microsoft', 'microsoft', 'microsoft', 'Tech', 'active'),
('Google', 'google', 'google', 'Tech', 'active'),

-- SmartRecruiters
('Visa', 'visa', 'visa', 'Payments', 'active'),
('IKEA', 'ikea', 'ikea', 'Retail', 'active'),
('Bosch', 'bosch', 'bosch', 'Engineering', 'active'),
('Sanofi', 'sanofi', 'sanofi', 'Healthcare', 'active'),

-- Workable
('Hugging Face', 'hugging face', 'hugging-face', 'AI', 'active'),
('MediaRadar', 'mediaradar', 'mediaradar', 'Analytics', 'active'),
('Devsinc', 'devsinc', 'devsinc', 'IT Services', 'active'),

-- BambooHR
('Postman', 'postman', 'postman', 'Developer Tools', 'active'),
('Qualtrics', 'qualtrics', 'qualtrics', 'Software', 'active'),

-- Teamtailor
('Pasqal', 'pasqal', 'pasqal', 'Quantum Computing', 'active'),
('Corsearch', 'corsearch', 'corsearch', 'Software', 'active'),
('Katalon', 'katalon', 'katalon', 'DevOps', 'active'),

-- Personio
('Personio', 'personio', 'personio', 'HR Tech', 'active'),
('Scalable Capital', 'scalable capital', 'scalable-capital', 'Fintech', 'active'),

-- JobDiva
('Artech Information Systems', 'artech', 'artech', 'Staffing', 'active'),
('Cynet Systems', 'cynet systems', 'cynet-systems', 'Staffing', 'active')
ON CONFLICT (normalized_name) DO NOTHING;

-- 4. Map Companies to their ATS Sources
INSERT INTO public.company_sources (company_id, source_id, source_identifier, source_url, is_active, health_status)
SELECT c.id, s.id, v.identifier, v.source_url, true, 'healthy'::health_status_enum
FROM (VALUES
  -- Rippling
  ('framework', 'framework', 'https://ats.rippling.com/framework'),
  ('theguarantors', 'theguarantors', 'https://ats.rippling.com/theguarantors'),
  ('everflow', 'everflow', 'https://ats.rippling.com/everflow'),
  ('hivery', 'hivery', 'https://ats.rippling.com/hivery'),
  ('crafty', 'crafty', 'https://ats.rippling.com/crafty'),

  -- Lever
  ('shopify', 'shopify', 'https://jobs.lever.co/shopify'),
  ('shield ai', 'shieldai', 'https://jobs.lever.co/shieldai'),
  ('klarna', 'klarna', 'https://jobs.lever.co/klarna'),
  ('cit', 'ciandt', 'https://jobs.lever.co/ciandt'),

  -- Workday
  ('netflix', 'netflix', 'https://netflix.myworkdayjobs.com/netflix_careers'),
  ('salesforce', 'salesforce', 'https://salesforce.myworkdayjobs.com/External_Career_Site'),
  ('amazon', 'amazon', 'https://amazon.myworkdayjobs.com/Amazon_Careers'),
  ('apple', 'apple', 'https://apple.myworkdayjobs.com/Apple_Careers'),
  ('meta', 'meta', 'https://meta.myworkdayjobs.com/Meta_Careers'),
  ('microsoft', 'microsoft', 'https://microsoft.myworkdayjobs.com/Microsoft_Careers'),
  ('google', 'google', 'https://google.myworkdayjobs.com/Google_Careers'),

  -- SmartRecruiters
  ('visa', 'visa', 'https://jobs.smartrecruiters.com/Visa'),
  ('ikea', 'ikea', 'https://jobs.smartrecruiters.com/IKEA'),
  ('bosch', 'bosch', 'https://jobs.smartrecruiters.com/Bosch'),
  ('sanofi', 'sanofi', 'https://jobs.smartrecruiters.com/Sanofi'),

  -- Workable
  ('hugging face', 'huggingface', 'https://apply.workable.com/huggingface'),
  ('mediaradar', 'mediaradar', 'https://apply.workable.com/mediaradar'),
  ('devsinc', 'devsinc', 'https://apply.workable.com/devsinc'),

  -- BambooHR
  ('postman', 'postman', 'https://postman.bamboohr.com/careers'),
  ('qualtrics', 'qualtrics', 'https://qualtrics.bamboohr.com/careers'),

  -- Teamtailor
  ('pasqal', 'pasqal', 'https://pasqal.teamtailor.com/jobs'),
  ('corsearch', 'corsearch', 'https://corsearch.teamtailor.com/jobs'),
  ('katalon', 'katalon', 'https://katalon.teamtailor.com/jobs'),

  -- Personio
  ('personio', 'personio', 'https://personio.jobs.personio.com/job'),
  ('scalable capital', 'scalablecapital', 'https://scalablecapital.jobs.personio.com/job'),

  -- JobDiva
  ('artech', 'artech', 'https://www.jobdiva.com/portal/?portalid=artech'),
  ('cynet systems', 'cynetsystems', 'https://www.jobdiva.com/portal/?portalid=cynetsystems')
) AS v(company_name, identifier, source_url)
JOIN public.companies c ON c.normalized_name = v.company_name
JOIN public.sources s ON 
    (v.company_name IN ('framework', 'theguarantors', 'everflow', 'hivery', 'crafty') AND s.adapter_name = 'rippling') OR
    (v.company_name IN ('shopify', 'shield ai', 'klarna', 'cit') AND s.adapter_name = 'lever') OR
    (v.company_name IN ('netflix', 'salesforce', 'amazon', 'apple', 'meta', 'microsoft', 'google') AND s.adapter_name = 'workday') OR
    (v.company_name IN ('visa', 'ikea', 'bosch', 'sanofi') AND s.adapter_name = 'smartrecruiters') OR
    (v.company_name IN ('hugging face', 'mediaradar', 'devsinc') AND s.adapter_name = 'workable') OR
    (v.company_name IN ('postman', 'qualtrics') AND s.adapter_name = 'bamboohr') OR
    (v.company_name IN ('pasqal', 'corsearch', 'katalon') AND s.adapter_name = 'teamtailor') OR
    (v.company_name IN ('personio', 'scalable capital') AND s.adapter_name = 'personio') OR
    (v.company_name IN ('artech', 'cynet systems') AND s.adapter_name = 'jobdiva')
ON CONFLICT (company_id, source_id, source_identifier) DO NOTHING;
