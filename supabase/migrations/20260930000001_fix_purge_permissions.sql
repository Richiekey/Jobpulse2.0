CREATE OR REPLACE FUNCTION public.purge_stale_raw_payloads(
    p_batch_size INT DEFAULT 1000,
    p_max_batches INT DEFAULT 10,
    p_retention_days INT DEFAULT 2
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
    IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
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
