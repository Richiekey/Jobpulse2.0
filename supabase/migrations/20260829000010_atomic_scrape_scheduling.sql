-- ============================================================================
-- JobPulse 2.0 — Atomic Scrape Scheduling & Hard PostgreSQL Concurrency Invariant
-- Version: 20260829000010
-- Description: Enforces that at most ONE eligible crawl may be active/scheduled
--              for the same concurrency scope at a time via PostgreSQL UNIQUE partial index.
-- ============================================================================

-- 1. Add concurrency_scope column to scrape_runs table if not present
ALTER TABLE public.scrape_runs
ADD COLUMN IF NOT EXISTS concurrency_scope TEXT NOT NULL DEFAULT 'global';

-- 2. Populate concurrency_scope for existing records based on metadata
UPDATE public.scrape_runs
SET concurrency_scope = CASE
    WHEN metadata->>'source_id' IS NOT NULL THEN 'source:' || (metadata->>'source_id')
    WHEN metadata->>'company_identifier' IS NOT NULL AND metadata->>'company_identifier' != 'all' THEN 'company:' || (metadata->>'company_identifier')
    ELSE 'global'
END
WHERE concurrency_scope = 'global' AND metadata IS NOT NULL AND metadata != '{}'::jsonb;

-- 3. Create HARD PostgreSQL UNIQUE Partial Index
-- Guarantees that at most ONE pending or running scrape run can exist per concurrency scope
CREATE UNIQUE INDEX IF NOT EXISTS uq_scrape_runs_active_concurrency_scope
ON public.scrape_runs (concurrency_scope)
WHERE status IN ('pending', 'running');

-- 4. Create Atomic Schedule Scrape Run RPC
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
    v_concurrency_scope TEXT;
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

    -- 2. Determine deterministic concurrency scope
    IF p_source_id IS NOT NULL THEN
        v_concurrency_scope := 'source:' || p_source_id::text;
    ELSIF p_company_identifier IS NOT NULL AND p_company_identifier != 'all' THEN
        v_concurrency_scope := 'company:' || p_company_identifier;
    ELSE
        v_concurrency_scope := 'global';
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

    -- 4. Expire any orphaned / stale runs past TTL for this scope
    UPDATE public.scrape_runs
    SET status = 'failed',
        completed_at = now(),
        error_summary = jsonb_build_array(jsonb_build_object('error', 'Execution timed out past TTL lease window'))
    WHERE concurrency_scope = v_concurrency_scope
      AND status IN ('pending', 'running')
      AND started_at < v_cutoff;

    -- 5. Atomically insert new run, enforced by PostgreSQL UNIQUE PARTIAL INDEX
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
            'concurrency_scope', v_concurrency_scope,
            'scheduled_at', v_new_run_started,
            'company_identifier', coalesce(p_company_identifier, 'all'),
            'source_id', p_source_id
        );

    EXCEPTION 
        WHEN unique_violation THEN
            -- PostgreSQL atomic unique constraint rejected duplicate active run
            SELECT id, status, started_at INTO v_active_run_id, v_active_run_status, v_active_run_started
            FROM public.scrape_runs
            WHERE concurrency_scope = v_concurrency_scope
              AND status IN ('pending', 'running')
            ORDER BY started_at DESC
            LIMIT 1;

            RETURN jsonb_build_object(
                'success', false,
                'conflict', true,
                'concurrency_scope', v_concurrency_scope,
                'existing_run_id', v_active_run_id,
                'existing_status', v_active_run_status,
                'existing_started_at', v_active_run_started,
                'message', 'A crawl run is already actively scheduled or running for concurrency scope "' || v_concurrency_scope || '" (Run ID: ' || coalesce(v_active_run_id::text, 'unknown') || '). Please wait for it to complete.'
            );
    END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.schedule_admin_scrape_run FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_admin_scrape_run TO authenticated, service_role;
