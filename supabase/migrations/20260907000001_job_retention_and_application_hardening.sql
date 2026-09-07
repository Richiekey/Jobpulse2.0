-- ============================================================================
-- JobPulse 2.0 — Job Retention & Application-State Hardening
-- Version: 20260907000001
-- Description:
--   1. Harden ingest_job_transaction: status-agnostic deduplication & fingerprint fallback
--      so re-scraping previously expired jobs reactivates them under the same jobs.id,
--      preventing user application disassociation.
--   2. Implement purge_stale_job_records RPC: batched hard deletion of expired jobs
--      older than retention cutoff while strictly protecting jobs with application history.
--   3. Implement purge_stale_raw_payloads RPC: batched hard deletion of staging raw payloads
--      older than retention cutoff to reclaim database capacity.
--   4. Implement get_retention_and_storage_metrics RPC: observability for storage & retention.
-- ============================================================================

-- 1. HARDEN INGEST_JOB_TRANSACTION WITH STATUS-AGNOSTIC DEDUPLICATION & FINGERPRINT MATCHING
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
  p_is_remote BOOLEAN DEFAULT FALSE
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
  IF NOT public.verify_worker_access() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not authorized to invoke ingest_job_transaction';
  END IF;

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
    -- Update existing job, atomically resetting consecutive misses and reactivating if expired
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
      status='active',
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
      'active', 0, 0, p_canonical_url, p_apply_url,
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

  -- Store raw payload audit trail if provided
  IF p_raw_payload IS NOT NULL AND p_source_id IS NOT NULL THEN
    INSERT INTO public.raw_job_payloads (
      source_id, external_id, payload, payload_hash, parser_version, fetched_at
    )
    VALUES (
      p_source_id, p_external_job_id, p_raw_payload, p_raw_payload_hash, p_parser_version, v_now
    );
  END IF;

  RETURN jsonb_build_object('status', v_status, 'job_id', v_job_id, 'job_source_id', v_job_source_id);
END;
$$;

-- 2. APPLICATION-AWARE BATCHED PHYSICAL JOB RETENTION PURGE RPC
-- Automatically removes stale expired jobs while strictly preserving user applications
-- and organization workforce job assignments.
CREATE OR REPLACE FUNCTION public.purge_stale_job_records(
    p_batch_size INT DEFAULT 500,
    p_max_batches INT DEFAULT 10,
    p_retention_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_deleted INT := 0;
    v_batches_run INT := 0;
    v_batch_deleted INT := 0;
    v_protected_count INT := 0;
    v_protected_apps_count INT := 0;
    v_protected_assignments_count INT := 0;
    v_cutoff TIMESTAMPTZ := now() - (p_retention_days || ' days')::interval;
BEGIN
    -- Authorization check: service_role or admin
    IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') 
       AND coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role' 
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative privileges required to execute job retention purge.';
    END IF;

    -- Count total expired jobs protected due to user applications or active assignments
    SELECT count(DISTINCT j.id) INTO v_protected_apps_count
    FROM public.jobs j
    WHERE j.status = 'expired'
      AND EXISTS (SELECT 1 FROM public.applications a WHERE a.job_id = j.id);

    SELECT count(DISTINCT j.id) INTO v_protected_assignments_count
    FROM public.jobs j
    WHERE j.status = 'expired'
      AND EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = j.id);

    v_protected_count := v_protected_apps_count + v_protected_assignments_count;

    -- Loop in bounded batches to avoid transaction lock amplification and memory limits
    FOR v_batches_run IN 1..p_max_batches LOOP
        WITH candidate_batch AS (
            SELECT j.id
            FROM public.jobs j
            WHERE j.status = 'expired'
              AND j.last_seen_at < v_cutoff
              -- Hard Invariant: NEVER delete jobs linked to user applications or assignments
              AND NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.job_id = j.id)
              AND NOT EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = j.id)
            LIMIT p_batch_size
        ),
        deleted_batch AS (
            DELETE FROM public.jobs
            WHERE id IN (SELECT id FROM candidate_batch)
            RETURNING id
        )
        SELECT count(*) INTO v_batch_deleted FROM deleted_batch;

        v_total_deleted := v_total_deleted + v_batch_deleted;

        -- Exit early if no more records matched in this batch
        EXIT WHEN v_batch_deleted = 0;
    END LOOP;

    RETURN jsonb_build_object(
        'deleted_jobs_count', v_total_deleted,
        'protected_jobs_count', v_protected_count,
        'protected_application_linked_count', v_protected_apps_count,
        'protected_assignment_linked_count', v_protected_assignments_count,
        'batches_executed', v_batches_run,
        'retention_cutoff', v_cutoff
    );
END;
$$;

-- 3. BATCHED STAGING RAW PAYLOAD RETENTION PURGE RPC
-- Automatically removes old staging JSONB payloads to preserve free-tier storage boundaries.
CREATE OR REPLACE FUNCTION public.purge_stale_raw_payloads(
    p_batch_size INT DEFAULT 1000,
    p_max_batches INT DEFAULT 10,
    p_retention_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_deleted INT := 0;
    v_batches_run INT := 0;
    v_batch_deleted INT := 0;
    v_cutoff TIMESTAMPTZ := now() - (p_retention_days || ' days')::interval;
BEGIN
    -- Authorization check: service_role or admin
    IF current_user != 'service_role' 
       AND coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role' 
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative privileges required to purge raw payloads.';
    END IF;

    FOR v_batches_run IN 1..p_max_batches LOOP
        WITH candidate_batch AS (
            SELECT id
            FROM public.raw_job_payloads
            WHERE fetched_at < v_cutoff
            LIMIT p_batch_size
        ),
        deleted_batch AS (
            DELETE FROM public.raw_job_payloads
            WHERE id IN (SELECT id FROM candidate_batch)
            RETURNING id
        )
        SELECT count(*) INTO v_batch_deleted FROM deleted_batch;

        v_total_deleted := v_total_deleted + v_batch_deleted;

        EXIT WHEN v_batch_deleted = 0;
    END LOOP;

    RETURN jsonb_build_object(
        'deleted_payloads_count', v_total_deleted,
        'batches_executed', v_batches_run,
        'retention_cutoff', v_cutoff
    );
END;
$$;

-- 4. RETENTION & STORAGE OBSERVABILITY METRICS RPC
CREATE OR REPLACE FUNCTION public.get_retention_and_storage_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF current_user != 'service_role' 
       AND coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role' 
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative privileges required to view retention metrics.';
    END IF;

    SELECT jsonb_build_object(
        'timestamp', now(),
        'jobs', (
            SELECT jsonb_build_object(
                'total', count(*),
                'active', count(*) FILTER (WHERE status = 'active'),
                'expired', count(*) FILTER (WHERE status = 'expired'),
                'stale_eligible_for_deletion', count(*) FILTER (
                    WHERE status = 'expired' 
                      AND last_seen_at < now() - INTERVAL '30 days'
                      AND NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.job_id = jobs.id)
                      AND NOT EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = jobs.id)
                ),
                'application_linked_protected', count(*) FILTER (
                    WHERE EXISTS (SELECT 1 FROM public.applications a WHERE a.job_id = jobs.id)
                )
            ) FROM public.jobs
        ),
        'raw_payloads', (
            SELECT jsonb_build_object(
                'total', count(*),
                'older_than_7d', count(*) FILTER (WHERE fetched_at < now() - INTERVAL '7 days'),
                'older_than_3d', count(*) FILTER (WHERE fetched_at < now() - INTERVAL '3 days')
            ) FROM public.raw_job_payloads
        ),
        'storage', (
            SELECT jsonb_build_object(
                'jobs_table_bytes', pg_total_relation_size('public.jobs'),
                'jobs_table_pretty', pg_size_pretty(pg_total_relation_size('public.jobs')),
                'raw_job_payloads_bytes', pg_total_relation_size('public.raw_job_payloads'),
                'raw_job_payloads_pretty', pg_size_pretty(pg_total_relation_size('public.raw_job_payloads')),
                'job_sources_table_bytes', pg_total_relation_size('public.job_sources'),
                'job_sources_table_pretty', pg_size_pretty(pg_total_relation_size('public.job_sources'))
            )
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 5. GRANTS & ACCESS CONTROL
REVOKE EXECUTE ON FUNCTION public.ingest_job_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingest_job_transaction TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.purge_stale_job_records FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_stale_job_records TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.purge_stale_raw_payloads FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_stale_raw_payloads TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_retention_and_storage_metrics FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_retention_and_storage_metrics TO authenticated, service_role;
