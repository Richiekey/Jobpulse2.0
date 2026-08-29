-- ============================================================================
-- JobPulse 2.0 — Salary & Compensation Intelligence, Normalization & Indexing
-- Version: 20260829000014
-- Description: Adds annualized salary columns, check constraints, partial indexes, and currency-isolated market benchmarking RPC.
-- ============================================================================

-- 1. ADD ANNUALIZED & COMPENSATION FIELDS TO public.jobs
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS annualized_min NUMERIC,
ADD COLUMN IF NOT EXISTS annualized_max NUMERIC,
ADD COLUMN IF NOT EXISTS has_salary BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS equity_mentioned BOOLEAN NOT NULL DEFAULT false;

-- Populate existing rows based on current salary fields with documented interval standards
UPDATE public.jobs
SET has_salary = (salary_min IS NOT NULL OR salary_max IS NOT NULL),
    annualized_min = CASE
      WHEN salary_interval = 'hourly' THEN round(salary_min * 2080)
      WHEN salary_interval = 'daily' THEN round(salary_min * 260)
      WHEN salary_interval = 'weekly' THEN round(salary_min * 52)
      WHEN salary_interval = 'monthly' THEN round(salary_min * 12)
      ELSE round(salary_min)
    END,
    annualized_max = CASE
      WHEN salary_interval = 'hourly' THEN round(salary_max * 2080)
      WHEN salary_interval = 'daily' THEN round(salary_max * 260)
      WHEN salary_interval = 'weekly' THEN round(salary_max * 52)
      WHEN salary_interval = 'monthly' THEN round(salary_max * 12)
      ELSE round(salary_max)
    END
WHERE salary_min IS NOT NULL OR salary_max IS NOT NULL;

-- 2. DATABASE INTEGRITY CONSTRAINTS (P1 Remediation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_salary_min_non_negative'
  ) THEN
    ALTER TABLE public.jobs ADD CONSTRAINT check_salary_min_non_negative CHECK (salary_min IS NULL OR salary_min >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_salary_max_non_negative'
  ) THEN
    ALTER TABLE public.jobs ADD CONSTRAINT check_salary_max_non_negative CHECK (salary_max IS NULL OR salary_max >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_annualized_min_non_negative'
  ) THEN
    ALTER TABLE public.jobs ADD CONSTRAINT check_annualized_min_non_negative CHECK (annualized_min IS NULL OR annualized_min >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_annualized_max_non_negative'
  ) THEN
    ALTER TABLE public.jobs ADD CONSTRAINT check_annualized_max_non_negative CHECK (annualized_max IS NULL OR annualized_max >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_salary_bounds'
  ) THEN
    ALTER TABLE public.jobs ADD CONSTRAINT check_salary_bounds CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_annualized_bounds'
  ) THEN
    ALTER TABLE public.jobs ADD CONSTRAINT check_annualized_bounds CHECK (annualized_min IS NULL OR annualized_max IS NULL OR annualized_min <= annualized_max);
  END IF;
END $$;

-- 3. PARTIAL INDEXES FOR SUB-MILLISECOND SALARY SEARCH & FILTERING
CREATE INDEX IF NOT EXISTS idx_jobs_annualized_salary 
ON public.jobs (salary_currency, annualized_min, annualized_max) 
WHERE has_salary = true AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_jobs_has_salary 
ON public.jobs (has_salary, first_seen_at DESC) 
WHERE status = 'active';

-- 4. UPDATE INGESTION RPC TO ACCEPT ANNUALIZED FIELDS & 5 INTERVALS
CREATE OR REPLACE FUNCTION public.ingest_normalized_job(
  p_source_id UUID,
  p_company_id UUID,
  p_external_job_id TEXT,
  p_canonical_url TEXT,
  p_apply_url TEXT,
  p_title TEXT,
  p_location_raw TEXT,
  p_country TEXT,
  p_city TEXT,
  p_region TEXT,
  p_workplace_type TEXT,
  p_department TEXT,
  p_employment_type TEXT,
  p_salary_min NUMERIC,
  p_salary_max NUMERIC,
  p_salary_currency TEXT,
  p_salary_interval TEXT,
  p_annualized_min NUMERIC DEFAULT NULL,
  p_annualized_max NUMERIC DEFAULT NULL,
  p_has_salary BOOLEAN DEFAULT false,
  p_equity_mentioned BOOLEAN DEFAULT false,
  p_description_html TEXT DEFAULT NULL,
  p_description_text TEXT DEFAULT NULL,
  p_posted_at TIMESTAMPTZ DEFAULT NULL,
  p_source_data JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  job_id UUID,
  is_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id UUID;
  v_is_new BOOLEAN := false;
  v_source_company_id UUID;
  v_ann_min NUMERIC;
  v_ann_max NUMERIC;
  v_has_sal BOOLEAN;
  v_clean_min NUMERIC := p_salary_min;
  v_clean_max NUMERIC := p_salary_max;
BEGIN
  -- Strict Foreign Key & Company ID matching check
  SELECT company_id INTO v_source_company_id
  FROM public.company_sources
  WHERE id = p_source_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Foreign key violation: source_id % does not exist in company_sources', p_source_id
      USING ERRCODE = '23503';
  END IF;

  IF v_source_company_id != p_company_id THEN
    RAISE EXCEPTION 'Integrity constraint violation: company_id % does not match source company_id %', p_company_id, v_source_company_id
      USING ERRCODE = '23514';
  END IF;

  -- Protect against inverted bounds from ATS source
  IF v_clean_min IS NOT NULL AND v_clean_max IS NOT NULL AND v_clean_min > v_clean_max THEN
    v_ann_min := v_clean_min;
    v_clean_min := v_clean_max;
    v_clean_max := v_ann_min;
  END IF;

  -- Compute or fallback annualized salaries
  v_ann_min := coalesce(p_annualized_min, CASE
    WHEN p_salary_interval = 'hourly' THEN round(v_clean_min * 2080)
    WHEN p_salary_interval = 'daily' THEN round(v_clean_min * 260)
    WHEN p_salary_interval = 'weekly' THEN round(v_clean_min * 52)
    WHEN p_salary_interval = 'monthly' THEN round(v_clean_min * 12)
    ELSE round(v_clean_min)
  END);

  v_ann_max := coalesce(p_annualized_max, CASE
    WHEN p_salary_interval = 'hourly' THEN round(v_clean_max * 2080)
    WHEN p_salary_interval = 'daily' THEN round(v_clean_max * 260)
    WHEN p_salary_interval = 'weekly' THEN round(v_clean_max * 52)
    WHEN p_salary_interval = 'monthly' THEN round(v_clean_max * 12)
    ELSE round(v_clean_max)
  END);

  v_has_sal := coalesce(p_has_salary, (v_clean_min IS NOT NULL OR v_clean_max IS NOT NULL));

  -- 1. Try to find existing active/tracked job by (source_id, external_job_id)
  SELECT id INTO v_job_id
  FROM public.jobs
  WHERE source_id = p_source_id
    AND external_job_id = p_external_job_id;

  IF FOUND THEN
    -- Update existing record
    UPDATE public.jobs
    SET
      company_id = p_company_id,
      canonical_url = p_canonical_url,
      apply_url = p_apply_url,
      title = p_title,
      location_raw = p_location_raw,
      country = p_country,
      city = p_city,
      region = p_region,
      workplace_type = p_workplace_type,
      department = p_department,
      employment_type = p_employment_type,
      salary_min = v_clean_min,
      salary_max = v_clean_max,
      salary_currency = p_salary_currency,
      salary_interval = p_salary_interval,
      annualized_min = v_ann_min,
      annualized_max = v_ann_max,
      has_salary = v_has_sal,
      equity_mentioned = p_equity_mentioned,
      description_html = p_description_html,
      description_text = p_description_text,
      posted_at = p_posted_at,
      source_data = p_source_data,
      last_seen_at = now(),
      status = 'active',
      consecutive_misses = 0,
      updated_at = now()
    WHERE id = v_job_id;

    v_is_new := false;
  ELSE
    -- Check for deduplication match across same company by canonical_url
    SELECT id INTO v_job_id
    FROM public.jobs
    WHERE company_id = p_company_id
      AND canonical_url = p_canonical_url;

    IF FOUND THEN
      -- Existing canonical match within company
      UPDATE public.jobs
      SET
        source_id = p_source_id,
        external_job_id = p_external_job_id,
        apply_url = p_apply_url,
        title = p_title,
        location_raw = p_location_raw,
        country = p_country,
        city = p_city,
        region = p_region,
        workplace_type = p_workplace_type,
        department = p_department,
        employment_type = p_employment_type,
        salary_min = v_clean_min,
        salary_max = v_clean_max,
        salary_currency = p_salary_currency,
        salary_interval = p_salary_interval,
        annualized_min = v_ann_min,
        annualized_max = v_ann_max,
        has_salary = v_has_sal,
        equity_mentioned = p_equity_mentioned,
        description_html = p_description_html,
        description_text = p_description_text,
        posted_at = p_posted_at,
        source_data = p_source_data,
        last_seen_at = now(),
        status = 'active',
        consecutive_misses = 0,
        updated_at = now()
      WHERE id = v_job_id;

      v_is_new := false;
    ELSE
      -- Insert brand new job record
      INSERT INTO public.jobs (
        source_id,
        company_id,
        external_job_id,
        canonical_url,
        apply_url,
        title,
        location_raw,
        country,
        city,
        region,
        workplace_type,
        department,
        employment_type,
        salary_min,
        salary_max,
        salary_currency,
        salary_interval,
        annualized_min,
        annualized_max,
        has_salary,
        equity_mentioned,
        description_html,
        description_text,
        posted_at,
        source_data,
        status,
        consecutive_misses,
        first_seen_at,
        last_seen_at
      ) VALUES (
        p_source_id,
        p_company_id,
        p_external_job_id,
        p_canonical_url,
        p_apply_url,
        p_title,
        p_location_raw,
        p_country,
        p_city,
        p_region,
        p_workplace_type,
        p_department,
        p_employment_type,
        v_clean_min,
        v_clean_max,
        p_salary_currency,
        p_salary_interval,
        v_ann_min,
        v_ann_max,
        v_has_sal,
        p_equity_mentioned,
        p_description_html,
        p_description_text,
        p_posted_at,
        p_source_data,
        'active',
        0,
        now(),
        now()
      )
      RETURNING id INTO v_job_id;

      v_is_new := true;
    END IF;
  END IF;

  RETURN QUERY SELECT v_job_id, v_is_new;
END;
$$;

-- 5. CURRENCY-ISOLATED MARKET SALARY BENCHMARKING RPC (P0 Remediation)
CREATE OR REPLACE FUNCTION public.get_salary_benchmarks(
  p_query TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_workplace_type TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_currency IS NOT NULL AND p_currency != '' AND p_currency != 'all' THEN
    -- Single-currency benchmark calculation
    WITH eligible_jobs AS (
      SELECT 
        annualized_min,
        annualized_max,
        coalesce(annualized_min, annualized_max) AS representative_salary,
        equity_mentioned
      FROM public.jobs
      WHERE status = 'active'
        AND has_salary = true
        AND salary_currency = upper(p_currency)
        AND (p_query IS NULL OR p_query = '' OR title ILIKE '%' || p_query || '%' OR description_text ILIKE '%' || p_query || '%')
        AND (p_department IS NULL OR p_department = '' OR department ILIKE '%' || p_department || '%')
        AND (p_workplace_type IS NULL OR p_workplace_type = 'all' OR workplace_type = p_workplace_type)
    ),
    stats AS (
      SELECT
        count(*)::INT AS sample_size,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY representative_salary) AS p25,
        percentile_cont(0.50) WITHIN GROUP (ORDER BY representative_salary) AS median,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY representative_salary) AS p75,
        min(representative_salary) AS min_salary,
        max(representative_salary) AS max_salary,
        round(avg(CASE WHEN equity_mentioned THEN 100.0 ELSE 0.0 END), 1) AS equity_rate
      FROM eligible_jobs
    )
    SELECT jsonb_build_object(
      'currency', upper(p_currency),
      'sample_size', coalesce(sample_size, 0),
      'p25', CASE WHEN coalesce(sample_size, 0) >= 3 THEN round(coalesce(p25, 0)::numeric) ELSE NULL END,
      'median', CASE WHEN coalesce(sample_size, 0) >= 3 THEN round(coalesce(median, 0)::numeric) ELSE NULL END,
      'p75', CASE WHEN coalesce(sample_size, 0) >= 3 THEN round(coalesce(p75, 0)::numeric) ELSE NULL END,
      'min', round(coalesce(min_salary, 0)::numeric),
      'max', round(coalesce(max_salary, 0)::numeric),
      'equity_rate', coalesce(equity_rate, 0.0),
      'insufficient_data', (coalesce(sample_size, 0) < 3)
    )
    INTO v_result
    FROM stats;

  ELSE
    -- Grouped multi-currency benchmarks (never combining raw cross-currency numbers)
    WITH eligible_jobs AS (
      SELECT 
        salary_currency AS curr,
        annualized_min,
        annualized_max,
        coalesce(annualized_min, annualized_max) AS representative_salary,
        equity_mentioned
      FROM public.jobs
      WHERE status = 'active'
        AND has_salary = true
        AND salary_currency IS NOT NULL
        AND (p_query IS NULL OR p_query = '' OR title ILIKE '%' || p_query || '%' OR description_text ILIKE '%' || p_query || '%')
        AND (p_department IS NULL OR p_department = '' OR department ILIKE '%' || p_department || '%')
        AND (p_workplace_type IS NULL OR p_workplace_type = 'all' OR workplace_type = p_workplace_type)
    ),
    currency_stats AS (
      SELECT
        curr,
        count(*)::INT AS sample_size,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY representative_salary) AS p25,
        percentile_cont(0.50) WITHIN GROUP (ORDER BY representative_salary) AS median,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY representative_salary) AS p75,
        min(representative_salary) AS min_salary,
        max(representative_salary) AS max_salary,
        round(avg(CASE WHEN equity_mentioned THEN 100.0 ELSE 0.0 END), 1) AS equity_rate
      FROM eligible_jobs
      GROUP BY curr
      ORDER BY count(*) DESC
    )
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'currency', curr,
        'sample_size', sample_size,
        'p25', CASE WHEN sample_size >= 3 THEN round(coalesce(p25, 0)::numeric) ELSE NULL END,
        'median', CASE WHEN sample_size >= 3 THEN round(coalesce(median, 0)::numeric) ELSE NULL END,
        'p75', CASE WHEN sample_size >= 3 THEN round(coalesce(p75, 0)::numeric) ELSE NULL END,
        'min', round(coalesce(min_salary, 0)::numeric),
        'max', round(coalesce(max_salary, 0)::numeric),
        'equity_rate', coalesce(equity_rate, 0.0),
        'insufficient_data', (sample_size < 3)
      )
    ), '[]'::jsonb)
    INTO v_result
    FROM currency_stats;

  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_salary_benchmarks FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_salary_benchmarks TO authenticated, service_role;
