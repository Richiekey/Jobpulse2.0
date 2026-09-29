CREATE OR REPLACE FUNCTION public.get_retention_and_storage_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
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
                      AND last_seen_at < now() - INTERVAL '14 days'
                      AND NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.job_id = jobs.id)
                      AND NOT EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = jobs.id)
                ),
                'orphans_eligible_for_deletion', count(*) FILTER (
                    WHERE NOT EXISTS (SELECT 1 FROM public.job_sources js WHERE js.job_id = jobs.id)
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
                'older_than_2d', count(*) FILTER (WHERE fetched_at < now() - INTERVAL '2 days'),
                'older_than_7d', count(*) FILTER (WHERE fetched_at < now() - INTERVAL '7 days')
            ) FROM public.raw_job_payloads
        ),
        'storage', (
            SELECT jsonb_build_object(
                'database_size_bytes', pg_database_size(current_database()),
                'database_size_pretty', pg_size_pretty(pg_database_size(current_database())),
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
