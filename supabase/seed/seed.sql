-- ============================================================================
-- JobPulse 2.0 — Production Baseline Seed Data
-- ============================================================================

-- 1. Insert Supported ATS Platforms
INSERT INTO public.ats_platforms (id, name, slug, domains, capabilities, is_active)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Greenhouse',
    'greenhouse',
    ARRAY['boards.greenhouse.io', 'job-boards.greenhouse.io'],
    '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Lever',
    'lever',
    ARRAY['jobs.lever.co', 'api.lever.co'],
    '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'Ashby',
    'ashby',
    ARRAY['jobs.ashbyhq.com', 'api.ashbyhq.com'],
    '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'Workday',
    'workday',
    ARRAY['myworkdayjobs.com'],
    '{"hasPublicApi": true, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": false}'::jsonb,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    'Jobright',
    'jobright',
    ARRAY['jobright.ai'],
    '{"hasPublicApi": false, "supportsIncrementalSync": false, "providesStructuredData": true, "requiresBrowserRendering": true}'::jsonb,
    true
  )
ON CONFLICT (slug) DO UPDATE
SET 
  name = EXCLUDED.name,
  domains = EXCLUDED.domains,
  capabilities = EXCLUDED.capabilities,
  is_active = EXCLUDED.is_active;

-- 2. Insert Default ATS Ingestion Sources
INSERT INTO public.sources (id, ats_platform_id, type, name, domain, adapter_name, status, metadata)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'ats_direct',
    'Greenhouse Public Boards API',
    'boards-api.greenhouse.io',
    'greenhouse',
    'healthy',
    '{"parser_version": "greenhouse_v1", "rate_limit_rps": 2}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'ats_direct',
    'Lever Postings API',
    'api.lever.co',
    'lever',
    'healthy',
    '{"parser_version": "lever_v1", "rate_limit_rps": 2}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000003',
    'ats_direct',
    'Ashby Public Job Board API',
    'api.ashbyhq.com',
    'ashby',
    'healthy',
    '{"parser_version": "ashby_v1", "rate_limit_rps": 2}'::jsonb
  )
ON CONFLICT DO NOTHING;

-- 3. Insert Initial Verified Tech Companies
INSERT INTO public.companies (id, name, normalized_name, website, careers_url, logo_url, industry, status)
VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    'Stripe',
    'stripe',
    'https://stripe.com',
    'https://stripe.com/jobs',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&h=128&fit=crop',
    'Fintech',
    'active'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'Airbnb',
    'airbnb',
    'https://airbnb.com',
    'https://careers.airbnb.com',
    'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=128&h=128&fit=crop',
    'Travel & Hospitality',
    'active'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    'Coinbase',
    'coinbase',
    'https://coinbase.com',
    'https://coinbase.com/careers',
    'https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?w=128&h=128&fit=crop',
    'Crypto & Web3',
    'active'
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    'Figma',
    'figma',
    'https://figma.com',
    'https://figma.com/careers',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&h=128&fit=crop',
    'Design & Collaboration',
    'active'
  ),
  (
    '20000000-0000-0000-0000-000000000005',
    'Vercel',
    'vercel',
    'https://vercel.com',
    'https://vercel.com/careers',
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=128&h=128&fit=crop',
    'Developer Tools & Cloud',
    'active'
  )
ON CONFLICT (normalized_name) DO UPDATE
SET
  name = EXCLUDED.name,
  website = EXCLUDED.website,
  careers_url = EXCLUDED.careers_url,
  industry = EXCLUDED.industry;

-- 4. Map Companies to Sources (Dynamic Company Sources)
INSERT INTO public.company_sources (company_id, source_id, source_identifier, source_url, is_active, health_status)
VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'stripe',
    'https://boards.greenhouse.io/stripe',
    true,
    'healthy'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'airbnb',
    'https://boards.greenhouse.io/airbnb',
    true,
    'healthy'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'coinbase',
    'https://boards.greenhouse.io/coinbase',
    true,
    'healthy'
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    'figma',
    'https://boards.greenhouse.io/figma',
    true,
    'healthy'
  ),
  (
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000003',
    'vercel',
    'https://jobs.ashbyhq.com/vercel',
    true,
    'healthy'
  )
ON CONFLICT (company_id, source_id, source_identifier) DO NOTHING;
