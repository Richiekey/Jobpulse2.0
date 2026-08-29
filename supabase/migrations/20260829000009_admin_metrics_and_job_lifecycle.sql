-- ============================================================================
-- JobPulse 2.0 — Database Metrics Aggregation & Durable Job Lifecycle Reconciliation
-- Version: 20260829000009
-- Description: Adds consecutive_misses column to jobs, atomic lifecycle reconciliation RPC,
--              and database-side get_admin_system_metrics RPC.
-- ============================================================================

-- 1. DURABLE CONSECUTIVE MISSES COLUMN
ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS consecutive_misses INTEGER DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_status_company_misses
    ON public.jobs(company_id, status, consecutive_misses)
    WHERE status = 'active';

-- 2. DATABASE-SIDE ADMIN SYSTEM METRICS (SECURITY DEFINER)
-- Aggregates metrics entirely inside PostgreSQL without unbounded row reads in Node.js
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
    -- Authorization Guard: Check admin / service_role authorization
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
                    'unreachable', count(*) FILTER (WHERE health_status = 'unreachable')
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
                'successRatePercent', CASE WHEN count(*) > 0 
                    THEN round((count(*) FILTER (WHERE status = 'completed')::numeric / count(*)::numeric) * 100.0, 1)
                    ELSE 100.0 END
            ) FROM public.scrape_runs WHERE started_at >= v_one_day_ago
        ),
        'engagement', jsonb_build_object(
            'outboundClicks24h', (SELECT count(*) FROM public.outbound_clicks WHERE created_at >= v_one_day_ago),
            'totalApplicationsTracked', (SELECT count(*) FROM public.applications),
            'applicationsByStatus', (
                SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
                FROM (
                    SELECT status, count(*) as cnt
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

-- 3. ATOMIC DURABLE JOB LIFECYCLE RECONCILIATION RPC (SECURITY DEFINER)
-- Invoked ONLY upon verified complete & successful scrape crawl.
-- Atomically resets observed jobs, increments consecutive misses for omitted jobs,
-- and transitions jobs exceeding thresholds to 'expired'.
CREATE OR REPLACE FUNCTION public.reconcile_company_source_job_lifecycle(
    p_company_id UUID,
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
    v_observed_count INT := 0;
    v_missed_count INT := 0;
    v_expired_count INT := 0;
    v_staleness_cutoff TIMESTAMPTZ := p_scrape_time - (p_max_staleness_days || ' days')::interval;
BEGIN
    -- 1. Reset observed jobs (present in the successful crawl)
    IF array_length(p_crawled_external_ids, 1) > 0 THEN
        WITH updated_observed AS (
            UPDATE public.jobs
            SET 
                consecutive_misses = 0,
                last_seen_at = p_scrape_time,
                updated_at = now()
            WHERE 
                company_id = p_company_id 
                AND status = 'active'
                AND external_job_id = ANY(p_crawled_external_ids)
            RETURNING id
        )
        SELECT count(*) INTO v_observed_count FROM updated_observed;
    END IF;

    -- 2. Increment consecutive_misses for omitted active jobs
    WITH updated_missed AS (
        UPDATE public.jobs
        SET 
            consecutive_misses = consecutive_misses + 1,
            updated_at = now()
        WHERE 
            company_id = p_company_id 
            AND status = 'active'
            AND (
                external_job_id IS NULL 
                OR array_length(p_crawled_external_ids, 1) IS NULL 
                OR NOT (external_job_id = ANY(p_crawled_external_ids))
            )
        RETURNING id
    )
    SELECT count(*) INTO v_missed_count FROM updated_missed;

    -- 3. Expire jobs reaching threshold (consecutive_misses >= threshold OR staleness >= max_days)
    WITH updated_expired AS (
        UPDATE public.jobs
        SET 
            status = 'expired',
            updated_at = now()
        WHERE 
            company_id = p_company_id 
            AND status = 'active'
            AND (
                consecutive_misses >= p_consecutive_miss_threshold
                OR (last_seen_at IS NOT NULL AND last_seen_at < v_staleness_cutoff)
            )
        RETURNING id
    )
    SELECT count(*) INTO v_expired_count FROM updated_expired;

    RETURN jsonb_build_object(
        'observed_count', v_observed_count,
        'missed_count', v_missed_count,
        'expired_count', v_expired_count
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_company_source_job_lifecycle FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_company_source_job_lifecycle TO authenticated, service_role;
