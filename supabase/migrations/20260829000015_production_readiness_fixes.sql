-- ============================================================================
-- JobPulse 2.0 — Production Readiness Fixes
-- Version: 20260829000015
-- Description: Sets salary_currency default to NULL and updates salary_interval CHECK constraint to include weekly
-- ============================================================================

-- 1. P0-1: salary_currency must NOT default to 'USD' (Batch H invariant)
-- Ensures that unprovided currency remains NULL / UNKNOWN rather than silently assuming USD.
ALTER TABLE public.jobs ALTER COLUMN salary_currency SET DEFAULT NULL;

-- 2. P0-2: salary_interval CHECK constraint update
-- Ensure 'weekly' (52 factor) is a valid, constrained salary_interval alongside yearly, monthly, daily, and hourly.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_salary_interval_check;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS chk_salary_interval;

ALTER TABLE public.jobs ADD CONSTRAINT chk_salary_interval
  CHECK (salary_interval IS NULL OR salary_interval IN ('yearly', 'monthly', 'weekly', 'daily', 'hourly'));

-- 3. P0-3: Eliminate known worker secret from database authorization function
-- verify_worker_access permits service_role / postgres roles directly, or verifies against app.settings.worker_secret_token
CREATE OR REPLACE FUNCTION public.verify_worker_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_headers jsonb;
  v_token text;
  v_expected_token text;
BEGIN
  -- 1. If executed by service_role or postgres role, allow immediately
  IF auth.role() IN ('service_role', 'postgres') THEN
    RETURN true;
  END IF;

  -- 2. If executed via PostgREST with x-worker-token header, verify against configured secret setting
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_token := v_headers->>'x-worker-token';
  EXCEPTION
    WHEN OTHERS THEN
      v_token := NULL;
  END;

  BEGIN
    v_expected_token := current_setting('app.settings.worker_secret_token', true);
  EXCEPTION
    WHEN OTHERS THEN
      v_expected_token := NULL;
  END;

  IF v_token IS NOT NULL AND v_expected_token IS NOT NULL AND v_token = v_expected_token AND v_expected_token <> '' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

