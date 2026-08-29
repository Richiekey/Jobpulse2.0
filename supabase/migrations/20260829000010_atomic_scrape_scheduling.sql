-- ============================================================================
-- JobPulse 2.0 — Atomic Scrape Scheduling RPC with Transactional Concurrency Lock
-- Version: 20260829000010
-- Description: Replaces advisory concurrency check with atomic pg_advisory_xact_lock
--              inside a SECURITY DEFINER PostgreSQL RPC to eliminate all TOCTOU races.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.schedule_admin_scrape_run(
    p_admin_id UUID,
    p_company_identifier TEXT DEFAULT 'all',
    p_source_id UUID DEFAULT NULL,
    p_ttl_seconds INT DEFAULT 900
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lock_key TEXT;
    v_active_run_id UUID;
    v_active_run_status TEXT;
    v_active_run_started TIMESTAMPTZ;
    v_new_run_id UUID;
    v_new_run_started TIMESTAMPTZ := now();
    v_cutoff TIMESTAMPTZ := now() - (p_ttl_seconds || ' seconds')::interval;
BEGIN
    -- 1. Authorization check: must be service_role or verified admin
    IF current_user != 'service_role' 
       AND coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role' 
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative privileges required to schedule a scrape run.';
    END IF;

    -- 2. Verify source existence and active state if source_id is provided
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

    -- 3. Acquire exclusive transactional advisory lock for target
    -- Serializes concurrent trigger requests atomically within PostgreSQL
    v_lock_key := 'scrape_target_' || coalesce(p_source_id::text, p_company_identifier, 'all');
    PERFORM pg_advisory_xact_lock(hashtext(v_lock_key));

    -- 4. Atomically check for active (pending or running) scrape runs within TTL cutoff
    IF p_source_id IS NOT NULL THEN
        SELECT id, status, started_at INTO v_active_run_id, v_active_run_status, v_active_run_started
        FROM public.scrape_runs
        WHERE status IN ('pending', 'running')
          AND started_at >= v_cutoff
          AND metadata->>'source_id' = p_source_id::text
        ORDER BY started_at DESC
        LIMIT 1;
    ELSIF p_company_identifier IS NOT NULL AND p_company_identifier != 'all' THEN
        SELECT id, status, started_at INTO v_active_run_id, v_active_run_status, v_active_run_started
        FROM public.scrape_runs
        WHERE status IN ('pending', 'running')
          AND started_at >= v_cutoff
          AND metadata->>'company_identifier' = p_company_identifier
        ORDER BY started_at DESC
        LIMIT 1;
    ELSE
        SELECT id, status, started_at INTO v_active_run_id, v_active_run_status, v_active_run_started
        FROM public.scrape_runs
        WHERE status IN ('pending', 'running')
          AND started_at >= v_cutoff
          AND (metadata->>'company_identifier' = 'all' OR metadata->>'company_identifier' IS NULL)
        ORDER BY started_at DESC
        LIMIT 1;
    END IF;

    -- 5. If an active run already exists, return conflict immediately
    IF v_active_run_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'conflict', true,
            'existing_run_id', v_active_run_id,
            'existing_status', v_active_run_status,
            'existing_started_at', v_active_run_started,
            'message', 'A scrape crawl is already running or queued for this target (Run ID: ' || v_active_run_id || '). Please wait for it to complete.'
        );
    END IF;

    -- 6. Atomically insert the new scrape_runs record
    INSERT INTO public.scrape_runs (
        started_at,
        status,
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
        0, 0, 0, 0, 0, 0, 0, 0,
        jsonb_build_object(
            'triggered_by_admin', p_admin_id,
            'company_identifier', coalesce(p_company_identifier, 'all'),
            'source_id', p_source_id
        )
    ) RETURNING id INTO v_new_run_id;

    RETURN jsonb_build_object(
        'success', true,
        'conflict', false,
        'run_id', v_new_run_id,
        'status', 'pending',
        'scheduled_at', v_new_run_started,
        'company_identifier', coalesce(p_company_identifier, 'all'),
        'source_id', p_source_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.schedule_admin_scrape_run FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_admin_scrape_run TO authenticated, service_role;
