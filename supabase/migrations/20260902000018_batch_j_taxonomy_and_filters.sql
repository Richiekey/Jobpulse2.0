-- =============================================================================
-- Migration 0018: Batch J — Taxonomy, Structured Location & ATS Denormalization
-- =============================================================================
-- Purpose:
--   1. Create hierarchical job_functions taxonomy table
--   2. Add denormalized filter columns to jobs (ats, function, location)
--   3. Update ingest_job_transaction to accept new fields
--   4. Backfill existing 1,095 jobs
--   5. Add performant indexes for bidder search filters
--
-- Safety:
--   - All new columns are NULLABLE (no NOT NULL on existing data)
--   - Backfill uses deterministic rules
--   - Existing RLS policies unaffected (SELECT already allowed on jobs)
--   - ingest_job_transaction signature extended with DEFAULT NULL params
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. job_functions taxonomy table (hierarchical, extensible)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_functions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  parent_slug TEXT REFERENCES public.job_functions(slug) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON TABLE public.job_functions IS 'Hierarchical job function taxonomy for bidder search filters';

-- RLS: job_functions is public read, admin write
ALTER TABLE public.job_functions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_functions_public_read" ON public.job_functions
  FOR SELECT USING (TRUE);

CREATE POLICY "job_functions_admin_write" ON public.job_functions
  FOR ALL USING (public.is_admin());

-- Seed the initial taxonomy
INSERT INTO public.job_functions (name, slug, parent_slug, sort_order) VALUES
  -- Top-level categories
  ('Software Engineering',    'software-engineering',    NULL, 1),
  ('Data / AI / ML',          'data-ai-ml',              NULL, 2),
  ('Cybersecurity / Cloud',   'cybersecurity-cloud',     NULL, 3),
  ('Product',                 'product',                 NULL, 4),
  ('Design',                  'design',                  NULL, 5),
  ('Business / Operations',   'business-operations',     NULL, 6),
  ('Sales / Marketing',       'sales-marketing',         NULL, 7),
  ('Finance / Accounting',    'finance-accounting',      NULL, 8),
  ('HR / People',             'hr-people',               NULL, 9),
  ('Customer Support / Success', 'customer-support',     NULL, 10),
  ('Legal',                   'legal',                   NULL, 11),
  ('Healthcare',              'healthcare',              NULL, 12),
  ('Education',               'education',               NULL, 13),
  ('Research',                'research',                NULL, 14),
  ('Other',                   'other',                   NULL, 99),

  -- Software Engineering sub-functions
  ('Frontend',        'software-frontend',       'software-engineering', 101),
  ('Backend',         'software-backend',        'software-engineering', 102),
  ('Full Stack',      'software-fullstack',      'software-engineering', 103),
  ('Mobile',          'software-mobile',         'software-engineering', 104),
  ('DevOps',          'software-devops',         'software-engineering', 105),
  ('Infrastructure',  'software-infrastructure', 'software-engineering', 106),
  ('SRE',             'software-sre',            'software-engineering', 107),
  ('Embedded',        'software-embedded',       'software-engineering', 108),
  ('QA / Testing',    'software-qa',             'software-engineering', 109),

  -- Data / AI / ML sub-functions
  ('Data Science',       'data-science',       'data-ai-ml', 201),
  ('Data Engineering',   'data-engineering',   'data-ai-ml', 202),
  ('Machine Learning',   'data-ml',            'data-ai-ml', 203),
  ('AI Engineering',     'data-ai-engineering','data-ai-ml', 204),
  ('Analytics',          'data-analytics',     'data-ai-ml', 205),
  ('Research Scientist', 'data-research',      'data-ai-ml', 206),

  -- Cybersecurity sub-functions
  ('Security Engineering', 'security-engineering', 'cybersecurity-cloud', 301),
  ('Cloud Engineering',    'cloud-engineering',    'cybersecurity-cloud', 302),
  ('DevSecOps',            'devsecops',            'cybersecurity-cloud', 303)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. New columns on jobs table
-- ---------------------------------------------------------------------------
-- Denormalized ATS slug for fast filtering (consistent with ats_platforms.slug)
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS ats_platform_slug TEXT;

-- Job function classification
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_function_slug TEXT;

-- Classification provenance for audit
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_function_confidence TEXT;

-- Structured location decomposition (preserves existing locations[] as raw)
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS location_country TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS location_region TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS location_city TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS is_remote BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 3. Indexes for bidder search filters
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jobs_ats_platform_slug
  ON public.jobs (ats_platform_slug)
  WHERE ats_platform_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_job_function_slug
  ON public.jobs (job_function_slug)
  WHERE job_function_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_location_country
  ON public.jobs (location_country)
  WHERE location_country IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_is_remote
  ON public.jobs (is_remote)
  WHERE is_remote = TRUE;

-- Composite index for the most common bidder query pattern
CREATE INDEX IF NOT EXISTS idx_jobs_feed_function_ats
  ON public.jobs (status, job_function_slug, ats_platform_slug, posted_at DESC, id DESC)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 4. Backfill existing jobs — ATS platform slug
-- ---------------------------------------------------------------------------
-- Derive from job_sources → sources → adapter_name (which IS the ATS slug)
UPDATE public.jobs j
SET ats_platform_slug = sub.adapter_name
FROM (
  SELECT DISTINCT ON (js.job_id) js.job_id, s.adapter_name
  FROM public.job_sources js
  JOIN public.sources s ON js.source_id = s.id
  ORDER BY js.job_id, js.is_primary DESC NULLS LAST, js.created_at ASC
) sub
WHERE j.id = sub.job_id
  AND j.ats_platform_slug IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Backfill existing jobs — Job function classification (deterministic)
-- ---------------------------------------------------------------------------
UPDATE public.jobs SET
  job_function_slug = CASE
    -- Software Engineering (order matters — more specific first)
    WHEN lower(canonical_title) ~ '(frontend|front end|front-end|ui engineer|ui developer)' THEN 'software-frontend'
    WHEN lower(canonical_title) ~ '(backend|back end|back-end|server engineer|server developer)' THEN 'software-backend'
    WHEN lower(canonical_title) ~ '(full.?stack|fullstack)' THEN 'software-fullstack'
    WHEN lower(canonical_title) ~ '(mobile|ios|android|react native|flutter)' THEN 'software-mobile'
    WHEN lower(canonical_title) ~ '(devops|dev ops|ci/cd|release engineer)' THEN 'software-devops'
    WHEN lower(canonical_title) ~ '(infrastructure|platform engineer)' THEN 'software-infrastructure'
    WHEN lower(canonical_title) ~ '(sre|site reliability|reliability engineer)' THEN 'software-sre'
    WHEN lower(canonical_title) ~ '(embedded|firmware)' THEN 'software-embedded'
    WHEN lower(canonical_title) ~ '(qa |quality assurance|test engineer|sdet|automation engineer)' THEN 'software-qa'
    WHEN lower(canonical_title) ~ '(software|engineer|developer|programmer|swe |sde )' THEN 'software-engineering'

    -- Data / AI / ML
    WHEN lower(canonical_title) ~ '(data scientist|data science)' THEN 'data-science'
    WHEN lower(canonical_title) ~ '(data engineer|etl|data pipeline)' THEN 'data-engineering'
    WHEN lower(canonical_title) ~ '(machine learning|ml engineer|deep learning)' THEN 'data-ml'
    WHEN lower(canonical_title) ~ '(ai engineer|artificial intelligence|llm|nlp|computer vision)' THEN 'data-ai-engineering'
    WHEN lower(canonical_title) ~ '(analytics|bi analyst|business intelligence|data analyst)' THEN 'data-analytics'
    WHEN lower(canonical_title) ~ '(research scientist|research engineer)' THEN 'data-research'

    -- Cybersecurity / Cloud
    WHEN lower(canonical_title) ~ '(security|cybersecurity|infosec|soc analyst|penetration|iam engineer|appsec)' THEN 'cybersecurity-cloud'
    WHEN lower(canonical_title) ~ '(cloud engineer|cloud architect|aws|azure|gcp)' AND lower(canonical_title) !~ 'sales' THEN 'cloud-engineering'
    WHEN lower(canonical_title) ~ '(devsecops)' THEN 'devsecops'

    -- Product
    WHEN lower(canonical_title) ~ '(product manager|product owner|product lead|product director|technical product)' THEN 'product'

    -- Design
    WHEN lower(canonical_title) ~ '(product designer|ux designer|ui designer|ux researcher|graphic designer|design lead|visual designer|interaction designer)' THEN 'design'

    -- Business / Operations
    WHEN lower(canonical_title) ~ '(operations manager|business analyst|program manager|project manager|operations analyst|chief of staff|strategy)' THEN 'business-operations'

    -- Sales / Marketing
    WHEN lower(canonical_title) ~ '(account executive|sales|business development|bdr|sdr|growth|marketing|content marketing|demand gen)' THEN 'sales-marketing'

    -- Finance / Accounting
    WHEN lower(canonical_title) ~ '(accountant|financial analyst|finance manager|controller|treasury|fp&a|revenue)' THEN 'finance-accounting'

    -- HR / People
    WHEN lower(canonical_title) ~ '(recruiter|talent acquisition|hr manager|people operations|human resources|compensation|benefits)' THEN 'hr-people'

    -- Customer Support / Success
    WHEN lower(canonical_title) ~ '(customer success|customer support|technical support|support engineer|client success)' THEN 'customer-support'

    -- Legal
    WHEN lower(canonical_title) ~ '(legal counsel|paralegal|compliance|general counsel|attorney|lawyer)' THEN 'legal'

    -- Healthcare
    WHEN lower(canonical_title) ~ '(nurse|physician|clinical|medical|pharmacist|health)' THEN 'healthcare'

    -- Education
    WHEN lower(canonical_title) ~ '(teacher|professor|instructor|curriculum|education)' THEN 'education'

    -- Research
    WHEN lower(canonical_title) ~ '(researcher|research fellow|postdoc)' AND lower(canonical_title) !~ '(ux|user|market)' THEN 'research'

    ELSE 'other'
  END,
  job_function_confidence = 'backfill_title_match'
WHERE job_function_slug IS NULL;

-- ---------------------------------------------------------------------------
-- 6. Backfill existing jobs — Structured location + remote flag
-- ---------------------------------------------------------------------------
-- Parse first location entry for country/region/city using comma-split heuristic
-- Also detect remote from workplace_type and location text
UPDATE public.jobs SET
  is_remote = (
    workplace_type = 'remote'
    OR EXISTS (
      SELECT 1 FROM unnest(locations) loc WHERE lower(loc) ~ '(remote|anywhere|worldwide)'
    )
  ),
  location_country = CASE
    -- Direct country matches from first location
    WHEN locations[1] ILIKE '%United States%' OR locations[1] ILIKE '%USA%' OR locations[1] ILIKE '%, US' THEN 'United States'
    WHEN locations[1] ILIKE '%United Kingdom%' OR locations[1] ILIKE '%UK%' THEN 'United Kingdom'
    WHEN locations[1] ILIKE '%Canada%' THEN 'Canada'
    WHEN locations[1] ILIKE '%Nigeria%' THEN 'Nigeria'
    WHEN locations[1] ILIKE '%Germany%' THEN 'Germany'
    WHEN locations[1] ILIKE '%India%' THEN 'India'
    WHEN locations[1] ILIKE '%Australia%' THEN 'Australia'
    WHEN locations[1] ILIKE '%France%' THEN 'France'
    WHEN locations[1] ILIKE '%Ireland%' THEN 'Ireland'
    WHEN locations[1] ILIKE '%Singapore%' THEN 'Singapore'
    WHEN locations[1] ILIKE '%Japan%' THEN 'Japan'
    WHEN locations[1] ILIKE '%Brazil%' THEN 'Brazil'
    WHEN locations[1] ILIKE '%Netherlands%' THEN 'Netherlands'
    WHEN locations[1] ILIKE '%Israel%' THEN 'Israel'
    WHEN locations[1] ILIKE '%Sweden%' THEN 'Sweden'
    WHEN locations[1] ILIKE '%Switzerland%' THEN 'Switzerland'
    WHEN locations[1] ILIKE '%Spain%' THEN 'Spain'
    WHEN locations[1] ILIKE '%Mexico%' THEN 'Mexico'
    WHEN locations[1] ILIKE '%South Korea%' THEN 'South Korea'
    WHEN locations[1] ILIKE '%Poland%' THEN 'Poland'
    -- US state abbreviation detection (common pattern: "City, ST" or "City, State")
    WHEN locations[1] ~ ', (AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)$' THEN 'United States'
    WHEN locations[1] ~ ', (California|New York|Texas|Washington|Massachusetts|Illinois|Colorado|Georgia|Virginia|Florida|Oregon|North Carolina|Pennsylvania|Arizona|Ohio|Michigan|Minnesota|Maryland|Tennessee|Utah|Connecticut|New Jersey|Indiana|Wisconsin|Missouri|Nevada)' THEN 'United States'
    ELSE NULL
  END,
  location_city = CASE
    -- Extract city (first segment before comma)
    WHEN locations[1] LIKE '%,%' AND locations[1] NOT ILIKE 'remote%' AND locations[1] NOT ILIKE 'unspecified%'
      THEN trim(split_part(locations[1], ',', 1))
    ELSE NULL
  END,
  location_region = CASE
    -- Extract region/state (second segment in "City, State, Country" or "City, State")
    WHEN locations[1] LIKE '%,%,%'
      THEN trim(split_part(locations[1], ',', 2))
    WHEN locations[1] LIKE '%,%' AND locations[1] ~ ', (AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)$'
      THEN trim(split_part(locations[1], ',', 2))
    ELSE NULL
  END
WHERE location_country IS NULL AND location_city IS NULL;

-- ---------------------------------------------------------------------------
-- 7. Replace ingest_job_transaction to accept new Batch J fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingest_job_transaction(
  p_company_id UUID,
  p_canonical_title TEXT,
  p_display_title TEXT,
  p_description TEXT,
  p_description_html TEXT DEFAULT NULL,
  p_employment_type public.employment_type_enum DEFAULT 'full_time',
  p_workplace_type public.workplace_type_enum DEFAULT 'unspecified',
  p_locations TEXT[] DEFAULT '{}',
  p_salary_min NUMERIC DEFAULT NULL,
  p_salary_max NUMERIC DEFAULT NULL,
  p_salary_currency TEXT DEFAULT NULL,
  p_salary_interval TEXT DEFAULT NULL,
  p_annualized_min NUMERIC DEFAULT NULL,
  p_annualized_max NUMERIC DEFAULT NULL,
  p_has_salary BOOLEAN DEFAULT FALSE,
  p_equity_mentioned BOOLEAN DEFAULT FALSE,
  p_skills TEXT[] DEFAULT '{}',
  p_posted_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  p_canonical_url TEXT DEFAULT '',
  p_apply_url TEXT DEFAULT '',
  p_original_apply_url TEXT DEFAULT NULL,
  p_url_resolution_method TEXT DEFAULT 'direct',
  p_url_resolution_confidence NUMERIC DEFAULT 1.0,
  p_canonical_fingerprint VARCHAR DEFAULT NULL,
  p_source_id UUID DEFAULT NULL,
  p_external_job_id TEXT DEFAULT '',
  p_source_job_url TEXT DEFAULT '',
  p_discovery_url TEXT DEFAULT '',
  p_raw_payload_hash TEXT DEFAULT '',
  p_raw_payload JSONB DEFAULT NULL,
  p_parser_version TEXT DEFAULT 'unknown',
  p_source_metadata JSONB DEFAULT '{}'::jsonb,
  -- Batch J new parameters
  p_ats_platform_slug TEXT DEFAULT NULL,
  p_job_function_slug TEXT DEFAULT NULL,
  p_job_function_confidence TEXT DEFAULT NULL,
  p_location_country TEXT DEFAULT NULL,
  p_location_region TEXT DEFAULT NULL,
  p_location_city TEXT DEFAULT NULL,
  p_is_remote BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_job_id UUID; v_job_source_id UUID; v_status TEXT; v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF NOT public.verify_worker_access() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not authorized to invoke ingest_job_transaction';
  END IF;

  SELECT job_id, id INTO v_job_id, v_job_source_id FROM public.job_sources
  WHERE source_id = p_source_id AND external_job_id = p_external_job_id LIMIT 1;

  IF v_job_id IS NULL AND p_canonical_url IS NOT NULL AND p_canonical_url <> '' THEN
    SELECT id INTO v_job_id FROM public.jobs WHERE canonical_url = p_canonical_url AND status = 'active' LIMIT 1;
  END IF;

  IF v_job_id IS NOT NULL THEN
    UPDATE public.jobs SET
      canonical_title=p_canonical_title, display_title=p_display_title,
      description=p_description, description_html=p_description_html,
      employment_type=p_employment_type, workplace_type=p_workplace_type,
      locations=p_locations, salary_min=p_salary_min, salary_max=p_salary_max,
      salary_currency=p_salary_currency, salary_interval=p_salary_interval,
      annualized_min=p_annualized_min, annualized_max=p_annualized_max,
      has_salary=p_has_salary, equity_mentioned=p_equity_mentioned,
      skills=p_skills, status='active', missed_scrape_count=0,
      canonical_url=p_canonical_url, apply_url=p_apply_url,
      original_apply_url=p_original_apply_url, url_resolution_method=p_url_resolution_method,
      url_resolution_confidence=p_url_resolution_confidence, canonical_fingerprint=p_canonical_fingerprint,
      last_seen_at=v_now, source_metadata=COALESCE(p_source_metadata,'{}'::jsonb), updated_at=v_now,
      -- Batch J fields
      ats_platform_slug=COALESCE(p_ats_platform_slug, ats_platform_slug),
      job_function_slug=COALESCE(p_job_function_slug, job_function_slug),
      job_function_confidence=COALESCE(p_job_function_confidence, job_function_confidence),
      location_country=COALESCE(p_location_country, location_country),
      location_region=COALESCE(p_location_region, location_region),
      location_city=COALESCE(p_location_city, location_city),
      is_remote=COALESCE(p_is_remote, is_remote)
    WHERE id = v_job_id;

    INSERT INTO public.job_sources (job_id,source_id,external_job_id,discovery_url,source_job_url,raw_payload_hash,first_seen_at,last_seen_at,created_at,updated_at)
    VALUES (v_job_id,p_source_id,p_external_job_id,p_discovery_url,p_source_job_url,p_raw_payload_hash,v_now,v_now,v_now,v_now)
    ON CONFLICT (source_id, external_job_id) DO UPDATE SET
      raw_payload_hash=EXCLUDED.raw_payload_hash, source_job_url=EXCLUDED.source_job_url,
      discovery_url=EXCLUDED.discovery_url, last_seen_at=v_now, updated_at=v_now
    RETURNING id INTO v_job_source_id;
    v_status := 'updated';
  ELSE
    INSERT INTO public.jobs (company_id,canonical_title,display_title,description,description_html,employment_type,workplace_type,locations,salary_min,salary_max,salary_currency,salary_interval,annualized_min,annualized_max,has_salary,equity_mentioned,skills,posted_at,first_seen_at,last_seen_at,status,missed_scrape_count,canonical_url,apply_url,original_apply_url,url_resolution_method,url_resolution_confidence,canonical_fingerprint,source_metadata,created_at,updated_at,ats_platform_slug,job_function_slug,job_function_confidence,location_country,location_region,location_city,is_remote)
    VALUES (p_company_id,p_canonical_title,p_display_title,p_description,p_description_html,p_employment_type,p_workplace_type,p_locations,p_salary_min,p_salary_max,p_salary_currency,p_salary_interval,p_annualized_min,p_annualized_max,p_has_salary,p_equity_mentioned,p_skills,p_posted_at,v_now,v_now,'active',0,p_canonical_url,p_apply_url,p_original_apply_url,p_url_resolution_method,p_url_resolution_confidence,p_canonical_fingerprint,COALESCE(p_source_metadata,'{}'::jsonb),v_now,v_now,p_ats_platform_slug,p_job_function_slug,p_job_function_confidence,p_location_country,p_location_region,p_location_city,p_is_remote)
    RETURNING id INTO v_job_id;

    INSERT INTO public.job_sources (job_id,source_id,external_job_id,discovery_url,source_job_url,raw_payload_hash,first_seen_at,last_seen_at,created_at,updated_at)
    VALUES (v_job_id,p_source_id,p_external_job_id,p_discovery_url,p_source_job_url,p_raw_payload_hash,v_now,v_now,v_now,v_now)
    RETURNING id INTO v_job_source_id;
    v_status := 'inserted';
  END IF;

  IF p_raw_payload IS NOT NULL THEN
    INSERT INTO public.raw_job_payloads (source_id,external_id,payload,payload_hash,parser_version,fetched_at)
    VALUES (p_source_id,p_external_job_id,p_raw_payload,p_raw_payload_hash,p_parser_version,v_now);
  END IF;

  RETURN jsonb_build_object('status',v_status,'job_id',v_job_id,'job_source_id',v_job_source_id);
END;
$$;

-- Grant execute to service_role (worker access)
GRANT EXECUTE ON FUNCTION public.ingest_job_transaction TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Update search_vector trigger to include new fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_jobs_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.canonical_title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.display_title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.locations, ' '), '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.skills, ' '), '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.location_country, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.location_city, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$;

-- Rebuild search vectors for existing jobs to include location fields
UPDATE public.jobs SET search_vector =
  setweight(to_tsvector('english', COALESCE(canonical_title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(display_title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(locations, ' '), '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(skills, ' '), '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(location_country, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(location_city, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'C');
