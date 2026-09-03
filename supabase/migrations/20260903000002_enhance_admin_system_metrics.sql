-- ============================================================================
-- JobPulse 2.0 — Enhance Admin System Metrics RPC with 24h Job-Level Aggregates
-- Version: 20260903000002
-- Description: Adds jobsDiscovered, jobsInserted, jobsUpdated, jobsFailed to
--              ingestion24h metrics so the admin dashboard clearly distinguishes
--              source execution health from job-level ingestion counts.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_system_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
