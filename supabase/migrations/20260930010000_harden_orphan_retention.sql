-- Harden orphan retention so missing job_sources is not, by itself, enough to delete a job.
-- Only stale/expired jobs older than the configured retention window are eligible.
CREATE OR REPLACE FUNCTION public.purge_orphaned_jobs(
    p_batch_size INT DEFAULT 500,
    p_max_batches INT DEFAULT 10,
    p_retention_days INT DEFAULT 14
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
    IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
       AND coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role'
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative privileges required to execute job retention purge.';
    END IF;

    FOR v_batches_run IN 1..p_max_batches LOOP
        WITH candidate_batch AS (
            SELECT j.id
            FROM public.jobs j
            WHERE NOT EXISTS (
                SELECT 1 FROM public.job_sources js WHERE js.job_id = j.id
            )
              AND (
                j.posted_at < v_cutoff
                OR (
                    j.status = 'expired'
                    AND j.last_seen_at < v_cutoff
                )
              )
              AND NOT EXISTS (
                SELECT 1 FROM public.applications a WHERE a.job_id = j.id
              )
              AND NOT EXISTS (
                SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = j.id
              )
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
        'batches_executed', v_batches_run,
        'retention_cutoff', v_cutoff
    );
END;
$$;
