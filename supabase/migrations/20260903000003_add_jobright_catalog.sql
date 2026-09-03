-- ============================================================================
-- JobPulse 2.0 — Add Jobright Aggregator Source and Verified Repositories
-- Version: 20260903000003
-- Description: Registers the Jobright Aggregator source and adds verified
--              live GitHub markdown job collection repositories.
--              Idempotent: ON CONFLICT clauses prevent duplicates.
-- ============================================================================

-- 1. Register Jobright in sources table
INSERT INTO public.sources (
  id,
  type,
  name,
  domain,
  adapter_name,
  status,
  metadata
)
VALUES (
  '10000000-0000-0000-0000-000000000005',
  'aggregator'::source_type_enum,
  'Jobright GitHub Collections',
  'github.com/jobright-ai',
  'jobright',
  'healthy'::health_status_enum,
  '{"parser_version": "jobright_v2", "rate_limit_rps": 5}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type,
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  adapter_name = EXCLUDED.adapter_name,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata;

-- 2. Register Jobright platform organization in companies table
INSERT INTO public.companies (
  name,
  normalized_name,
  slug,
  website,
  industry,
  status
)
VALUES (
  'Jobright',
  'jobright',
  'jobright',
  'https://jobright.ai',
  'Job Aggregator / Career Platform',
  'active'
)
ON CONFLICT (normalized_name) DO UPDATE SET
  website = EXCLUDED.website,
  industry = EXCLUDED.industry,
  status = EXCLUDED.status;

-- 3. Register verified live Jobright repositories in company_sources
WITH jc AS (
  SELECT id AS company_id FROM public.companies WHERE normalized_name = 'jobright' LIMIT 1
)
INSERT INTO public.company_sources (
  company_id,
  source_id,
  source_identifier,
  source_url,
  adapter_config,
  is_active,
  health_status,
  priority,
  schedule_interval_minutes,
  discovery_method
)
SELECT
  jc.company_id,
  '10000000-0000-0000-0000-000000000005'::uuid,
  repo_data.identifier,
  repo_data.url,
  repo_data.config,
  true,
  'healthy'::health_status_enum,
  50,
  60,
  'manual'
FROM jc,
(VALUES
  (
    '2026-Software-Engineer-New-Grad',
    'https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md',
    '{"repository": "2026-Software-Engineer-New-Grad", "target_branch": "master"}'::jsonb
  ),
  (
    '2026-Data-Analysis-New-Grad',
    'https://raw.githubusercontent.com/jobright-ai/2026-Data-Analysis-New-Grad/master/README.md',
    '{"repository": "2026-Data-Analysis-New-Grad", "target_branch": "master"}'::jsonb
  ),
  (
    'Daily-H1B-Jobs-In-Tech',
    'https://raw.githubusercontent.com/jobright-ai/Daily-H1B-Jobs-In-Tech/master/README.md',
    '{"repository": "Daily-H1B-Jobs-In-Tech", "target_branch": "master"}'::jsonb
  ),
  (
    '2026-Engineering-New-Grad',
    'https://raw.githubusercontent.com/jobright-ai/2026-Engineering-New-Grad/master/README.md',
    '{"repository": "2026-Engineering-New-Grad", "target_branch": "master"}'::jsonb
  )
) AS repo_data(identifier, url, config)
ON CONFLICT (company_id, source_id, source_identifier) DO UPDATE SET
  source_url = EXCLUDED.source_url,
  adapter_config = EXCLUDED.adapter_config,
  is_active = EXCLUDED.is_active,
  health_status = EXCLUDED.health_status,
  updated_at = now();
