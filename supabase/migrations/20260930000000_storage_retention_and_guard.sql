-- 1. Update purge_stale_raw_payloads default retention
CREATE OR REPLACE FUNCTION public.purge_stale_raw_payloads(
    p_batch_size INT DEFAULT 1000,
    p_max_batches INT DEFAULT 10,
    p_retention_days INT DEFAULT 2 -- Changed from 7 to 2
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

-- 2. Create orphan job cleanup function
CREATE OR REPLACE FUNCTION public.purge_orphaned_jobs(
    p_batch_size INT DEFAULT 500,
    p_max_batches INT DEFAULT 10
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
BEGIN
    IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') 
       AND coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role' 
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative privileges required to execute job retention purge.';
    END IF;

    FOR v_batches_run IN 1..p_max_batches LOOP
        WITH candidate_batch AS (
            SELECT j.id
            FROM public.jobs j
            WHERE NOT EXISTS (SELECT 1 FROM public.job_sources js WHERE js.job_id = j.id)
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

        EXIT WHEN v_batch_deleted = 0;
    END LOOP;

    RETURN jsonb_build_object(
        'deleted_orphans_count', v_total_deleted,
        'batches_executed', v_batches_run
    );
END;
$$;

-- 3. Add database size to get_retention_and_storage_metrics
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

GRANT EXECUTE ON FUNCTION public.purge_orphaned_jobs TO authenticated, service_role;
