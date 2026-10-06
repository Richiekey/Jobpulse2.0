-- ============================================================================
-- Phase 7: Audit & Compensate for Swallowed Migration Errors
-- ============================================================================

-- Check Artech
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.company_sources cs
  JOIN public.companies c ON c.id = cs.company_id
  JOIN public.sources s ON s.id = cs.source_id
  WHERE c.normalized_name = 'artech'
    AND s.adapter_name = 'smartrecruiters'
    AND cs.source_identifier = 'Artech'
    AND cs.is_active = true;

  IF v_count = 0 THEN
    RAISE NOTICE 'Artech smartrecruiters reconciliation missing — compensating';
    BEGIN
      PERFORM public.reconcile_company_source(
        'artech', 'smartrecruiters',
        'Artech',
        'https://jobs.smartrecruiters.com/Artech'
      );
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'RECONCILE_FAILED:%' THEN
        RAISE NOTICE 'Skipped Artech: %', SQLERRM;
      ELSE
        RAISE;
      END IF;
    END;
  END IF;
END $$;

-- Check Cynet
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.company_sources cs
  JOIN public.companies c ON c.id = cs.company_id
  JOIN public.sources s ON s.id = cs.source_id
  WHERE c.normalized_name = 'cynet systems'
    AND s.adapter_name = 'workable'
    AND cs.source_identifier = 'cynet-corp'
    AND cs.is_active = true;

  IF v_count = 0 THEN
    RAISE NOTICE 'Cynet systems workable reconciliation missing — compensating';
    BEGIN
      PERFORM public.reconcile_company_source(
        'cynet systems', 'workable',
        'cynet-corp',
        'https://apply.workable.com/cynet-corp'
      );
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'RECONCILE_FAILED:%' THEN
        RAISE NOTICE 'Skipped Cynet: %', SQLERRM;
      ELSE
        RAISE;
      END IF;
    END;
  END IF;
END $$;

-- Check Salesforce
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.company_sources cs
  JOIN public.companies c ON c.id = cs.company_id
  JOIN public.sources s ON s.id = cs.source_id
  WHERE c.normalized_name = 'salesforce'
    AND s.adapter_name = 'workday'
    AND cs.source_identifier = 'salesforce/wd12/External_Career_Site'
    AND cs.is_active = true;

  IF v_count = 0 THEN
    RAISE NOTICE 'Salesforce workday reconciliation missing — compensating';
    BEGIN
      PERFORM public.reconcile_company_source(
        'salesforce', 'workday',
        'salesforce/wd12/External_Career_Site',
        'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site'
      );
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'RECONCILE_FAILED:%' THEN
        RAISE NOTICE 'Skipped Salesforce: %', SQLERRM;
      ELSE
        RAISE;
      END IF;
    END;
  END IF;
END $$;

-- Check Netflix
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.company_sources cs
  JOIN public.companies c ON c.id = cs.company_id
  JOIN public.sources s ON s.id = cs.source_id
  WHERE c.normalized_name = 'netflix'
    AND s.adapter_name = 'workday'
    AND cs.source_identifier = 'netflix/wd1/Netflix'
    AND cs.is_active = true;

  IF v_count = 0 THEN
    RAISE NOTICE 'Netflix workday reconciliation missing — compensating';
    BEGIN
      PERFORM public.reconcile_company_source(
        'netflix', 'workday',
        'netflix/wd1/Netflix',
        'https://netflix.wd1.myworkdayjobs.com/en-US/Netflix'
      );
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'RECONCILE_FAILED:%' THEN
        RAISE NOTICE 'Skipped Netflix: %', SQLERRM;
      ELSE
        RAISE;
      END IF;
    END;
  END IF;
END $$;

-- Check Amazon
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.company_sources cs
  JOIN public.companies c ON c.id = cs.company_id
  JOIN public.sources s ON s.id = cs.source_id
  WHERE c.normalized_name = 'amazon'
    AND s.adapter_name = 'workday'
    AND cs.source_identifier = 'amazon/wd5/AmazonNew'
    AND cs.is_active = true;

  IF v_count = 0 THEN
    RAISE NOTICE 'Amazon workday reconciliation missing — compensating';
    BEGIN
      PERFORM public.reconcile_company_source(
        'amazon', 'workday',
        'amazon/wd5/AmazonNew',
        'https://amazon.wd5.myworkdayjobs.com/en-US/AmazonNew'
      );
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'RECONCILE_FAILED:%' THEN
        RAISE NOTICE 'Skipped Amazon: %', SQLERRM;
      ELSE
        RAISE;
      END IF;
    END;
  END IF;
END $$;

-- Check Microsoft
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.company_sources cs
  JOIN public.companies c ON c.id = cs.company_id
  JOIN public.sources s ON s.id = cs.source_id
  WHERE c.normalized_name = 'microsoft'
    AND s.adapter_name = 'workday'
    AND cs.source_identifier = 'microsoft/wd5/Global'
    AND cs.is_active = true;

  IF v_count = 0 THEN
    RAISE NOTICE 'Microsoft workday reconciliation missing — compensating';
    BEGIN
      PERFORM public.reconcile_company_source(
        'microsoft', 'workday',
        'microsoft/wd5/Global',
        'https://microsoft.wd5.myworkdayjobs.com/en-US/Global'
      );
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'RECONCILE_FAILED:%' THEN
        RAISE NOTICE 'Skipped Microsoft: %', SQLERRM;
      ELSE
        RAISE;
      END IF;
    END;
  END IF;
END $$;

-- Check IBM
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.company_sources cs
  JOIN public.companies c ON c.id = cs.company_id
  JOIN public.sources s ON s.id = cs.source_id
  WHERE c.normalized_name = 'ibm'
    AND s.adapter_name = 'workday'
    AND cs.source_identifier = 'ibm/wd1/IBM_Careers'
    AND cs.is_active = true;

  IF v_count = 0 THEN
    RAISE NOTICE 'IBM workday reconciliation missing — compensating';
    BEGIN
      PERFORM public.reconcile_company_source(
        'ibm', 'workday',
        'ibm/wd1/IBM_Careers',
        'https://ibm.wd1.myworkdayjobs.com/en-US/IBM_Careers'
      );
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'RECONCILE_FAILED:%' THEN
        RAISE NOTICE 'Skipped IBM: %', SQLERRM;
      ELSE
        RAISE;
      END IF;
    END;
  END IF;
END $$;

-- Check NVIDIA
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.company_sources cs
  JOIN public.companies c ON c.id = cs.company_id
  JOIN public.sources s ON s.id = cs.source_id
  WHERE c.normalized_name = 'nvidia'
    AND s.adapter_name = 'workday'
    AND cs.source_identifier = 'nvidia/wd5/NVIDIAExternalCareerSite'
    AND cs.is_active = true;

  IF v_count = 0 THEN
    RAISE NOTICE 'NVIDIA workday reconciliation missing — compensating';
    BEGIN
      PERFORM public.reconcile_company_source(
        'nvidia', 'workday',
        'nvidia/wd5/NVIDIAExternalCareerSite',
        'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite'
      );
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'RECONCILE_FAILED:%' THEN
        RAISE NOTICE 'Skipped NVIDIA: %', SQLERRM;
      ELSE
        RAISE;
      END IF;
    END;
  END IF;
END $$;

-- Check Visa
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.company_sources cs
  JOIN public.companies c ON c.id = cs.company_id
  JOIN public.sources s ON s.id = cs.source_id
  WHERE c.normalized_name = 'visa'
    AND s.adapter_name = 'workday'
    AND cs.source_identifier = 'visa/wd5/Visa'
    AND cs.is_active = true;

  IF v_count = 0 THEN
    RAISE NOTICE 'Visa workday reconciliation missing — compensating';
    BEGIN
      PERFORM public.reconcile_company_source(
        'visa', 'workday',
        'visa/wd5/Visa',
        'https://visa.wd5.myworkdayjobs.com/en-US/Visa'
      );
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'RECONCILE_FAILED:%' THEN
        RAISE NOTICE 'Skipped Visa: %', SQLERRM;
      ELSE
        RAISE;
      END IF;
    END;
  END IF;
END $$;


-- Audit: Verify Google/Apple/Meta workday sources are disabled
DO $$
DECLARE
  v_active_count INT;
BEGIN
  SELECT COUNT(*) INTO v_active_count
  FROM public.company_sources cs
  JOIN public.companies c ON c.id = cs.company_id
  JOIN public.sources s ON s.id = cs.source_id
  WHERE c.normalized_name IN ('google', 'apple', 'meta')
    AND s.adapter_name = 'workday'
    AND cs.is_active = true;

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'AUDIT FAILED: % Google/Apple/Meta workday sources still active', v_active_count;
  END IF;

  RAISE NOTICE 'AUDIT PASSED: Google/Apple/Meta workday sources correctly disabled';
END $$;
