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
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%salary_interval%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.jobs DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.jobs ADD CONSTRAINT chk_salary_interval
  CHECK (salary_interval IS NULL OR salary_interval IN ('yearly', 'monthly', 'weekly', 'daily', 'hourly'));
