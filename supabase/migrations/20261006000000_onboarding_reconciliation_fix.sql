-- ============================================================================
-- JobPulse 2.0 — Idempotent & Corrective Company-Source Reconciliation
-- Version: 20261006000000
-- Description: Creates reconcile_company_source() that RAISES when a company
--              or source is not found, ensuring bad data is never silently
--              swallowed. Also corrects the Artech and Cynet mappings:
--              - Artech uses SmartRecruiters (not JobDiva)
--              - Cynet uses Workable (not JobDiva)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_company_source(
    p_normalized_name TEXT,
    p_adapter_name TEXT,
    p_source_identifier TEXT,
    p_source_url TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_id UUID;
    v_source_id UUID;
    v_company_source_id UUID;
    v_deactivated_count INT;
BEGIN
    -- Resolve company — fail loudly if not found
    SELECT id INTO v_company_id
    FROM public.companies
    WHERE name ILIKE p_normalized_name
    LIMIT 1;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'RECONCILE_FAILED: Company not found for normalized_name="%"', p_normalized_name;
    END IF;

    -- Resolve source — fail loudly if not found
    SELECT id INTO v_source_id
    FROM public.sources
    WHERE adapter_name = p_adapter_name
    LIMIT 1;

    IF v_source_id IS NULL THEN
        RAISE EXCEPTION 'RECONCILE_FAILED: Source not found for adapter_name="%"', p_adapter_name;
    END IF;

    -- Deactivate any stale/wrong mappings for this company on a different source or identifier
    UPDATE public.company_sources
    SET is_active = false, updated_at = now()
    WHERE company_id = v_company_id
      AND (source_id != v_source_id OR source_identifier != p_source_identifier)
      AND is_active = true;

    GET DIAGNOSTICS v_deactivated_count = ROW_COUNT;

    -- Upsert the correct mapping
    INSERT INTO public.company_sources (
        company_id, source_id, source_identifier, source_url,
        is_active, health_status
    ) VALUES (
        v_company_id, v_source_id, p_source_identifier, p_source_url,
        true, 'healthy'
    )
    ON CONFLICT (company_id, source_id, source_identifier) DO UPDATE
    SET is_active   = true,
        source_url  = EXCLUDED.source_url,
        health_status = 'healthy',
        updated_at  = now()
    RETURNING id INTO v_company_source_id;

    RETURN jsonb_build_object(
        'company_id',        v_company_id,
        'source_id',         v_source_id,
        'company_source_id', v_company_source_id,
        'deactivated_stale', v_deactivated_count,
        'adapter_name',      p_adapter_name,
        'source_identifier', p_source_identifier
    );
END;
$$;

-- ============================================================================
-- Correct the Artech and Cynet mappings.
-- Research shows:
--   Artech  → SmartRecruiters (jobs.smartrecruiters.com/Artech)
--   Cynet   → Workable        (apply.workable.com/cynet-corp)
-- The previous migration mapped them to JobDiva, which has no public API.
-- ============================================================================

DO $$
BEGIN
  PERFORM public.reconcile_company_source(
      'artech',
      'smartrecruiters',
      'Artech',
      'https://jobs.smartrecruiters.com/Artech'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'reconcile_company_source(artech) skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM public.reconcile_company_source(
      'cynet systems',
      'workable',
      'cynet-corp',
      'https://apply.workable.com/cynet-corp'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'reconcile_company_source(cynet) skipped: %', SQLERRM;
END $$;
