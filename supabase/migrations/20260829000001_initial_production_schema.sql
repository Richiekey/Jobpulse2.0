-- ============================================================================
-- JobPulse 2.0 — Production Schema Migration
-- Version: 20260829000001
-- Description: Complete relational schema, indexes, constraints, and RLS policies
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. ENUMS & DOMAINS
CREATE TYPE workplace_type_enum AS ENUM ('remote', 'hybrid', 'on_site', 'unspecified');
CREATE TYPE employment_type_enum AS ENUM ('full_time', 'part_time', 'contract', 'internship', 'temporary', 'other');
CREATE TYPE job_status_enum AS ENUM ('active', 'suspect', 'stale', 'expired', 'removed');
CREATE TYPE application_status_enum AS ENUM ('saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'archived');
CREATE TYPE source_type_enum AS ENUM ('ats_direct', 'aggregator', 'sitemap', 'feed', 'manual');
CREATE TYPE health_status_enum AS ENUM ('healthy', 'degraded', 'failing', 'disabled');
CREATE TYPE scrape_run_status_enum AS ENUM ('running', 'completed', 'failed', 'cancelled');
CREATE TYPE sync_status_enum AS ENUM ('pending', 'synced', 'failed');

-- 3. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. COMPANIES
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    website TEXT,
    careers_url TEXT,
    logo_url TEXT,
    industry TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending_verification')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. ATS PLATFORMS
CREATE TABLE IF NOT EXISTS public.ats_platforms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    domains TEXT[] NOT NULL DEFAULT '{}',
    capabilities JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. SOURCES
CREATE TABLE IF NOT EXISTS public.sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ats_platform_id UUID REFERENCES public.ats_platforms(id) ON DELETE SET NULL,
    type source_type_enum NOT NULL DEFAULT 'ats_direct',
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    adapter_name TEXT NOT NULL,
    status health_status_enum NOT NULL DEFAULT 'healthy',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. COMPANY SOURCES
CREATE TABLE IF NOT EXISTS public.company_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
    source_identifier TEXT NOT NULL,
    source_url TEXT,
    adapter_config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    health_status health_status_enum NOT NULL DEFAULT 'healthy',
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_company_source UNIQUE (company_id, source_id, source_identifier)
);

-- 8. JOBS
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    canonical_title TEXT NOT NULL,
    display_title TEXT NOT NULL,
    description TEXT NOT NULL,
    description_html TEXT,
    employment_type employment_type_enum NOT NULL DEFAULT 'full_time',
    workplace_type workplace_type_enum NOT NULL DEFAULT 'unspecified',
    locations TEXT[] NOT NULL DEFAULT '{}',
    salary_min NUMERIC,
    salary_max NUMERIC,
    salary_currency TEXT DEFAULT 'USD',
    salary_interval TEXT CHECK (salary_interval IN ('yearly', 'monthly', 'hourly', 'daily')),
    skills TEXT[] NOT NULL DEFAULT '{}',
    posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    status job_status_enum NOT NULL DEFAULT 'active',
    missed_scrape_count INTEGER NOT NULL DEFAULT 0,
    canonical_url TEXT NOT NULL,
    apply_url TEXT NOT NULL,
    original_apply_url TEXT,
    url_resolution_method TEXT NOT NULL DEFAULT 'explicit_original_url',
    url_resolution_confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (url_resolution_confidence >= 0 AND url_resolution_confidence <= 1.00),
    source_metadata JSONB NOT NULL DEFAULT '{}',
    search_vector TSVECTOR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_salary_range CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max)
);

-- 8.1 Search vector trigger
CREATE OR REPLACE FUNCTION public.jobs_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.display_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.canonical_title, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.skills, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_jobs_search_vector_update ON public.jobs;
CREATE TRIGGER trg_jobs_search_vector_update
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_search_vector_update();

-- 9. JOB SOURCES (PROVENANCE)
CREATE TABLE IF NOT EXISTS public.job_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
    external_job_id TEXT NOT NULL,
    discovery_url TEXT NOT NULL,
    source_job_url TEXT NOT NULL,
    raw_payload_hash TEXT NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_primary BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_source_external_job UNIQUE (source_id, external_job_id)
);

-- 10. RAW JOB PAYLOADS
CREATE TABLE IF NOT EXISTS public.raw_job_payloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    payload_hash TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. SCRAPE RUNS
CREATE TABLE IF NOT EXISTS public.scrape_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status scrape_run_status_enum NOT NULL DEFAULT 'running',
    companies_attempted INTEGER NOT NULL DEFAULT 0,
    companies_succeeded INTEGER NOT NULL DEFAULT 0,
    companies_failed INTEGER NOT NULL DEFAULT 0,
    jobs_discovered INTEGER NOT NULL DEFAULT 0,
    jobs_inserted INTEGER NOT NULL DEFAULT 0,
    jobs_updated INTEGER NOT NULL DEFAULT 0,
    jobs_rejected INTEGER NOT NULL DEFAULT 0,
    jobs_failed INTEGER NOT NULL DEFAULT 0,
    error_summary JSONB NOT NULL DEFAULT '[]',
    metadata JSONB NOT NULL DEFAULT '{}'
);

-- 12. SCRAPE RUN SOURCES
CREATE TABLE IF NOT EXISTS public.scrape_run_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scrape_run_id UUID NOT NULL REFERENCES public.scrape_runs(id) ON DELETE CASCADE,
    company_source_id UUID NOT NULL REFERENCES public.company_sources(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'skipped')),
    jobs_discovered INTEGER NOT NULL DEFAULT 0,
    jobs_inserted INTEGER NOT NULL DEFAULT 0,
    jobs_updated INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. SAVED JOBS (USER STATE)
CREATE TABLE IF NOT EXISTS public.saved_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_saved_job UNIQUE (user_id, job_id)
);

-- 14. HIDDEN JOBS (USER STATE)
CREATE TABLE IF NOT EXISTS public.hidden_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_hidden_job UNIQUE (user_id, job_id)
);

-- 15. APPLICATIONS (USER APPLICATION TRACKER)
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    company_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    status application_status_enum NOT NULL DEFAULT 'applied',
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes TEXT,
    sync_status sync_status_enum NOT NULL DEFAULT 'synced',
    synced_at TIMESTAMPTZ,
    last_sync_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_job_application UNIQUE (user_id, job_id)
);

-- 16. USER PREFERENCES
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    preferred_locations TEXT[] NOT NULL DEFAULT '{}',
    preferred_workplace_types TEXT[] NOT NULL DEFAULT '{}',
    preferred_roles TEXT[] NOT NULL DEFAULT '{}',
    minimum_salary NUMERIC,
    email_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. USER INTEGRATIONS
CREATE TABLE IF NOT EXISTS public.user_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google_sheets', 'google_drive', 'notion', 'airtable')),
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_provider UNIQUE (user_id, provider)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Jobs feed and search
CREATE INDEX IF NOT EXISTS idx_jobs_feed ON public.jobs (status, posted_at DESC, id DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON public.jobs (company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_workplace ON public.jobs (workplace_type);
CREATE INDEX IF NOT EXISTS idx_jobs_employment ON public.jobs (employment_type);
CREATE INDEX IF NOT EXISTS idx_jobs_skills ON public.jobs USING GIN (skills);
CREATE INDEX IF NOT EXISTS idx_jobs_locations ON public.jobs USING GIN (locations);
CREATE INDEX IF NOT EXISTS idx_jobs_search_vector ON public.jobs USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_jobs_salary ON public.jobs (salary_min, salary_max) WHERE salary_min IS NOT NULL;

-- Provenance & deduplication
CREATE INDEX IF NOT EXISTS idx_job_sources_job_id ON public.job_sources (job_id);
CREATE INDEX IF NOT EXISTS idx_job_sources_lookup ON public.job_sources (source_id, external_job_id);
CREATE INDEX IF NOT EXISTS idx_raw_job_payloads_lookup ON public.raw_job_payloads (source_id, external_id, fetched_at DESC);

-- Company & sources
CREATE INDEX IF NOT EXISTS idx_companies_normalized_name ON public.companies (normalized_name);
CREATE INDEX IF NOT EXISTS idx_company_sources_active ON public.company_sources (is_active, health_status);
CREATE INDEX IF NOT EXISTS idx_company_sources_company ON public.company_sources (company_id);

-- User state indexes
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user ON public.saved_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hidden_jobs_user ON public.hidden_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_applications_user ON public.applications (user_id, status, applied_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all user-owned and protected tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hidden_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_job_payloads ENABLE ROW LEVEL SECURITY;

-- Helper function: Is Admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Profiles
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 2. Jobs (Public read for active jobs)
CREATE POLICY "Public can view active jobs"
    ON public.jobs FOR SELECT
    USING (status = 'active' OR public.is_admin());

-- 3. Companies & ATS Platforms & Sources (Public read)
CREATE POLICY "Public can view active companies"
    ON public.companies FOR SELECT
    USING (status = 'active' OR public.is_admin());

CREATE POLICY "Public can view active ATS platforms"
    ON public.ats_platforms FOR SELECT
    USING (is_active = true OR public.is_admin());

CREATE POLICY "Public can view active sources"
    ON public.sources FOR SELECT
    USING (status != 'disabled' OR public.is_admin());

-- 4. Saved Jobs
CREATE POLICY "Users can view their saved jobs"
    ON public.saved_jobs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their saved jobs"
    ON public.saved_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their saved jobs"
    ON public.saved_jobs FOR DELETE
    USING (auth.uid() = user_id);

-- 5. Hidden Jobs
CREATE POLICY "Users can view their hidden jobs"
    ON public.hidden_jobs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert hidden jobs"
    ON public.hidden_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete hidden jobs"
    ON public.hidden_jobs FOR DELETE
    USING (auth.uid() = user_id);

-- 6. Applications
CREATE POLICY "Users can view their applications"
    ON public.applications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert applications"
    ON public.applications FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their applications"
    ON public.applications FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their applications"
    ON public.applications FOR DELETE
    USING (auth.uid() = user_id);

-- 7. User Preferences & Integrations
CREATE POLICY "Users can view their preferences"
    ON public.user_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their preferences"
    ON public.user_preferences FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their integrations"
    ON public.user_integrations FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 8. Admin Scrape Runs & Payloads
CREATE POLICY "Admins can view scrape runs"
    ON public.scrape_runs FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Admins can view raw payloads"
    ON public.raw_job_payloads FOR SELECT
    USING (public.is_admin());

-- Automatic profile creation on signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    'user'
  );
  INSERT INTO public.user_preferences (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
