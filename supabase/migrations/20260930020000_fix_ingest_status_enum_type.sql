-- Fix: Correct job status enum type mismatch in ingest_job_transaction()
--
-- Root cause: commit a394f5e4 introduced v_target_status TEXT which causes
-- PostgreSQL error 42804 (datatype_mismatch) when writing to jobs.status
-- (typed as public.job_status_enum).
--
-- This migration redefines the function with the corrected type:
--   v_target_status public.job_status_enum
--
-- All other behavior is preserved exactly as-is from 20260930000004.

-- Drop the current 40-argument version so CREATE OR REPLACE binds cleanly
DROP FUNCTION IF EXISTS public.ingest_job_transaction(UUID, TEXT, TEXT, TEXT, TEXT, public.employment_type_enum, public.workplace_type_enum, TEXT[], NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN, TEXT[], TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, NUMERIC, VARCHAR, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN);

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
  -- Batch J taxonomy & location fields
  p_ats_platform_slug TEXT DEFAULT NULL,
  p_job_function_slug TEXT DEFAULT NULL,
  p_job_function_confidence TEXT DEFAULT NULL,
  p_location_country TEXT DEFAULT NULL,
  p_location_region TEXT DEFAULT NULL,
  p_location_city TEXT DEFAULT NULL,
  p_is_remote BOOLEAN DEFAULT FALSE,
  -- Opt-in parameter for raw payload persistence
  p_store_raw_payload BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id UUID;
  v_job_source_id UUID;
  v_status TEXT;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_is_stale BOOLEAN;
  v_target_status public.job_status_enum;  -- FIX: was TEXT, must match jobs.status column type
BEGIN
  IF NOT public.verify_worker_access() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not authorized to invoke ingest_job_transaction';
  END IF;

  -- Compute staleness: Any job posted more than 30 days ago is strictly expired
  v_is_stale := (p_posted_at IS NOT NULL AND p_posted_at < (v_now - interval '30 days'));
  v_target_status := CASE WHEN v_is_stale THEN 'expired'::public.job_status_enum ELSE 'active'::public.job_status_enum END;

  -- Level 1: Deterministic source provenance lookup (Exact sourceId + externalJobId)
  IF p_source_id IS NOT NULL AND p_external_job_id IS NOT NULL AND p_external_job_id <> '' THEN
    SELECT job_id, id INTO v_job_id, v_job_source_id FROM public.job_sources
    WHERE source_id = p_source_id AND external_job_id = p_external_job_id LIMIT 1;
  END IF;

  -- Level 2: Exact canonical clean URL match (STATUS-AGNOSTIC: matches active or expired)
  IF v_job_id IS NULL AND p_canonical_url IS NOT NULL AND p_canonical_url <> '' THEN
    SELECT id INTO v_job_id FROM public.jobs
    WHERE canonical_url = p_canonical_url
    LIMIT 1;
  END IF;

  -- Level 3: Conservative canonical fingerprint match within company (normalized title + locations)
  IF v_job_id IS NULL AND p_canonical_fingerprint IS NOT NULL AND p_canonical_fingerprint <> '' THEN
    SELECT id INTO v_job_id FROM public.jobs
    WHERE canonical_fingerprint = p_canonical_fingerprint
      AND company_id = p_company_id
    LIMIT 1;
  END IF;

  IF v_job_id IS NOT NULL THEN
    -- Update existing job, atomically preserving UUID and setting target status (active or expired)
    UPDATE public.jobs SET
      company_id=COALESCE(p_company_id, company_id),
      canonical_title=p_canonical_title,
      display_title=p_display_title,
      description=p_description,
      description_html=p_description_html,
      employment_type=p_employment_type,
      workplace_type=p_workplace_type,
      locations=p_locations,
      salary_min=p_salary_min,
      salary_max=p_salary_max,
      salary_currency=p_salary_currency,
      salary_interval=p_salary_interval,
      annualized_min=p_annualized_min,
      annualized_max=p_annualized_max,
      has_salary=p_has_salary,
      equity_mentioned=p_equity_mentioned,
      skills=p_skills,
      posted_at=COALESCE(p_posted_at, posted_at),
      status=v_target_status,
      missed_scrape_count=0,
      consecutive_misses=0,
      canonical_url=p_canonical_url,
      apply_url=p_apply_url,
      original_apply_url=COALESCE(p_original_apply_url, original_apply_url),
      url_resolution_method=p_url_resolution_method,
      url_resolution_confidence=p_url_resolution_confidence,
      canonical_fingerprint=COALESCE(p_canonical_fingerprint, canonical_fingerprint),
      last_seen_at=v_now,
      source_metadata=COALESCE(p_source_metadata, source_metadata),
      updated_at=v_now,
      -- Batch J fields
      ats_platform_slug=COALESCE(p_ats_platform_slug, ats_platform_slug),
      job_function_slug=COALESCE(p_job_function_slug, job_function_slug),
      job_function_confidence=COALESCE(p_job_function_confidence, job_function_confidence),
      location_country=COALESCE(p_location_country, location_country),
      location_region=COALESCE(p_location_region, location_region),
      location_city=COALESCE(p_location_city, location_city),
      is_remote=COALESCE(p_is_remote, is_remote)
    WHERE id = v_job_id;

    IF p_source_id IS NOT NULL AND p_external_job_id IS NOT NULL AND p_external_job_id <> '' THEN
      INSERT INTO public.job_sources (
        job_id, source_id, external_job_id, discovery_url, source_job_url,
        raw_payload_hash, first_seen_at, last_seen_at, created_at, updated_at
      )
      VALUES (
        v_job_id, p_source_id, p_external_job_id, p_discovery_url, p_source_job_url,
        p_raw_payload_hash, v_now, v_now, v_now, v_now
      )
      ON CONFLICT (source_id, external_job_id) DO UPDATE SET
        raw_payload_hash=EXCLUDED.raw_payload_hash,
        source_job_url=EXCLUDED.source_job_url,
        discovery_url=EXCLUDED.discovery_url,
        last_seen_at=v_now,
        updated_at=v_now
      RETURNING id INTO v_job_source_id;
    END IF;

    v_status := 'updated';
  ELSE
    -- Brand new logical job requisition
    INSERT INTO public.jobs (
      company_id, canonical_title, display_title, description, description_html,
      employment_type, workplace_type, locations, salary_min, salary_max,
      salary_currency, salary_interval, annualized_min, annualized_max,
      has_salary, equity_mentioned, skills, posted_at, first_seen_at, last_seen_at,
      status, missed_scrape_count, consecutive_misses, canonical_url, apply_url,
      original_apply_url, url_resolution_method, url_resolution_confidence,
      canonical_fingerprint, source_metadata, created_at, updated_at,
      ats_platform_slug, job_function_slug, job_function_confidence,
      location_country, location_region, location_city, is_remote
    )
    VALUES (
      p_company_id, p_canonical_title, p_display_title, p_description, p_description_html,
      p_employment_type, p_workplace_type, p_locations, p_salary_min, p_salary_max,
      p_salary_currency, p_salary_interval, p_annualized_min, p_annualized_max,
      p_has_salary, p_equity_mentioned, p_skills, p_posted_at, v_now, v_now,
      v_target_status, 0, 0, p_canonical_url, p_apply_url,
      p_original_apply_url, p_url_resolution_method, p_url_resolution_confidence,
      p_canonical_fingerprint, COALESCE(p_source_metadata, '{}'::jsonb), v_now, v_now,
      p_ats_platform_slug, p_job_function_slug, p_job_function_confidence,
      p_location_country, p_location_region, p_location_city, p_is_remote
    )
    RETURNING id INTO v_job_id;

    IF p_source_id IS NOT NULL AND p_external_job_id IS NOT NULL AND p_external_job_id <> '' THEN
      INSERT INTO public.job_sources (
        job_id, source_id, external_job_id, discovery_url, source_job_url,
        raw_payload_hash, first_seen_at, last_seen_at, created_at, updated_at
      )
      VALUES (
        v_job_id, p_source_id, p_external_job_id, p_discovery_url, p_source_job_url,
        p_raw_payload_hash, v_now, v_now, v_now, v_now
      )
      RETURNING id INTO v_job_source_id;
    END IF;

    v_status := 'inserted';
  END IF;

  -- Store raw payload audit trail if explicitly requested and provided
  IF p_store_raw_payload = TRUE AND p_raw_payload IS NOT NULL AND p_source_id IS NOT NULL THEN
    INSERT INTO public.raw_job_payloads (
      source_id, external_id, payload, payload_hash, parser_version, fetched_at
    )
    VALUES (
      p_source_id, p_external_job_id, p_raw_payload, p_raw_payload_hash, p_parser_version, v_now
    );
  END IF;

  RETURN jsonb_build_object('status', v_status, 'job_id', v_job_id, 'job_source_id', v_job_source_id, 'is_stale', v_is_stale);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ingest_job_transaction(UUID, TEXT, TEXT, TEXT, TEXT, public.employment_type_enum, public.workplace_type_enum, TEXT[], NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN, TEXT[], TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, NUMERIC, VARCHAR, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingest_job_transaction(UUID, TEXT, TEXT, TEXT, TEXT, public.employment_type_enum, public.workplace_type_enum, TEXT[], NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN, TEXT[], TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, NUMERIC, VARCHAR, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated, service_role;
