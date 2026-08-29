-- Migration: 20260829000003_harden_security_and_contracts.sql
-- Description: M01 RPC Security, M02 Privilege Escalation Defense, M04 Status Enum Update, M06 Telemetry Contract Alignment.

-- =========================================================================
-- 1. M04: Add 'pending' status to scrape_run_status_enum
-- =========================================================================
DO $$
BEGIN
  ALTER TYPE public.scrape_run_status_enum ADD VALUE IF NOT EXISTS 'pending' BEFORE 'running';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================================
-- 2. M06: Telemetry schema contract alignment for scrape_run_sources
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'scrape_run_sources' AND column_name = 'jobs_rejected'
  ) THEN
    ALTER TABLE public.scrape_run_sources ADD COLUMN jobs_rejected INT DEFAULT 0 NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'scrape_run_sources' AND column_name = 'jobs_failed'
  ) THEN
    ALTER TABLE public.scrape_run_sources ADD COLUMN jobs_failed INT DEFAULT 0 NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'scrape_run_sources' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.scrape_run_sources ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'scrape_run_sources' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE public.scrape_run_sources ADD COLUMN started_at TIMESTAMPTZ DEFAULT clock_timestamp() NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'scrape_run_sources' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.scrape_run_sources ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;
END $$;

-- =========================================================================
-- 3. M02: Prevent User Role Escalation (Database-level trigger)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If the role is being modified, verify that caller has admin role
  IF (OLD.role IS DISTINCT FROM NEW.role) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Non-admin users cannot modify authorization roles';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- Ensure handle_new_user has secure search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

-- =========================================================================
-- 4. M01: Harden ingest_job_transaction (Search Path & Strict Permissions)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.ingest_job_transaction(
  p_company_id UUID,
  p_canonical_title TEXT,
  p_display_title TEXT,
  p_description TEXT,
  p_description_html TEXT,
  p_employment_type public.employment_type_enum,
  p_workplace_type public.workplace_type_enum,
  p_locations TEXT[],
  p_salary_min NUMERIC,
  p_salary_max NUMERIC,
  p_salary_currency TEXT,
  p_salary_interval TEXT,
  p_skills TEXT[],
  p_posted_at TIMESTAMPTZ,
  p_canonical_url TEXT,
  p_apply_url TEXT,
  p_original_apply_url TEXT,
  p_url_resolution_method TEXT,
  p_url_resolution_confidence NUMERIC,
  p_canonical_fingerprint VARCHAR(64),
  p_source_id UUID,
  p_external_job_id TEXT,
  p_source_job_url TEXT,
  p_discovery_url TEXT,
  p_raw_payload_hash VARCHAR(64),
  p_raw_payload JSONB,
  p_parser_version TEXT,
  p_source_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id UUID;
  v_job_source_id UUID;
  v_status TEXT;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- Level 1: Deterministic source identity check (source_id + external_job_id)
  SELECT job_id, id INTO v_job_id, v_job_source_id
  FROM public.job_sources
  WHERE source_id = p_source_id AND external_job_id = p_external_job_id
  LIMIT 1;

  -- Level 2: Canonical URL matching if Level 1 did not match
  IF v_job_id IS NULL AND p_canonical_url IS NOT NULL AND p_canonical_url <> '' THEN
    SELECT id INTO v_job_id
    FROM public.jobs
    WHERE canonical_url = p_canonical_url AND status = 'active'
    LIMIT 1;
  END IF;

  IF v_job_id IS NOT NULL THEN
    -- Existing Job -> UPDATE canonical job record
    UPDATE public.jobs
    SET
      canonical_title = p_canonical_title,
      display_title = p_display_title,
      description = p_description,
      description_html = p_description_html,
      employment_type = p_employment_type,
      workplace_type = p_workplace_type,
      locations = p_locations,
      salary_min = p_salary_min,
      salary_max = p_salary_max,
      salary_currency = p_salary_currency,
      salary_interval = p_salary_interval,
      skills = p_skills,
      status = 'active',
      missed_scrape_count = 0,
      canonical_url = p_canonical_url,
      apply_url = p_apply_url,
      original_apply_url = p_original_apply_url,
      url_resolution_method = p_url_resolution_method,
      url_resolution_confidence = p_url_resolution_confidence,
      canonical_fingerprint = p_canonical_fingerprint,
      last_seen_at = v_now,
      source_metadata = COALESCE(p_source_metadata, '{}'::jsonb),
      updated_at = v_now
    WHERE id = v_job_id;

    -- Upsert job_sources provenance record
    INSERT INTO public.job_sources (
      job_id,
      source_id,
      external_job_id,
      discovery_url,
      source_job_url,
      raw_payload_hash,
      first_seen_at,
      last_seen_at,
      created_at,
      updated_at
    )
    VALUES (
      v_job_id,
      p_source_id,
      p_external_job_id,
      p_discovery_url,
      p_source_job_url,
      p_raw_payload_hash,
      v_now,
      v_now,
      v_now,
      v_now
    )
    ON CONFLICT (source_id, external_job_id) DO UPDATE SET
      raw_payload_hash = EXCLUDED.raw_payload_hash,
      source_job_url = EXCLUDED.source_job_url,
      discovery_url = EXCLUDED.discovery_url,
      last_seen_at = v_now,
      updated_at = v_now
    RETURNING id INTO v_job_source_id;

    v_status := 'updated';
  ELSE
    -- New Job -> INSERT into jobs table
    INSERT INTO public.jobs (
      company_id,
      canonical_title,
      display_title,
      description,
      description_html,
      employment_type,
      workplace_type,
      locations,
      salary_min,
      salary_max,
      salary_currency,
      salary_interval,
      skills,
      posted_at,
      first_seen_at,
      last_seen_at,
      status,
      missed_scrape_count,
      canonical_url,
      apply_url,
      original_apply_url,
      url_resolution_method,
      url_resolution_confidence,
      canonical_fingerprint,
      source_metadata,
      created_at,
      updated_at
    )
    VALUES (
      p_company_id,
      p_canonical_title,
      p_display_title,
      p_description,
      p_description_html,
      p_employment_type,
      p_workplace_type,
      p_locations,
      p_salary_min,
      p_salary_max,
      p_salary_currency,
      p_salary_interval,
      p_skills,
      p_posted_at,
      v_now,
      v_now,
      'active',
      0,
      p_canonical_url,
      p_apply_url,
      p_original_apply_url,
      p_url_resolution_method,
      p_url_resolution_confidence,
      p_canonical_fingerprint,
      COALESCE(p_source_metadata, '{}'::jsonb),
      v_now,
      v_now
    )
    RETURNING id INTO v_job_id;

    -- Insert corresponding job_sources mapping
    INSERT INTO public.job_sources (
      job_id,
      source_id,
      external_job_id,
      discovery_url,
      source_job_url,
      raw_payload_hash,
      first_seen_at,
      last_seen_at,
      created_at,
      updated_at
    )
    VALUES (
      v_job_id,
      p_source_id,
      p_external_job_id,
      p_discovery_url,
      p_source_job_url,
      p_raw_payload_hash,
      v_now,
      v_now,
      v_now,
      v_now
    )
    RETURNING id INTO v_job_source_id;

    v_status := 'inserted';
  END IF;

  -- Store raw payload audit trail if provided
  IF p_raw_payload IS NOT NULL THEN
    INSERT INTO public.raw_job_payloads (
      source_id,
      external_id,
      payload,
      payload_hash,
      parser_version,
      fetched_at
    )
    VALUES (
      p_source_id,
      p_external_job_id,
      p_raw_payload,
      p_raw_payload_hash,
      p_parser_version,
      v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'job_id', v_job_id,
    'job_source_id', v_job_source_id
  );
END;
$$;

-- RESTRICT EXECUTION: Revoke from PUBLIC, anon, and authenticated; grant ONLY to service_role (worker)
REVOKE EXECUTE ON FUNCTION public.ingest_job_transaction FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ingest_job_transaction FROM anon;
REVOKE EXECUTE ON FUNCTION public.ingest_job_transaction FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_job_transaction TO service_role;
