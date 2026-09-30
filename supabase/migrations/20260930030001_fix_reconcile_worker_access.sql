-- Corrective migration: Allow worker to execute job lifecycle reconciliation

CREATE OR REPLACE FUNCTION public.reconcile_source_job_lifecycle(
    p_source_id UUID,
    p_company_source_id UUID,
    p_crawled_external_ids TEXT[],
    p_scrape_time TIMESTAMPTZ DEFAULT now(),
    p_consecutive_miss_threshold INT DEFAULT 3,
    p_max_staleness_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_id UUID;
    v_source_identifier TEXT;
    v_adapter_name TEXT;
    v_observed_count INT := 0;
    v_missed_count INT := 0;
    v_expired_count INT := 0;
    v_staleness_cutoff TIMESTAMPTZ := p_scrape_time - (p_max_staleness_days || ' days')::interval;
BEGIN
    -- Authorization check: worker or admin
    IF NOT public.verify_worker_access() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative privileges required to reconcile job lifecycle.';
    END IF;

    -- Look up company source configuration and adapter
    SELECT cs.company_id, cs.source_identifier, s.adapter_name
    INTO v_company_id, v_source_identifier, v_adapter_name
    FROM public.company_sources cs
    JOIN public.sources s ON cs.source_id = s.id
    WHERE cs.id = p_company_source_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Company source with ID "%" was not found.', p_company_source_id;
    END IF;

    -- 1. Reset observed jobs (present in the successful crawl)
    IF array_length(p_crawled_external_ids, 1) > 0 THEN
        WITH updated_observed AS (
            UPDATE public.jobs j
            SET 
                consecutive_misses = 0,
                last_seen_at = p_scrape_time,
                updated_at = now()
            FROM public.job_sources js
            WHERE js.job_id = j.id
              AND js.source_id = p_source_id
              AND (
                  (v_adapter_name = 'jobright' AND j.source_metadata->>'repository' = v_source_identifier)
                  OR
                  (v_adapter_name != 'jobright' AND j.company_id = v_company_id)
              )
              AND j.status = 'active'
              AND js.external_job_id = ANY(p_crawled_external_ids)
            RETURNING j.id
        )
        SELECT count(*) INTO v_observed_count FROM updated_observed;

        -- Keep job_sources last_seen_at in sync
        UPDATE public.job_sources
        SET last_seen_at = p_scrape_time,
            updated_at = now()
        WHERE source_id = p_source_id
          AND external_job_id = ANY(p_crawled_external_ids);
    END IF;

    -- 2. Increment consecutive_misses for omitted active jobs in this provenance scope
    WITH updated_missed AS (
        UPDATE public.jobs j
        SET 
            consecutive_misses = j.consecutive_misses + 1,
            updated_at = now()
        FROM public.job_sources js
        WHERE js.job_id = j.id
          AND js.source_id = p_source_id
          AND (
              (v_adapter_name = 'jobright' AND j.source_metadata->>'repository' = v_source_identifier)
              OR
              (v_adapter_name != 'jobright' AND j.company_id = v_company_id)
          )
          AND j.status = 'active'
          AND (
              array_length(p_crawled_external_ids, 1) IS NULL 
              OR NOT (js.external_job_id = ANY(p_crawled_external_ids))
          )
        RETURNING j.id
    )
    SELECT count(*) INTO v_missed_count FROM updated_missed;

    -- 3. Expire jobs reaching threshold (consecutive_misses >= threshold OR staleness >= max_days)
    WITH updated_expired AS (
        UPDATE public.jobs j
        SET 
            status = 'expired',
            updated_at = now()
        FROM public.job_sources js
        WHERE js.job_id = j.id
          AND js.source_id = p_source_id
          AND (
              (v_adapter_name = 'jobright' AND j.source_metadata->>'repository' = v_source_identifier)
              OR
              (v_adapter_name != 'jobright' AND j.company_id = v_company_id)
          )
          AND j.status = 'active'
          AND (
              j.consecutive_misses >= p_consecutive_miss_threshold
              OR (j.last_seen_at IS NOT NULL AND j.last_seen_at < v_staleness_cutoff)
          )
        RETURNING j.id
    )
    SELECT count(*) INTO v_expired_count FROM updated_expired;

    RETURN jsonb_build_object(
        'observed_count', v_observed_count,
        'missed_count', v_missed_count,
        'expired_count', v_expired_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_source_job_lifecycle TO anon, authenticated, service_role;
