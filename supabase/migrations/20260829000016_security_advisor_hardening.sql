-- ============================================================================
-- JobPulse 2.0 — Security Advisor Hardening & Privilege Boundary Enforcement
-- Version: 20260829000016
-- Description: Sets search_path on trigger functions, converts public read functions
--              to SECURITY INVOKER, and enforces strict RBAC across all RPCs.
-- ============================================================================

-- 1. Fix search_path on jobs_search_vector_update
CREATE OR REPLACE FUNCTION public.jobs_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.display_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.canonical_title, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.skills, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'D');
  RETURN NEW;
END;
$$;

-- 2. Trigger functions: Revoke direct execution from API roles
REVOKE EXECUTE ON FUNCTION public.jobs_search_vector_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- 3. Worker-only RPCs: Grant strictly to service_role, revoke from anon and authenticated
REVOKE EXECUTE ON FUNCTION public.ingest_job_transaction(uuid, text, text, text, text, public.employment_type_enum, public.workplace_type_enum, text[], numeric, numeric, text, text, text[], timestamptz, text, text, text, text, numeric, varchar, uuid, text, text, text, varchar, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_job_transaction(uuid, text, text, text, text, public.employment_type_enum, public.workplace_type_enum, text[], numeric, numeric, text, text, text[], timestamptz, text, text, text, text, numeric, varchar, uuid, text, text, text, varchar, jsonb, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.verify_worker_access() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_worker_access() TO service_role;

REVOKE EXECUTE ON FUNCTION public.try_acquire_scrape_lock(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_scrape_lock(text, text, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_scrape_lock(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_scrape_lock(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_next_pending_scrape_run() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_pending_scrape_run() TO service_role;

REVOKE EXECUTE ON FUNCTION public.reconcile_company_source_job_lifecycle(uuid, text[], timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_company_source_job_lifecycle(uuid, text[], timestamptz, integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_undelivered_alert_jobs(uuid, uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_undelivered_alert_jobs(uuid, uuid[], integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mark_alert_jobs_delivered(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_alert_jobs_delivered(uuid, uuid[], uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mark_alert_jobs_failed(uuid, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_alert_jobs_failed(uuid, uuid[], text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_job_alert_delivery(uuid, uuid, uuid[], text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_job_alert_delivery(uuid, uuid, uuid[], text, text, text, jsonb) TO service_role;

-- 4. Admin RPCs: Revoke from anon, grant to authenticated and service_role (internal is_admin() guards execution)
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_admin_system_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_system_metrics() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.onboard_company_and_source(text, text, text, text, text, uuid, text, text, integer, integer, boolean, health_status_enum) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onboard_company_and_source(text, text, text, text, text, uuid, text, text, integer, integer, boolean, health_status_enum) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.schedule_admin_scrape_run(uuid, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_admin_scrape_run(uuid, text, uuid, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.force_unlock_scrape(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.force_unlock_scrape(text) TO authenticated, service_role;

-- 5. Public read RPCs: Convert get_salary_benchmarks to SECURITY INVOKER with explicit search_path
CREATE OR REPLACE FUNCTION public.get_salary_benchmarks(
  p_query TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_workplace_type TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_currency IS NOT NULL AND p_currency != '' AND p_currency != 'all' THEN
    WITH eligible_jobs AS (
      SELECT 
        annualized_min,
        annualized_max,
        coalesce(annualized_min, annualized_max) AS representative_salary,
        equity_mentioned
      FROM public.jobs
      WHERE status = 'active'
        AND has_salary = true
        AND salary_currency = upper(p_currency)
        AND (p_query IS NULL OR p_query = '' OR title ILIKE '%' || p_query || '%' OR description_text ILIKE '%' || p_query || '%')
        AND (p_department IS NULL OR p_department = '' OR department ILIKE '%' || p_department || '%')
        AND (p_workplace_type IS NULL OR p_workplace_type = 'all' OR workplace_type = p_workplace_type)
    ),
    stats AS (
      SELECT
        count(*)::INT AS sample_size,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY representative_salary) AS p25,
        percentile_cont(0.50) WITHIN GROUP (ORDER BY representative_salary) AS median,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY representative_salary) AS p75,
        min(representative_salary) AS min_salary,
        max(representative_salary) AS max_salary,
        round(avg(CASE WHEN equity_mentioned THEN 100.0 ELSE 0.0 END), 1) AS equity_rate
      FROM eligible_jobs
    )
    SELECT jsonb_build_object(
      'currency', upper(p_currency),
      'sample_size', coalesce(sample_size, 0),
      'p25', CASE WHEN coalesce(sample_size, 0) >= 3 THEN round(coalesce(p25, 0)::numeric) ELSE NULL END,
      'median', CASE WHEN coalesce(sample_size, 0) >= 3 THEN round(coalesce(median, 0)::numeric) ELSE NULL END,
      'p75', CASE WHEN coalesce(sample_size, 0) >= 3 THEN round(coalesce(p75, 0)::numeric) ELSE NULL END,
      'min', round(coalesce(min_salary, 0)::numeric),
      'max', round(coalesce(max_salary, 0)::numeric),
      'equity_rate', coalesce(equity_rate, 0.0),
      'insufficient_data', (coalesce(sample_size, 0) < 3)
    )
    INTO v_result
    FROM stats;
  ELSE
    WITH eligible_jobs AS (
      SELECT 
        salary_currency AS curr,
        annualized_min,
        annualized_max,
        coalesce(annualized_min, annualized_max) AS representative_salary,
        equity_mentioned
      FROM public.jobs
      WHERE status = 'active'
        AND has_salary = true
        AND salary_currency IS NOT NULL
        AND (p_query IS NULL OR p_query = '' OR title ILIKE '%' || p_query || '%' OR description_text ILIKE '%' || p_query || '%')
        AND (p_department IS NULL OR p_department = '' OR department ILIKE '%' || p_department || '%')
        AND (p_workplace_type IS NULL OR p_workplace_type = 'all' OR workplace_type = p_workplace_type)
    ),
    currency_stats AS (
      SELECT
        curr,
        count(*)::INT AS sample_size,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY representative_salary) AS p25,
        percentile_cont(0.50) WITHIN GROUP (ORDER BY representative_salary) AS median,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY representative_salary) AS p75,
        min(representative_salary) AS min_salary,
        max(representative_salary) AS max_salary,
        round(avg(CASE WHEN equity_mentioned THEN 100.0 ELSE 0.0 END), 1) AS equity_rate
      FROM eligible_jobs
      GROUP BY curr
      ORDER BY count(*) DESC
    )
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'currency', curr,
        'sample_size', sample_size,
        'p25', CASE WHEN sample_size >= 3 THEN round(coalesce(p25, 0)::numeric) ELSE NULL END,
        'median', CASE WHEN sample_size >= 3 THEN round(coalesce(median, 0)::numeric) ELSE NULL END,
        'p75', CASE WHEN sample_size >= 3 THEN round(coalesce(p75, 0)::numeric) ELSE NULL END,
        'min', round(coalesce(min_salary, 0)::numeric),
        'max', round(coalesce(max_salary, 0)::numeric),
        'equity_rate', coalesce(equity_rate, 0.0),
        'insufficient_data', (sample_size < 3)
      )
    ), '[]'::jsonb)
    INTO v_result
    FROM currency_stats;
  END IF;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_salary_benchmarks(text, text, text, text) TO anon, authenticated, service_role;
