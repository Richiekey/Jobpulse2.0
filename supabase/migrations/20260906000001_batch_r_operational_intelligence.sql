-- ============================================================================
-- JobPulse 2.0 — Batch R: Operational Intelligence
-- Version: 20260906000001
-- Description:
--   Authoritative system, workforce, source health, and data quality analytics.
--   Enforces multi-tenant authorization, PostgreSQL-side aggregation, and
--   deterministic metric semantics across 24h, 7d, and 30d windows.
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. INDEX OPTIMIZATIONS FOR OPERATIONAL INTELLIGENCE
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jobs_status_scraped_at
  ON public.jobs (status, scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_runs_started_status
  ON public.source_runs (started_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_job_assignments_org_created
  ON public.job_assignments (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignment_events_org_created
  ON public.assignment_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_runs_source_started
  ON public.source_runs (source, started_at DESC);

-- -----------------------------------------------------------------------------
-- 2. OPERATIONAL INTELLIGENCE AGGREGATION RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_operational_intelligence_metrics(
  p_organization_id UUID DEFAULT NULL,
  p_time_range TEXT DEFAULT '24h'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_service_role BOOLEAN := (
    current_user = 'service_role' 
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
  );
  v_is_platform_admin BOOLEAN := false;

  -- Time window intervals
  v_window_interval INTERVAL;
  v_window_start TIMESTAMPTZ;

  -- Metric intermediate records
  v_workforce_metrics JSONB;
  v_job_metrics JSONB;
  v_source_health_metrics JSONB;
  v_data_quality_metrics JSONB;

  -- Workforce intermediate counts
  v_total_workers INT := 0;
  v_active_workers INT := 0;
  v_dispatched INT := 0;
  v_completed_events INT := 0;
  v_started_events INT := 0;
  v_cancelled_events INT := 0;
  v_skipped_events INT := 0;
  v_current_active INT := 0;
  v_overdue_backlog INT := 0;
  v_completion_rate NUMERIC(5,1) := 0.0;
  v_avg_turnaround_hours NUMERIC(6,1) := 0.0;

  v_verif_total INT := 0;
  v_verif_verified INT := 0;
  v_verif_rejected INT := 0;
  v_verif_pending INT := 0;
  v_verif_rate NUMERIC(5,1) := 0.0;

  -- Job inventory intermediate counts
  v_active_jobs INT := 0;
  v_expired_jobs INT := 0;
  v_total_jobs INT := 0;
  v_new_24h INT := 0;
  v_new_7d INT := 0;
  v_new_30d INT := 0;
  v_fresh_jobs INT := 0;
  v_aging_jobs INT := 0;
  v_stale_jobs INT := 0;
  v_critical_jobs INT := 0;
  v_salary_transparency_rate NUMERIC(5,1) := 0.0;
  v_skill_coverage_rate NUMERIC(5,1) := 0.0;
  v_location_specificity_rate NUMERIC(5,1) := 0.0;
  v_direct_apply_rate NUMERIC(5,1) := 0.0;

  -- Source health intermediate counts
  v_total_runs INT := 0;
  v_successful_runs INT := 0;
  v_failed_runs INT := 0;
  v_crawl_success_rate NUMERIC(5,1) := 100.0;
  v_avg_duration_ms INT := 0;
  v_min_duration_ms INT := 0;
  v_max_duration_ms INT := 0;
  v_avg_discovered NUMERIC(8,1) := 0.0;
  v_avg_inserted NUMERIC(8,1) := 0.0;
  v_avg_updated NUMERIC(8,1) := 0.0;
  v_failures_json JSONB := '[]'::jsonb;
  v_healthy_sources INT := 0;
  v_degraded_sources INT := 0;
  v_failing_sources INT := 0;
  v_disabled_sources INT := 0;
  v_total_sources INT := 0;

  -- Data quality intermediate counts
  v_missing_salary INT := 0;
  v_missing_skills INT := 0;
  v_missing_location INT := 0;
  v_missing_description INT := 0;
  v_resolved_count INT := 0;
  v_fallback_count INT := 0;
  v_resolution_rate NUMERIC(5,1) := 0.0;
  v_avg_confidence NUMERIC(3,2) := 0.00;
  v_methods_json JSONB := '{}'::jsonb;
  v_currencies_json JSONB := '{}'::jsonb;
  v_intervals_json JSONB := '{}'::jsonb;
  -- Intermediate counters for quality presence
  v_has_salary INT := 0;
  v_has_skills INT := 0;
  v_has_location INT := 0;
  v_has_description INT := 0;
  v_has_direct_apply INT := 0;
BEGIN
  -- ---------------------------------------------------------------------------
  -- A. AUTHORIZATION GATE (R-P0-05)
  -- ---------------------------------------------------------------------------
  IF NOT v_is_service_role THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Authentication required.';
    END IF;

    v_is_platform_admin := public.is_admin();

    IF p_organization_id IS NULL THEN
      IF NOT v_is_platform_admin THEN
        RAISE EXCEPTION 'FORBIDDEN: Global operational intelligence requires platform administrator privileges.';
      END IF;
    ELSE
      IF NOT (v_is_platform_admin OR public.is_org_admin(p_organization_id, v_caller_id)) THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative privileges required for organization %.', p_organization_id;
      END IF;
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- B. TIME-RANGE VALIDATION & BOUNDARY COMPUTATION
  -- ---------------------------------------------------------------------------
  IF p_time_range NOT IN ('24h', '7d', '30d') THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Unsupported time range %. Supported ranges: 24h, 7d, 30d.', p_time_range;
  END IF;

  v_window_interval := CASE p_time_range
    WHEN '24h' THEN INTERVAL '24 hours'
    WHEN '7d' THEN INTERVAL '7 days'
    WHEN '30d' THEN INTERVAL '30 days'
  END;
  v_window_start := now() - v_window_interval;

  -- ---------------------------------------------------------------------------
  -- MODULE 1: WORKFORCE INTELLIGENCE
  -- ---------------------------------------------------------------------------
  -- 1.1 Roster: Total enrolled workers & Active workers in window
  IF p_organization_id IS NOT NULL THEN
    SELECT count(*)::int INTO v_total_workers
    FROM public.organization_members
    WHERE organization_id = p_organization_id AND role = 'worker';

    SELECT count(DISTINCT m.user_id)::int INTO v_active_workers
    FROM public.organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.role = 'worker'
      AND (
        EXISTS (
          SELECT 1 FROM public.job_assignments ja
          WHERE ja.organization_id = p_organization_id
            AND ja.worker_id = m.user_id
            AND ja.status IN ('assigned', 'in_progress')
        )
        OR EXISTS (
          SELECT 1 FROM public.assignment_events ae
          WHERE ae.organization_id = p_organization_id
            AND ae.worker_id = m.user_id
            AND ae.created_at >= v_window_start
        )
      );
  ELSE
    SELECT count(*)::int INTO v_total_workers
    FROM public.organization_members
    WHERE role = 'worker';

    SELECT count(DISTINCT m.user_id)::int INTO v_active_workers
    FROM public.organization_members m
    WHERE m.role = 'worker'
      AND (
        EXISTS (
          SELECT 1 FROM public.job_assignments ja
          WHERE ja.worker_id = m.user_id
            AND ja.status IN ('assigned', 'in_progress')
        )
        OR EXISTS (
          SELECT 1 FROM public.assignment_events ae
          WHERE ae.worker_id = m.user_id
            AND ae.created_at >= v_window_start
        )
      );
  END IF;

  -- 1.2 Assignment Velocity (events occurring within selected window)
  SELECT
    count(*) FILTER (WHERE ae.event_type = 'completed')::int,
    count(*) FILTER (WHERE ae.event_type = 'started')::int,
    count(*) FILTER (WHERE ae.event_type = 'cancelled')::int,
    count(*) FILTER (WHERE ae.event_type = 'skipped')::int
  INTO
    v_completed_events,
    v_started_events,
    v_cancelled_events,
    v_skipped_events
  FROM public.assignment_events ae
  WHERE (p_organization_id IS NULL OR ae.organization_id = p_organization_id)
    AND ae.created_at >= v_window_start;

  -- Dispatched assignments within window
  SELECT count(*)::int INTO v_dispatched
  FROM public.job_assignments ja
  WHERE (p_organization_id IS NULL OR ja.organization_id = p_organization_id)
    AND ja.created_at >= v_window_start;

  -- Completion rate: completed / (completed + cancelled + skipped) * 100
  IF (v_completed_events + v_cancelled_events + v_skipped_events) > 0 THEN
    v_completion_rate := round(
      (v_completed_events::numeric / (v_completed_events + v_cancelled_events + v_skipped_events)::numeric) * 100.0,
      1
    );
  ELSE
    v_completion_rate := 0.0;
  END IF;

  -- Current active and overdue backlog
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE deadline_at IS NOT NULL AND deadline_at < now())::int
  INTO
    v_current_active,
    v_overdue_backlog
  FROM public.job_assignments ja
  WHERE (p_organization_id IS NULL OR ja.organization_id = p_organization_id)
    AND ja.status IN ('assigned', 'in_progress');

  -- Average turnaround time in hours (from dispatch to completion for completed events in window)
  SELECT coalesce(
    round(avg(EXTRACT(EPOCH FROM (ae.created_at - ja.created_at)) / 3600.0)::numeric, 1),
    0.0
  ) INTO v_avg_turnaround_hours
  FROM public.assignment_events ae
  JOIN public.job_assignments ja ON ja.id = ae.assignment_id
  WHERE (p_organization_id IS NULL OR ae.organization_id = p_organization_id)
    AND ae.event_type = 'completed'
    AND ae.created_at >= v_window_start
    AND ae.created_at >= ja.created_at;

  -- 1.3 Application Verifications in window
  SELECT
    count(*) FILTER (WHERE status = 'verified' AND reviewed_at >= v_window_start)::int,
    count(*) FILTER (WHERE status = 'rejected' AND reviewed_at >= v_window_start)::int,
    count(*) FILTER (WHERE status = 'pending')::int
  INTO
    v_verif_verified,
    v_verif_rejected,
    v_verif_pending
  FROM public.application_verifications av
  WHERE (p_organization_id IS NULL OR av.organization_id = p_organization_id);

  v_verif_total := v_verif_verified + v_verif_rejected + v_verif_pending;
  IF (v_verif_verified + v_verif_rejected) > 0 THEN
    v_verif_rate := round(
      (v_verif_verified::numeric / (v_verif_verified + v_verif_rejected)::numeric) * 100.0,
      1
    );
  ELSE
    v_verif_rate := 0.0;
  END IF;

  v_workforce_metrics := jsonb_build_object(
    'roster', jsonb_build_object(
      'totalWorkers', v_total_workers,
      'activeWorkers', v_active_workers
    ),
    'velocity', jsonb_build_object(
      'dispatched', v_dispatched,
      'completed', v_completed_events,
      'inProgress', v_started_events,
      'cancelled', v_cancelled_events,
      'skipped', v_skipped_events
    ),
    'completionRatePercent', v_completion_rate,
    'currentActive', v_current_active,
    'overdueBacklog', v_overdue_backlog,
    'verifications', jsonb_build_object(
      'total', v_verif_total,
      'verified', v_verif_verified,
      'rejected', v_verif_rejected,
      'pending', v_verif_pending,
      'verificationRatePercent', v_verif_rate
    ),
    'avgTurnaroundHours', v_avg_turnaround_hours
  );

  -- ---------------------------------------------------------------------------
  -- COMBINED MODULE 2 & 4: AUTHORITATIVE JOBS DATA SCAN
  -- Performs a single pass over public.jobs for inventory, freshness, and quality
  -- ---------------------------------------------------------------------------
  SELECT
    count(*) FILTER (WHERE lower(status::text) = 'active')::int,
    count(*) FILTER (WHERE lower(status::text) != 'active')::int,
    count(*)::int,
    count(*) FILTER (WHERE created_at >= now() - INTERVAL '24 hours')::int,
    count(*) FILTER (WHERE created_at >= now() - INTERVAL '7 days')::int,
    count(*) FILTER (WHERE created_at >= now() - INTERVAL '30 days')::int,
    -- Freshness buckets on active jobs (deterministic boundary conditions based on scraped_at)
    count(*) FILTER (WHERE lower(status::text) = 'active' AND scraped_at >= now() - INTERVAL '3 days')::int,
    count(*) FILTER (WHERE lower(status::text) = 'active' AND scraped_at < now() - INTERVAL '3 days' AND scraped_at >= now() - INTERVAL '7 days')::int,
    count(*) FILTER (WHERE lower(status::text) = 'active' AND scraped_at < now() - INTERVAL '7 days' AND scraped_at >= now() - INTERVAL '14 days')::int,
    count(*) FILTER (WHERE lower(status::text) = 'active' AND (scraped_at < now() - INTERVAL '14 days' OR scraped_at IS NULL))::int,
    -- Quality presence on active jobs
    count(*) FILTER (WHERE lower(status::text) = 'active' AND (salary_min IS NOT NULL OR salary_max IS NOT NULL))::int,
    count(*) FILTER (WHERE lower(status::text) = 'active' AND skills IS NOT NULL AND cardinality(skills) > 0)::int,
    count(*) FILTER (WHERE lower(status::text) = 'active' AND locations IS NOT NULL AND locations != '[]'::jsonb AND locations != 'null'::jsonb)::int,
    count(*) FILTER (WHERE lower(status::text) = 'active' AND description IS NOT NULL AND description != '')::int,
    count(*) FILTER (WHERE lower(status::text) = 'active' AND apply_url IS NOT NULL AND apply_url != '')::int,
    -- ATS resolution audit on active jobs
    count(*) FILTER (WHERE lower(status::text) = 'active' AND apply_url IS NOT NULL AND apply_url != '' AND (apply_url_original IS NULL OR apply_url != apply_url_original OR upper(source::text) != 'UNKNOWN'))::int,
    count(*) FILTER (WHERE lower(status::text) = 'active' AND (apply_url IS NULL OR apply_url = '' OR (apply_url_original IS NOT NULL AND apply_url = apply_url_original AND upper(source::text) = 'UNKNOWN')))::int,
    coalesce(round(avg(CASE
      WHEN upper(source::text) IN ('GREENHOUSE', 'LEVER', 'ASHBY', 'WORKABLE', 'RECRUITEE', 'TEAMTAILOR', 'SMARTRECRUITERS', 'BAMBOOHR', 'ICIMS', 'WORKDAY') THEN 1.00
      WHEN apply_url IS NOT NULL AND apply_url != '' THEN 0.90
      ELSE 0.40
    END) FILTER (WHERE lower(status::text) = 'active')::numeric, 2), 0.00)
  INTO
    v_active_jobs,
    v_expired_jobs,
    v_total_jobs,
    v_new_24h,
    v_new_7d,
    v_new_30d,
    v_fresh_jobs,
    v_aging_jobs,
    v_stale_jobs,
    v_critical_jobs,
    v_has_salary,
    v_has_skills,
    v_has_location,
    v_has_description,
    v_has_direct_apply,
    v_resolved_count,
    v_fallback_count,
    v_avg_confidence
  FROM public.jobs;

  -- Derive quality percentages and missing counts
  IF v_active_jobs > 0 THEN
    v_salary_transparency_rate := round((v_has_salary::numeric / v_active_jobs::numeric) * 100.0, 1);
    v_skill_coverage_rate := round((v_has_skills::numeric / v_active_jobs::numeric) * 100.0, 1);
    v_location_specificity_rate := round((v_has_location::numeric / v_active_jobs::numeric) * 100.0, 1);
    v_direct_apply_rate := round((v_has_direct_apply::numeric / v_active_jobs::numeric) * 100.0, 1);
    v_resolution_rate := round((v_resolved_count::numeric / v_active_jobs::numeric) * 100.0, 1);
  ELSE
    v_salary_transparency_rate := 0.0;
    v_skill_coverage_rate := 0.0;
    v_location_specificity_rate := 0.0;
    v_direct_apply_rate := 0.0;
    v_resolution_rate := 0.0;
  END IF;

  v_missing_salary := v_active_jobs - v_has_salary;
  v_missing_skills := v_active_jobs - v_has_skills;
  v_missing_location := v_active_jobs - v_has_location;
  v_missing_description := v_active_jobs - v_has_description;

  v_job_metrics := jsonb_build_object(
    'inventory', jsonb_build_object(
      'activeJobs', v_active_jobs,
      'expiredJobs', v_expired_jobs,
      'totalJobs', v_total_jobs
    ),
    'ingestionVelocity', jsonb_build_object(
      'new24h', v_new_24h,
      'new7d', v_new_7d,
      'new30d', v_new_30d
    ),
    'freshness', jsonb_build_object(
      'fresh', v_fresh_jobs,
      'aging', v_aging_jobs,
      'stale', v_stale_jobs,
      'critical', v_critical_jobs
    ),
    'quality', jsonb_build_object(
      'salaryTransparencyPercent', v_salary_transparency_rate,
      'skillCoveragePercent', v_skill_coverage_rate,
      'locationSpecificityPercent', v_location_specificity_rate,
      'directApplyCoveragePercent', v_direct_apply_rate
    )
  );

  -- ---------------------------------------------------------------------------
  -- MODULE 3: SOURCE HEALTH & INGESTION
  -- ---------------------------------------------------------------------------
  -- Source runs within selected window
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE status = 'SUCCESS')::int,
    count(*) FILTER (WHERE status = 'FAILED')::int,
    CASE WHEN count(*) > 0
      THEN round((count(*) FILTER (WHERE status = 'SUCCESS')::numeric / count(*)::numeric) * 100.0, 1)
      ELSE 100.0
    END,
    CASE WHEN count(*) > 0 THEN round(sum(jobs_found)::numeric / count(*)::numeric, 1) ELSE 0.0 END,
    CASE WHEN count(*) > 0 THEN round(sum(jobs_inserted)::numeric / count(*)::numeric, 1) ELSE 0.0 END,
    CASE WHEN count(*) > 0 THEN round(sum(jobs_updated)::numeric / count(*)::numeric, 1) ELSE 0.0 END,
    coalesce(round(avg(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) FILTER (WHERE completed_at >= started_at))::int, 0),
    coalesce(min(round(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::int) FILTER (WHERE completed_at >= started_at), 0),
    coalesce(max(round(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::int) FILTER (WHERE completed_at >= started_at), 0)
  INTO
    v_total_runs,
    v_successful_runs,
    v_failed_runs,
    v_crawl_success_rate,
    v_avg_discovered,
    v_avg_inserted,
    v_avg_updated,
    v_avg_duration_ms,
    v_min_duration_ms,
    v_max_duration_ms
  FROM public.source_runs
  WHERE started_at >= v_window_start;

  -- Failure taxonomy: authoritative error messages from failed runs in window
  SELECT coalesce(jsonb_agg(f), '[]'::jsonb) INTO v_failures_json
  FROM (
    SELECT
      coalesce(nullif(trim(error_message), ''), 'Crawl error') AS category,
      count(*)::int AS count
    FROM public.source_runs
    WHERE status = 'FAILED' AND started_at >= v_window_start
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 5
  ) f;

  -- Source health distribution across distinct crawler sources (Fast group-by without expensive sorting)
  WITH source_health_summary AS (
    SELECT
      sr.source,
      max(sr.started_at) AS last_run,
      max(sr.started_at) FILTER (WHERE sr.status = 'SUCCESS') AS last_success
    FROM public.source_runs sr
    GROUP BY sr.source
  )
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE last_success >= now() - INTERVAL '24 hours')::int,
    count(*) FILTER (WHERE last_success >= now() - INTERVAL '7 days' AND (last_success < now() - INTERVAL '24 hours' OR last_success IS NULL))::int,
    count(*) FILTER (WHERE (last_success < now() - INTERVAL '7 days' OR last_success IS NULL))::int
  INTO
    v_total_sources,
    v_healthy_sources,
    v_degraded_sources,
    v_failing_sources
  FROM source_health_summary;

  -- Count disabled companies/sources
  SELECT count(*)::int INTO v_disabled_sources
  FROM public.companies
  WHERE active = false;

  v_source_health_metrics := jsonb_build_object(
    'reliability', jsonb_build_object(
      'totalRuns', v_total_runs,
      'successfulRuns', v_successful_runs,
      'failedRuns', v_failed_runs,
      'successRatePercent', v_crawl_success_rate
    ),
    'distribution', jsonb_build_object(
      'healthy', v_healthy_sources,
      'degraded', v_degraded_sources,
      'failing', v_failing_sources,
      'disabled', v_disabled_sources,
      'total', v_total_sources + v_disabled_sources
    ),
    'executionPerformance', jsonb_build_object(
      'avgDurationMs', v_avg_duration_ms,
      'minDurationMs', v_min_duration_ms,
      'maxDurationMs', v_max_duration_ms
    ),
    'yield', jsonb_build_object(
      'avgDiscovered', v_avg_discovered,
      'avgInserted', v_avg_inserted,
      'avgUpdated', v_avg_updated
    ),
    'failureTaxonomy', v_failures_json
  );

  -- ---------------------------------------------------------------------------
  -- MODULE 4: BREAKDOWNS (METHODS, CURRENCIES, INTERVALS)
  -- ---------------------------------------------------------------------------
  -- Method breakdown (grouped by source adapter type)
  SELECT coalesce(jsonb_object_agg(m.method, m.count), '{}'::jsonb) INTO v_methods_json
  FROM (
    SELECT upper(source::text) AS method, count(*)::int AS count
    FROM public.jobs
    WHERE lower(status::text) = 'active' AND source IS NOT NULL
    GROUP BY upper(source::text)
    ORDER BY count DESC
    LIMIT 10
  ) m;

  -- Currency breakdown
  SELECT coalesce(jsonb_object_agg(c.currency, c.count), '{}'::jsonb) INTO v_currencies_json
  FROM (
    SELECT salary_currency AS currency, count(*)::int AS count
    FROM public.jobs
    WHERE lower(status::text) = 'active' AND salary_currency IS NOT NULL
    GROUP BY salary_currency
    ORDER BY count DESC
    LIMIT 10
  ) c;

  -- Interval breakdown
  SELECT coalesce(jsonb_object_agg(i.interval_type, i.count), '{}'::jsonb) INTO v_intervals_json
  FROM (
    SELECT salary_period AS interval_type, count(*)::int AS count
    FROM public.jobs
    WHERE lower(status::text) = 'active' AND salary_period IS NOT NULL
    GROUP BY salary_period
    ORDER BY count DESC
  ) i;

  v_data_quality_metrics := jsonb_build_object(
    'auditedActiveJobs', v_active_jobs,
    'missingFields', jsonb_build_object(
      'missingSalary', v_missing_salary,
      'missingSkills', v_missing_skills,
      'missingLocation', v_missing_location,
      'missingDescription', v_missing_description
    ),
    'atsResolution', jsonb_build_object(
      'resolvedCount', v_resolved_count,
      'fallbackCount', v_fallback_count,
      'resolutionRatePercent', v_resolution_rate,
      'avgConfidence', v_avg_confidence,
      'methods', v_methods_json
    ),
    'compensation', jsonb_build_object(
      'currencies', v_currencies_json,
      'intervals', v_intervals_json
    )
  );

  -- ---------------------------------------------------------------------------
  -- E. FINAL AGGREGATE DOCUMENT
  -- ---------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'timeRange', p_time_range,
    'windowStart', v_window_start,
    'organizationId', p_organization_id,
    'workforce', v_workforce_metrics,
    'jobs', v_job_metrics,
    'sourceHealth', v_source_health_metrics,
    'dataQuality', v_data_quality_metrics
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. FUNCTION PRIVILEGES (R-P0-06)
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_operational_intelligence_metrics FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_operational_intelligence_metrics TO authenticated, service_role;
