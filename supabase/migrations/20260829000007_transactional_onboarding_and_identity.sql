-- ============================================================================
-- JobPulse 2.0 — Transactional Company & Source Onboarding & Identity Guarantees
-- Version: 20260829000007
-- Description: Adds verified column to companies, unique index on verified domain,
--              and atomic onboard_company_and_source database RPC.
-- ============================================================================

-- 1. COMPANIES IDENTITY CONSTRAINTS & COLUMNS
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;

-- Verified domains must be unique among verified companies (authoritative identity)
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_verified_domain
    ON public.companies(domain)
    WHERE domain IS NOT NULL AND verified = true;

CREATE INDEX IF NOT EXISTS idx_companies_domain_lookup
    ON public.companies(domain)
    WHERE domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_normalized_name_lookup
    ON public.companies(normalized_name);

-- 2. ATOMIC ONBOARDING DATABASE RPC
-- Performs company resolution/creation and company_sources upsert within a single database transaction.
CREATE OR REPLACE FUNCTION public.onboard_company_and_source(
    p_company_name TEXT,
    p_company_slug TEXT,
    p_company_domain TEXT,
    p_careers_url TEXT,
    p_normalized_name TEXT,
    p_source_id UUID,
    p_source_identifier TEXT,
    p_source_url TEXT,
    p_priority INTEGER DEFAULT 100,
    p_schedule_interval_minutes INTEGER DEFAULT 360,
    p_is_active BOOLEAN DEFAULT true,
    p_health_status health_status_enum DEFAULT 'healthy'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_company_id UUID;
    v_company_slug TEXT;
    v_company_name TEXT;
    v_is_new_company BOOLEAN := false;
    v_company_source_id UUID;
    v_candidate RECORD;
    v_final_slug TEXT;
    v_slug_suffix INT := 2;
BEGIN
    -- 1. Resolve Company Identity
    -- Priority 1: Verified domain match
    IF p_company_domain IS NOT NULL AND p_company_domain <> '' THEN
        SELECT id, slug, name, verified, normalized_name INTO v_candidate
        FROM public.companies
        WHERE domain = p_company_domain AND verified = true
        LIMIT 1;

        IF FOUND THEN
            v_company_id := v_candidate.id;
            v_company_slug := v_candidate.slug;
            v_company_name := v_candidate.name;
        ELSE
            -- Priority 2: Unverified domain match where normalized name matches
            SELECT id, slug, name, verified, normalized_name INTO v_candidate
            FROM public.companies
            WHERE domain = p_company_domain AND normalized_name = p_normalized_name
            LIMIT 1;

            IF FOUND THEN
                v_company_id := v_candidate.id;
                v_company_slug := v_candidate.slug;
                v_company_name := v_candidate.name;
            END IF;
        END IF;
    END IF;

    -- Priority 3: Exact normalized name match when domain is omitted or matches candidate with no domain
    IF v_company_id IS NULL THEN
        SELECT id, slug, name, verified, domain INTO v_candidate
        FROM public.companies
        WHERE normalized_name = p_normalized_name AND (domain IS NULL OR p_company_domain IS NULL)
        LIMIT 1;

        IF FOUND THEN
            v_company_id := v_candidate.id;
            v_company_slug := v_candidate.slug;
            v_company_name := v_candidate.name;
        END IF;
    END IF;

    -- 2. Create Company if not matched
    IF v_company_id IS NULL THEN
        v_final_slug := p_company_slug;
        
        -- Resolve slug uniqueness atomically
        WHILE EXISTS (SELECT 1 FROM public.companies WHERE slug = v_final_slug) LOOP
            v_final_slug := p_company_slug || '-' || v_slug_suffix;
            v_slug_suffix := v_slug_suffix + 1;
        END LOOP;

        INSERT INTO public.companies (
            name,
            slug,
            domain,
            careers_url,
            normalized_name,
            verified,
            status
        ) VALUES (
            p_company_name,
            v_final_slug,
            p_company_domain,
            p_careers_url,
            p_normalized_name,
            false,
            'active'
        )
        RETURNING id, slug, name INTO v_company_id, v_company_slug, v_company_name;

        v_is_new_company := true;
    END IF;

    -- 3. Upsert Company Source
    INSERT INTO public.company_sources (
        company_id,
        source_id,
        source_identifier,
        source_url,
        priority,
        schedule_interval_minutes,
        is_active,
        health_status
    ) VALUES (
        v_company_id,
        p_source_id,
        p_source_identifier,
        p_source_url,
        p_priority,
        p_schedule_interval_minutes,
        p_is_active,
        p_health_status
    )
    ON CONFLICT (company_id, source_id, source_identifier) DO UPDATE
    SET
        priority = EXCLUDED.priority,
        schedule_interval_minutes = EXCLUDED.schedule_interval_minutes,
        is_active = EXCLUDED.is_active,
        source_url = coalesce(EXCLUDED.source_url, public.company_sources.source_url),
        updated_at = now()
    RETURNING id INTO v_company_source_id;

    RETURN jsonb_build_object(
        'company_id', v_company_id,
        'company_slug', v_company_slug,
        'company_name', v_company_name,
        'is_new_company', v_is_new_company,
        'company_source_id', v_company_source_id
    );
END;
$$;
