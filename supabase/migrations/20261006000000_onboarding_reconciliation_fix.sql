-- Create a generic function to onboard or correct company sources

CREATE OR REPLACE FUNCTION public.reconcile_company_source(
    p_normalized_name TEXT,
    p_adapter_name TEXT,
    p_source_identifier TEXT,
    p_source_url TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_company_id UUID;
    v_source_id UUID;
BEGIN
    SELECT id INTO v_company_id FROM public.companies WHERE normalized_name = p_normalized_name LIMIT 1;
    SELECT id INTO v_source_id FROM public.sources WHERE adapter_name = p_adapter_name LIMIT 1;

    IF v_company_id IS NOT NULL AND v_source_id IS NOT NULL THEN
        -- Disable any existing mappings for this company that don't match the new target
        UPDATE public.company_sources 
        SET is_active = false, updated_at = now()
        WHERE company_id = v_company_id 
          AND (source_id != v_source_id OR source_identifier != p_source_identifier);
          
        -- Upsert the correct one
        INSERT INTO public.company_sources (company_id, source_id, source_identifier, source_url, is_active, health_status)
        VALUES (v_company_id, v_source_id, p_source_identifier, p_source_url, true, 'healthy')
        ON CONFLICT (company_id, source_id, source_identifier) DO UPDATE
        SET is_active = true,
            source_url = EXCLUDED.source_url,
            updated_at = now();
    END IF;
END;
$$;

-- Run reconciliation for JobDiva companies to fix any existing stale mappings
SELECT public.reconcile_company_source('artech', 'jobdiva', 'artech', 'https://www.jobdiva.com/portal/?portalid=artech');
SELECT public.reconcile_company_source('cynet systems', 'jobdiva', 'cynetsystems', 'https://www.jobdiva.com/portal/?portalid=cynetsystems');
