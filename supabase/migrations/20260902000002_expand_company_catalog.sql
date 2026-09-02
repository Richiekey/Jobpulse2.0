-- ============================================================================
-- JobPulse 2.0 — Expand Company/Source Catalog (Verified Candidates Only)
-- Version: 20260902000002
-- Description: Imports 40 live-verified companies from the old JobPulse catalog.
--              Every candidate was verified against its ATS API before inclusion.
--              Idempotent: ON CONFLICT clauses prevent duplicates on re-run.
-- ============================================================================

-- ==========================================================================
-- PHASE 1: Insert verified companies
-- ==========================================================================

-- ── GREENHOUSE COMPANIES (23 verified) ──────────────────────────────────────

INSERT INTO public.companies (name, normalized_name, slug, website, industry, status)
VALUES
  ('Cloudflare',      'cloudflare',      'cloudflare',      'https://cloudflare.com',      'Cloud / Security',         'active'),
  ('Discord',         'discord',         'discord',         'https://discord.com',         'Social / Communication',   'active'),
  ('GitLab',          'gitlab',          'gitlab',          'https://gitlab.com',          'Developer Tools',          'active'),
  ('Reddit',          'reddit',          'reddit',          'https://reddit.com',          'Social Media',             'active'),
  ('Instacart',       'instacart',       'instacart',       'https://instacart.com',       'Grocery / Logistics',      'active'),
  ('Robinhood',       'robinhood',       'robinhood',       'https://robinhood.com',       'Fintech',                  'active'),
  ('Gusto',           'gusto',           'gusto',           'https://gusto.com',           'HR / Payroll',             'active'),
  ('Scale AI',        'scale ai',        'scale-ai',        'https://scale.com',           'AI / Data',                'active'),
  ('Affirm',          'affirm',          'affirm',          'https://affirm.com',          'Fintech',                  'active'),
  ('Chime',           'chime',           'chime',           'https://chime.com',           'Fintech / Banking',        'active'),
  ('Monzo',           'monzo',           'monzo',           'https://monzo.com',           'Fintech / Banking',        'active'),
  ('Flexport',        'flexport',        'flexport',        'https://flexport.com',        'Logistics / Supply Chain', 'active'),
  ('MongoDB',         'mongodb',         'mongodb',         'https://mongodb.com',         'Database / Cloud',         'active'),
  ('Elastic',         'elastic',         'elastic',         'https://elastic.co',          'Search / Analytics',       'active'),
  ('Cockroach Labs',  'cockroach labs',  'cockroach-labs',  'https://cockroachlabs.com',   'Database',                 'active'),
  ('Okta',            'okta',            'okta',            'https://okta.com',            'Identity / Security',      'active'),
  ('PagerDuty',       'pagerduty',       'pagerduty',       'https://pagerduty.com',       'DevOps / Monitoring',      'active'),
  ('LaunchDarkly',    'launchdarkly',    'launchdarkly',    'https://launchdarkly.com',    'Feature Management',       'active'),
  ('HubSpot',         'hubspot',         'hubspot',         'https://hubspot.com',         'Marketing / CRM',          'active'),
  ('Twilio',          'twilio',          'twilio',          'https://twilio.com',          'Communications / API',     'active'),
  ('Postman',         'postman',         'postman',         'https://postman.com',         'Developer Tools / API',    'active'),
  ('Checkr',          'checkr',          'checkr',          'https://checkr.com',          'HR / Background Checks',   'active'),
  ('Datadog',         'datadog',         'datadog',         'https://datadoghq.com',       'Monitoring / Observability','active')
ON CONFLICT (normalized_name) DO UPDATE
SET
  name = EXCLUDED.name,
  website = EXCLUDED.website,
  industry = EXCLUDED.industry,
  status = EXCLUDED.status;

-- ── ASHBY COMPANIES (16 verified) ───────────────────────────────────────────

INSERT INTO public.companies (name, normalized_name, slug, website, industry, status)
VALUES
  ('OpenAI',          'openai',          'openai',          'https://openai.com',          'AI / Research',            'active'),
  ('Linear',          'linear',          'linear',          'https://linear.app',          'Developer Tools',          'active'),
  ('Supabase',        'supabase',        'supabase',        'https://supabase.com',        'Developer Tools / Cloud',  'active'),
  ('Warp',            'warp',            'warp',            'https://warp.dev',            'Developer Tools',          'active'),
  ('Resend',          'resend',          'resend',          'https://resend.com',          'Developer Tools / Email',  'active'),
  ('Perplexity AI',   'perplexity ai',   'perplexity-ai',   'https://perplexity.ai',       'AI / Search',              'active'),
  ('Replit',          'replit',          'replit',          'https://replit.com',          'Developer Tools / Cloud',  'active'),
  ('Cursor',          'cursor',          'cursor',          'https://cursor.com',          'AI / Developer Tools',     'active'),
  ('Modal',           'modal',           'modal',           'https://modal.com',           'AI / Cloud Infrastructure','active'),
  ('ElevenLabs',      'elevenlabs',      'elevenlabs',      'https://elevenlabs.io',       'AI / Audio',               'active'),
  ('Cartesia',        'cartesia',        'cartesia',        'https://cartesia.ai',         'AI / Voice',               'active'),
  ('LangChain',       'langchain',       'langchain',       'https://langchain.com',       'AI / Developer Tools',     'active'),
  ('Cohere',          'cohere',          'cohere',          'https://cohere.com',          'AI / NLP',                 'active'),
  ('Runway',          'runway',          'runway',          'https://runwayml.com',        'AI / Creative Tools',      'active'),
  ('Anyscale',        'anyscale',        'anyscale',        'https://anyscale.com',        'AI / Cloud Infrastructure','active'),
  ('TLDraw',          'tldraw',          'tldraw',          'https://tldraw.com',          'Design / Developer Tools', 'active')
ON CONFLICT (normalized_name) DO UPDATE
SET
  name = EXCLUDED.name,
  website = EXCLUDED.website,
  industry = EXCLUDED.industry,
  status = EXCLUDED.status;

-- ── LEVER COMPANIES (1 verified) ────────────────────────────────────────────

INSERT INTO public.companies (name, normalized_name, slug, website, industry, status)
VALUES
  ('Palantir',        'palantir',        'palantir',        'https://palantir.com',        'Data Analytics / Defense', 'active')
ON CONFLICT (normalized_name) DO UPDATE
SET
  name = EXCLUDED.name,
  website = EXCLUDED.website,
  industry = EXCLUDED.industry,
  status = EXCLUDED.status;


-- ==========================================================================
-- PHASE 2: Insert company_sources using stable DB identity lookups
-- Resolves source_id from sources.adapter_name, company_id from companies.normalized_name
-- ON CONFLICT (company_id, source_id, source_identifier) DO NOTHING for idempotency
-- ==========================================================================

-- ── GREENHOUSE SOURCES ──────────────────────────────────────────────────────

INSERT INTO public.company_sources (company_id, source_id, source_identifier, source_url, is_active, health_status, consecutive_failures)
SELECT c.id, s.id, v.identifier, v.source_url, true, 'healthy'::health_status_enum, 0
FROM (VALUES
  ('cloudflare',     'cloudflare',     'https://boards.greenhouse.io/cloudflare'),
  ('discord',        'discord',        'https://boards.greenhouse.io/discord'),
  ('gitlab',         'gitlab',         'https://boards.greenhouse.io/gitlab'),
  ('reddit',         'reddit',         'https://boards.greenhouse.io/reddit'),
  ('instacart',      'instacart',      'https://boards.greenhouse.io/instacart'),
  ('robinhood',      'robinhood',      'https://boards.greenhouse.io/robinhood'),
  ('gusto',          'gusto',          'https://boards.greenhouse.io/gusto'),
  ('scale ai',       'scaleai',        'https://boards.greenhouse.io/scaleai'),
  ('affirm',         'affirm',         'https://boards.greenhouse.io/affirm'),
  ('chime',          'chime',          'https://boards.greenhouse.io/chime'),
  ('monzo',          'monzo',          'https://boards.greenhouse.io/monzo'),
  ('flexport',       'flexport',       'https://boards.greenhouse.io/flexport'),
  ('mongodb',        'mongodb',        'https://boards.greenhouse.io/mongodb'),
  ('elastic',        'elastic',        'https://boards.greenhouse.io/elastic'),
  ('cockroach labs', 'cockroachlabs',  'https://boards.greenhouse.io/cockroachlabs'),
  ('okta',           'okta',           'https://boards.greenhouse.io/okta'),
  ('pagerduty',      'pagerduty',      'https://boards.greenhouse.io/pagerduty'),
  ('launchdarkly',   'launchdarkly',   'https://boards.greenhouse.io/launchdarkly'),
  ('hubspot',        'hubspot',        'https://boards.greenhouse.io/hubspot'),
  ('twilio',         'twilio',         'https://boards.greenhouse.io/twilio'),
  ('postman',        'postman',        'https://boards.greenhouse.io/postman'),
  ('checkr',         'checkr',         'https://boards.greenhouse.io/checkr'),
  ('datadog',        'datadog',        'https://boards.greenhouse.io/datadog')
) AS v(company_name, identifier, source_url)
JOIN public.companies c ON c.normalized_name = v.company_name
JOIN public.sources s ON s.adapter_name = 'greenhouse'
ON CONFLICT (company_id, source_id, source_identifier) DO NOTHING;

-- ── ASHBY SOURCES ───────────────────────────────────────────────────────────

INSERT INTO public.company_sources (company_id, source_id, source_identifier, source_url, is_active, health_status, consecutive_failures)
SELECT c.id, s.id, v.identifier, v.source_url, true, 'healthy'::health_status_enum, 0
FROM (VALUES
  ('openai',         'openai',         'https://jobs.ashbyhq.com/openai'),
  ('linear',         'linear',         'https://jobs.ashbyhq.com/linear'),
  ('supabase',       'supabase',       'https://jobs.ashbyhq.com/supabase'),
  ('warp',           'warp',           'https://jobs.ashbyhq.com/warp'),
  ('resend',         'resend',         'https://jobs.ashbyhq.com/resend'),
  ('perplexity ai',  'perplexity',     'https://jobs.ashbyhq.com/perplexity'),
  ('replit',         'replit',         'https://jobs.ashbyhq.com/replit'),
  ('cursor',         'cursor',         'https://jobs.ashbyhq.com/cursor'),
  ('modal',          'modal',          'https://jobs.ashbyhq.com/modal'),
  ('elevenlabs',     'elevenlabs',     'https://jobs.ashbyhq.com/elevenlabs'),
  ('cartesia',       'cartesia',       'https://jobs.ashbyhq.com/cartesia'),
  ('langchain',      'langchain',      'https://jobs.ashbyhq.com/langchain'),
  ('cohere',         'cohere',         'https://jobs.ashbyhq.com/cohere'),
  ('runway',         'runway',         'https://jobs.ashbyhq.com/runway'),
  ('anyscale',       'anyscale',       'https://jobs.ashbyhq.com/anyscale'),
  ('tldraw',         'tldraw',         'https://jobs.ashbyhq.com/tldraw')
) AS v(company_name, identifier, source_url)
JOIN public.companies c ON c.normalized_name = v.company_name
JOIN public.sources s ON s.adapter_name = 'ashby'
ON CONFLICT (company_id, source_id, source_identifier) DO NOTHING;

-- ── LEVER SOURCES ───────────────────────────────────────────────────────────

INSERT INTO public.company_sources (company_id, source_id, source_identifier, source_url, is_active, health_status, consecutive_failures)
SELECT c.id, s.id, v.identifier, v.source_url, true, 'healthy'::health_status_enum, 0
FROM (VALUES
  ('palantir',       'palantir',       'https://jobs.lever.co/palantir')
) AS v(company_name, identifier, source_url)
JOIN public.companies c ON c.normalized_name = v.company_name
JOIN public.sources s ON s.adapter_name = 'lever'
ON CONFLICT (company_id, source_id, source_identifier) DO NOTHING;
