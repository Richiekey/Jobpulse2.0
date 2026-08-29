-- ============================================================================
-- JobPulse 2.0 — Company & Source Intelligence Enhancements
-- Version: 20260829000006
-- Description: Adds slug, domain, description, company_size to companies,
--              and priority, schedule, job count tracking to company_sources.
-- ============================================================================

-- 1. COMPANIES ENHANCEMENTS
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS domain TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS company_size TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Populate slug for existing companies if null
UPDATE public.companies
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

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
