-- Migration: 20260829000005_worker_token_authorization.sql
-- Description: M01 Defense-in-depth worker authorization check (service_role or verified worker token)

CREATE OR REPLACE FUNCTION public.verify_worker_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_headers jsonb;
  v_token text;
BEGIN
  -- 1. If executed by service_role or postgres role, allow immediately
  IF auth.role() IN ('service_role', 'postgres') THEN
    RETURN true;
  END IF;

  -- 2. If executed via PostgREST with x-worker-token header, verify token
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_token := v_headers->>'x-worker-token';
  EXCEPTION
    WHEN OTHERS THEN
      v_token := NULL;
  END;

  IF v_token IS NOT NULL AND v_token = 'jp_worker_internal_2026' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Harden ingest_job_transaction with verify_worker_access
CREATE OR REPLACE FUNCTION public.ingest_job_transaction(
  p_company_id UUID,
  p_canonical_title TEXT,
  p_display_title TEXT,
  p_description TEXT,
  p_description_html TEXT,
  p_employment_type public.employment_type_enum,
  p_workplace_type public.workplace_type_enum,
  p_locations TEXT[],
  p_salary_min NUMERIC,
  p_salary_max NUMERIC,
  p_salary_currency TEXT,
  p_salary_interval TEXT,
  p_skills TEXT[],
  p_posted_at TIMESTAMPTZ,
  p_canonical_url TEXT,
  p_apply_url TEXT,
  p_original_apply_url TEXT,
  p_url_resolution_method TEXT,
  p_url_resolution_confidence NUMERIC,
  p_canonical_fingerprint VARCHAR(64),
  p_source_id UUID,
  p_external_job_id TEXT,
  p_source_job_url TEXT,
  p_discovery_url TEXT,
  p_raw_payload_hash VARCHAR(64),
  p_raw_payload JSONB,
  p_parser_version TEXT,
  p_source_metadata JSONB DEFAULT '{}'::jsonb
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
BEGIN
  -- Strict worker authorization check
  IF NOT public.verify_worker_access() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not authorized to invoke ingest_job_transaction';
  END IF;

  -- Level 1: Deterministic source identity check (source_id + external_job_id)
  SELECT job_id, id INTO v_job_id, v_job_source_id
  FROM public.job_sources
  WHERE source_id = p_source_id AND external_job_id = p_external_job_id
  LIMIT 1;

  -- Level 2: Canonical URL matching if Level 1 did not match
  IF v_job_id IS NULL AND p_canonical_url IS NOT NULL AND p_canonical_url <> '' THEN
    SELECT id INTO v_job_id
    FROM public.jobs
    WHERE canonical_url = p_canonical_url AND status = 'active'
    LIMIT 1;
  END IF;

  IF v_job_id IS NOT NULL THEN
    -- Existing Job -> UPDATE canonical job record
    UPDATE public.jobs
    SET
      canonical_title = p_canonical_title,
      display_title = p_display_title,
      description = p_description,
      description_html = p_description_html,
      employment_type = p_employment_type,
      workplace_type = p_workplace_type,
      locations = p_locations,
      salary_min = p_salary_min,
      salary_max = p_salary_max,
      salary_currency = p_salary_currency,
      salary_interval = p_salary_interval,
      skills = p_skills,
      status = 'active',
      missed_scrape_count = 0,
      canonical_url = p_canonical_url,
      apply_url = p_apply_url,
      original_apply_url = p_original_apply_url,
      url_resolution_method = p_url_resolution_method,
      url_resolution_confidence = p_url_resolution_confidence,
      canonical_fingerprint = p_canonical_fingerprint,
      last_seen_at = v_now,
      source_metadata = COALESCE(p_source_metadata, '{}'::jsonb),
      updated_at = v_now
    WHERE id = v_job_id;

    -- Upsert job_sources provenance record
    INSERT INTO public.job_sources (
      job_id,
      source_id,
      external_job_id,
      discovery_url,
      source_job_url,
      raw_payload_hash,
      first_seen_at,
      last_seen_at,
      created_at,
      updated_at
    )
    VALUES (
      v_job_id,
      p_source_id,
      p_external_job_id,
      p_discovery_url,
      p_source_job_url,
      p_raw_payload_hash,
      v_now,
      v_now,
      v_now,
      v_now
    )
    ON CONFLICT (source_id, external_job_id) DO UPDATE SET
      raw_payload_hash = EXCLUDED.raw_payload_hash,
      source_job_url = EXCLUDED.source_job_url,
      discovery_url = EXCLUDED.discovery_url,
      last_seen_at = v_now,
      updated_at = v_now
    RETURNING id INTO v_job_source_id;

    v_status := 'updated';
  ELSE
    -- New Job -> INSERT into jobs table
    INSERT INTO public.jobs (
      company_id,
      canonical_title,
      display_title,
      description,
      description_html,
      employment_type,
      workplace_type,
      locations,
      salary_min,
      salary_max,
      salary_currency,
      salary_interval,
      skills,
      posted_at,
      first_seen_at,
      last_seen_at,
      status,
      missed_scrape_count,
      canonical_url,
      apply_url,
      original_apply_url,
      url_resolution_method,
      url_resolution_confidence,
      canonical_fingerprint,
      source_metadata,
      created_at,
      updated_at
    )
    VALUES (
      p_company_id,
      p_canonical_title,
      p_display_title,
      p_description,
      p_description_html,
      p_employment_type,
      p_workplace_type,
      p_locations,
      p_salary_min,
      p_salary_max,
      p_salary_currency,
      p_salary_interval,
      p_skills,
      p_posted_at,
      v_now,
      v_now,
      'active',
      0,
      p_canonical_url,
      p_apply_url,
      p_original_apply_url,
      p_url_resolution_method,
      p_url_resolution_confidence,
      p_canonical_fingerprint,
      COALESCE(p_source_metadata, '{}'::jsonb),
      v_now,
      v_now
    )
    RETURNING id INTO v_job_id;

    -- Insert corresponding job_sources mapping
    INSERT INTO public.job_sources (
      job_id,
      source_id,
      external_job_id,
      discovery_url,
      source_job_url,
      raw_payload_hash,
      first_seen_at,
      last_seen_at,
      created_at,
      updated_at
    )
    VALUES (
      v_job_id,
      p_source_id,
      p_external_job_id,
      p_discovery_url,
      p_source_job_url,
      p_raw_payload_hash,
      v_now,
      v_now,
      v_now,
      v_now
    )
    RETURNING id INTO v_job_source_id;

    v_status := 'inserted';
  END IF;

  -- Store raw payload audit trail if provided
  IF p_raw_payload IS NOT NULL THEN
    INSERT INTO public.raw_job_payloads (
      source_id,
      external_id,
      payload,
      payload_hash,
      parser_version,
      fetched_at
    )
    VALUES (
      p_source_id,
      p_external_job_id,
      p_raw_payload,
      p_raw_payload_hash,
      p_parser_version,
      v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'job_id', v_job_id,
    'job_source_id', v_job_source_id
  );
END;
$$;

-- Harden try_acquire_scrape_lock
CREATE OR REPLACE FUNCTION public.try_acquire_scrape_lock(
  p_lock_key TEXT,
  p_holder_id TEXT,
  p_ttl_seconds INT DEFAULT 900
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_count INT := 0;
BEGIN
  IF NOT public.verify_worker_access() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not authorized to acquire worker scrape locks';
  END IF;

  -- Delete expired locks
  DELETE FROM public.scrape_locks WHERE lock_key = p_lock_key AND expires_at < v_now;

  -- Try to insert or reclaim expired lock
  INSERT INTO public.scrape_locks (lock_key, holder_id, acquired_at, expires_at)
  VALUES (p_lock_key, p_holder_id, v_now, v_now + (p_ttl_seconds || ' seconds')::interval)
  ON CONFLICT (lock_key) DO UPDATE
    SET holder_id = EXCLUDED.holder_id,
        acquired_at = v_now,
        expires_at = v_now + (p_ttl_seconds || ' seconds')::interval
    WHERE public.scrape_locks.expires_at < v_now;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

-- Harden release_scrape_lock
CREATE OR REPLACE FUNCTION public.release_scrape_lock(
  p_lock_key TEXT,
  p_holder_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_released INT;
BEGIN
  IF NOT public.verify_worker_access() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not authorized to release worker scrape locks';
  END IF;

  DELETE FROM public.scrape_locks 
  WHERE lock_key = p_lock_key AND holder_id = p_holder_id;
  
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released > 0;
END;
$$;

-- Harden claim_next_pending_scrape_run
CREATE OR REPLACE FUNCTION public.claim_next_pending_scrape_run()
RETURNS TABLE (
  id UUID,
  started_at TIMESTAMPTZ,
  status public.scrape_run_status_enum,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.verify_worker_access() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not authorized to claim queued scrape runs';
  END IF;

  RETURN QUERY
  UPDATE public.scrape_runs
  SET status = 'running',
      started_at = clock_timestamp()
  WHERE public.scrape_runs.id = (
    SELECT r.id
    FROM public.scrape_runs r
    WHERE r.status = 'pending'
    ORDER BY r.started_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING public.scrape_runs.id, public.scrape_runs.started_at, public.scrape_runs.status, public.scrape_runs.metadata;
END;
$$;

-- Grant EXECUTE to public/anon/authenticated/service_role (all calls checked via verify_worker_access)
GRANT EXECUTE ON FUNCTION public.ingest_job_transaction TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.try_acquire_scrape_lock TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_scrape_lock TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_pending_scrape_run TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_worker_access TO anon, authenticated, service_role;
