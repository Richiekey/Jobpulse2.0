-- ============================================================================
-- JobPulse 2.0 — Final Production Remediation
-- Version: 20260903000004
-- Description: 
--   1. Source-aware job lifecycle reconciliation RPC (reconcile_source_job_lifecycle)
--      using job_sources provenance.
--   2. Explicit execution mode and global concurrency enforcement in schedule_admin_scrape_run.
--   3. Concurrency guard in claim_next_pending_scrape_run preventing duplicate running runs.
--   4. Search path hardening on get_admin_system_metrics.
-- ============================================================================

-- 1. SOURCE-AWARE JOB LIFECYCLE RECONCILIATION RPC
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
    -- Authorization check: service_role or admin
    IF current_user != 'service_role' 
       AND coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role' 
       AND NOT public.is_admin() THEN
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

    -- Invariant: Target jobs must strictly belong to this source provenance via job_sources.
    -- For Jobright: js.source_id = p_source_id AND jobs.source_metadata->>'repository' = v_source_identifier
    -- For standard ATS: js.source_id = p_source_id AND jobs.company_id = v_company_id

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

REVOKE EXECUTE ON FUNCTION public.reconcile_source_job_lifecycle FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_source_job_lifecycle TO authenticated, service_role;


-- 2. HARDEN SCHEDULE_ADMIN_SCRAPE_RUN WITH EXPLICIT EXECUTION MODE & UNIFIED GLOBAL CONCURRENCY
DROP FUNCTION IF EXISTS public.schedule_admin_scrape_run(uuid, text, uuid, integer);

CREATE OR REPLACE FUNCTION public.schedule_admin_scrape_run(
    p_admin_id UUID,
    p_company_identifier TEXT DEFAULT 'all',
    p_source_id UUID DEFAULT NULL,
    p_ttl_seconds INT DEFAULT 900,
    p_execution_mode TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_concurrency_scope TEXT := 'global';
    v_execution_mode TEXT;
    v_active_run_id UUID;
    v_active_run_status TEXT;
    v_active_run_started TIMESTAMPTZ;
    v_new_run_id UUID;
    v_new_run_started TIMESTAMPTZ := now();
    v_cutoff TIMESTAMPTZ := now() - (p_ttl_seconds || ' seconds')::interval;
BEGIN
    -- 1. Authorization check
    IF current_user != 'service_role' 
       AND coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role' 
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative privileges required to schedule a scrape run.';
    END IF;

    -- 2. Determine explicit execution mode
    IF p_execution_mode IS NOT NULL AND p_execution_mode != '' THEN
        v_execution_mode := p_execution_mode;
    ELSIF p_source_id IS NOT NULL THEN
        v_execution_mode := 'manual_source';
    ELSIF p_company_identifier IS NOT NULL AND p_company_identifier != 'all' THEN
        v_execution_mode := 'manual_company';
    ELSE
        v_execution_mode := 'manual_global';
    END IF;

    -- 3. Verify source existence and active state if source_id is provided
    IF p_source_id IS NOT NULL THEN
        DECLARE
            v_source_active BOOLEAN;
            v_source_identifier TEXT;
        BEGIN
            SELECT is_active, source_identifier INTO v_source_active, v_source_identifier
            FROM public.company_sources
            WHERE id = p_source_id;

            IF NOT FOUND THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error_type', 'NOT_FOUND',
                    'message', 'Company source with ID "' || p_source_id || '" was not found.'
                );
            END IF;

            IF NOT v_source_active THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error_type', 'DISABLED',
                    'message', 'Company source "' || v_source_identifier || '" is disabled and cannot be crawled.'
                );
            END IF;
        END;
    END IF;

    -- 4. Expire any orphaned / stale runs past TTL lease window
    UPDATE public.scrape_runs
    SET status = 'failed',
        completed_at = now(),
        error_summary = jsonb_build_array(jsonb_build_object('error', 'Execution timed out past TTL lease window'))
    WHERE status IN ('pending', 'running')
      AND started_at < v_cutoff;

    -- 5. Atomically insert new run under authoritative global concurrency scope
    BEGIN
        INSERT INTO public.scrape_runs (
            started_at,
            status,
            concurrency_scope,
            companies_attempted,
            companies_succeeded,
            companies_failed,
            jobs_discovered,
            jobs_inserted,
            jobs_updated,
            jobs_rejected,
            jobs_failed,
            metadata
        ) VALUES (
            v_new_run_started,
            'pending',
            v_concurrency_scope,
            0, 0, 0, 0, 0, 0, 0, 0,
            jsonb_build_object(
                'execution_mode', v_execution_mode,
                'triggered_by_admin', p_admin_id,
                'company_identifier', coalesce(p_company_identifier, 'all'),
                'source_id', p_source_id,
                'concurrency_scope', v_concurrency_scope
            )
        ) RETURNING id INTO v_new_run_id;

        RETURN jsonb_build_object(
            'success', true,
            'conflict', false,
            'run_id', v_new_run_id,
            'status', 'pending',
            'execution_mode', v_execution_mode,
            'concurrency_scope', v_concurrency_scope,
            'scheduled_at', v_new_run_started,
            'company_identifier', coalesce(p_company_identifier, 'all'),
            'source_id', p_source_id
        );

    EXCEPTION 
        WHEN unique_violation THEN
            -- Single global execution constraint rejected duplicate active run
            SELECT id, status, started_at INTO v_active_run_id, v_active_run_status, v_active_run_started
            FROM public.scrape_runs
            WHERE status IN ('pending', 'running')
            ORDER BY started_at DESC
            LIMIT 1;

            RETURN jsonb_build_object(
                'success', false,
                'conflict', true,
                'concurrency_scope', v_concurrency_scope,
                'existing_run_id', v_active_run_id,
                'existing_status', v_active_run_status,
                'existing_started_at', v_active_run_started,
                'message', 'A crawl run is already actively scheduled or running (Run ID: ' || coalesce(v_active_run_id::text, 'unknown') || '). Please wait for it to complete.'
            );
    END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.schedule_admin_scrape_run(uuid, text, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_admin_scrape_run(uuid, text, uuid, integer, text) TO authenticated, service_role;


-- 3. HARDEN CLAIM_NEXT_PENDING_SCRAPE_RUN WITH CONCURRENCY GUARD
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

  -- Concurrency Guard: If any run is already running globally, do NOT claim another run!
  IF EXISTS (SELECT 1 FROM public.scrape_runs WHERE status = 'running') THEN
    RETURN;
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

REVOKE ALL ON FUNCTION public.claim_next_pending_scrape_run FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_pending_scrape_run TO service_role;


-- 4. HARDEN GET_ADMIN_SYSTEM_METRICS SEARCH PATH
CREATE OR REPLACE FUNCTION public.get_admin_system_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_metrics JSONB;
    v_one_day_ago TIMESTAMPTZ := now() - INTERVAL '24 hours';
BEGIN
    IF current_user != 'service_role' 
       AND coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role' 
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative privileges required to view system metrics.';
    END IF;

    SELECT jsonb_build_object(
        'system', jsonb_build_object(
            'timestamp', now()
        ),
        'companies', (
            SELECT jsonb_build_object(
                'total', count(*),
                'verified', count(*) FILTER (WHERE verified = true)
            ) FROM public.companies
        ),
        'sources', (
            SELECT jsonb_build_object(
                'total', count(*),
                'active', count(*) FILTER (WHERE is_active = true),
                'health', jsonb_build_object(
                    'healthy', count(*) FILTER (WHERE health_status = 'healthy'),
                    'degraded', count(*) FILTER (WHERE health_status = 'degraded'),
                    'failing', count(*) FILTER (WHERE health_status = 'failing'),
                    'disabled', count(*) FILTER (WHERE health_status = 'disabled')
                )
            ) FROM public.company_sources
        ),
        'jobs', (
            SELECT jsonb_build_object(
                'active', count(*) FILTER (WHERE status = 'active'),
                'expired', count(*) FILTER (WHERE status = 'expired')
            ) FROM public.jobs
        ),
        'ingestion24h', (
            SELECT jsonb_build_object(
                'totalRuns', count(*),
                'successfulRuns', count(*) FILTER (WHERE status = 'completed'),
                'failedRuns', count(*) FILTER (WHERE status = 'failed'),
                'jobsDiscovered', coalesce(sum(jobs_discovered), 0),
                'jobsInserted', coalesce(sum(jobs_inserted), 0),
                'jobsUpdated', coalesce(sum(jobs_updated), 0),
                'jobsRejected', coalesce(sum(jobs_rejected), 0),
                'jobsFailed', coalesce(sum(jobs_failed), 0),
                'successRatePercent', CASE WHEN count(*) > 0 
                    THEN round((count(*) FILTER (WHERE status = 'completed')::numeric / count(*)::numeric) * 100.0, 1)
                    ELSE 100.0 END
            ) FROM public.scrape_runs WHERE started_at >= v_one_day_ago
        ),
        'engagement', jsonb_build_object(
            'outboundClicks24h', (SELECT count(*) FROM public.outbound_clicks WHERE created_at >= v_one_day_ago),
            'totalApplicationsTracked', (SELECT count(*) FROM public.applications),
            'applicationsByStatus', (
                SELECT coalesce(jsonb_object_agg(status, count), '{}'::jsonb)
                FROM (
                    SELECT status, count(*) 
                    FROM public.applications 
                    GROUP BY status
                ) s
            )
        )
    ) INTO v_metrics;

    RETURN v_metrics;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_system_metrics FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_system_metrics TO authenticated, service_role;
