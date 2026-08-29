-- ============================================================================
-- JobPulse 2.0 — Company & Source Intelligence Enhancements
-- Version: 20260829000006
-- Description: Adds slug, domain, description, company_size to companies,
--              and priority, schedule, job count tracking to company_sources.
--              Includes deterministic, collision-safe slug generation for existing data.
-- ============================================================================

-- 1. COMPANIES ENHANCEMENTS
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS domain TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS company_size TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Deterministically generate clean base slug and resolve collisions with numeric suffix
DO $$
DECLARE
  rec RECORD;
  base_slug TEXT;
  candidate_slug TEXT;
  counter INT;
BEGIN
  -- Process any companies where slug IS NULL, ordered deterministically by created_at, id
  FOR rec IN 
    SELECT id, name 
    FROM public.companies 
    WHERE slug IS NULL 
    ORDER BY created_at ASC, id ASC
  LOOP
    -- Clean regex: lowercase, replace non-alphanumeric with hyphen, trim leading/trailing hyphens
    base_slug := trim(both '-' from lower(regexp_replace(rec.name, '[^a-zA-Z0-9]+', '-', 'g')));
    IF base_slug IS NULL OR base_slug = '' THEN
      base_slug := 'company';
    END IF;

    candidate_slug := base_slug;
    counter := 2;

    -- Check for collision with already assigned slugs
    WHILE EXISTS (SELECT 1 FROM public.companies WHERE slug = candidate_slug AND id != rec.id) LOOP
      candidate_slug := base_slug || '-' || counter;
      counter := counter + 1;
    END LOOP;

    UPDATE public.companies
    SET slug = candidate_slug
    WHERE id = rec.id;
  END LOOP;
END $$;

-- Make slug unique and not null
ALTER TABLE public.companies
    ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug ON public.companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON public.companies(domain) WHERE domain IS NOT NULL;

-- 2. COMPANY SOURCES ENHANCEMENTS
ALTER TABLE public.company_sources
    ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS schedule_interval_minutes INTEGER NOT NULL DEFAULT 360,
    ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_job_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discovery_method TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_company_sources_scheduling 
    ON public.company_sources(is_active, health_status, priority, last_checked_at);
