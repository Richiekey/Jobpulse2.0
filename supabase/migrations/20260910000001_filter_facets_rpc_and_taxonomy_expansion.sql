-- =============================================================================
-- Migration: Filter Facets RPC & Taxonomy Expansion Helper
-- =============================================================================
-- Purpose:
--   1. Create get_job_filter_facets() RPC that computes accurate filter counts
--      using SQL aggregation (COUNT/GROUP BY) instead of fetching individual rows.
--      This eliminates the PostgREST 1,000-row default limit that was causing
--      incorrect/truncated filter counts on the frontend.
--
--   2. Create expand_function_slugs() helper that recursively expands parent
--      function slugs into parent + all children, enabling hierarchical
--      taxonomy filtering in the feed endpoint.
--
-- Safety:
--   - Pure additive migration (CREATE OR REPLACE FUNCTION)
--   - No schema changes to existing tables
--   - Functions are SECURITY DEFINER with search_path locked
--   - Only authenticated users can call (GRANT to authenticated)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. get_job_filter_facets — Server-side facet aggregation
-- ---------------------------------------------------------------------------
-- Returns a single JSONB object with facet counts for all filter dimensions.
-- All counts are computed from the `jobs` table where status='active' and
-- posted_at is within the last 30 days (matching the feed's hard invariant).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_job_filter_facets()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  cutoff TIMESTAMPTZ := NOW() - INTERVAL '30 days';
  total_count BIGINT;
  fn_counts JSONB;
  platform_counts JSONB;
  workplace_counts JSONB;
  employment_counts JSONB;
  country_counts JSONB;
  remote_count BIGINT;
BEGIN
  -- Total active jobs in window
  SELECT COUNT(*) INTO total_count
  FROM jobs
  WHERE status = 'active'
    AND posted_at >= cutoff;

  -- Job function slug counts
  SELECT COALESCE(jsonb_object_agg(slug, cnt), '{}'::jsonb) INTO fn_counts
  FROM (
    SELECT job_function_slug AS slug, COUNT(*) AS cnt
    FROM jobs
    WHERE status = 'active'
      AND posted_at >= cutoff
      AND job_function_slug IS NOT NULL
    GROUP BY job_function_slug
  ) sub;

  -- ATS platform slug counts
  SELECT COALESCE(jsonb_object_agg(slug, cnt), '{}'::jsonb) INTO platform_counts
  FROM (
    SELECT ats_platform_slug AS slug, COUNT(*) AS cnt
    FROM jobs
    WHERE status = 'active'
      AND posted_at >= cutoff
      AND ats_platform_slug IS NOT NULL
    GROUP BY ats_platform_slug
  ) sub;

  -- Workplace type counts
  SELECT COALESCE(jsonb_object_agg(wt, cnt), '{}'::jsonb) INTO workplace_counts
  FROM (
    SELECT workplace_type AS wt, COUNT(*) AS cnt
    FROM jobs
    WHERE status = 'active'
      AND posted_at >= cutoff
      AND workplace_type IS NOT NULL
    GROUP BY workplace_type
  ) sub;

  -- Employment type counts
  SELECT COALESCE(jsonb_object_agg(et, cnt), '{}'::jsonb) INTO employment_counts
  FROM (
    SELECT employment_type AS et, COUNT(*) AS cnt
    FROM jobs
    WHERE status = 'active'
      AND posted_at >= cutoff
      AND employment_type IS NOT NULL
    GROUP BY employment_type
  ) sub;

  -- Country counts (top 20 by volume)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('country', c, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
  INTO country_counts
  FROM (
    SELECT location_country AS c, COUNT(*) AS cnt
    FROM jobs
    WHERE status = 'active'
      AND posted_at >= cutoff
      AND location_country IS NOT NULL
    GROUP BY location_country
    ORDER BY cnt DESC
    LIMIT 20
  ) sub;

  -- Remote count
  SELECT COUNT(*) INTO remote_count
  FROM jobs
  WHERE status = 'active'
    AND posted_at >= cutoff
    AND is_remote = TRUE;

  -- Assemble result
  result := jsonb_build_object(
    'total_active_jobs', total_count,
    'function_counts', fn_counts,
    'platform_counts', platform_counts,
    'workplace_counts', workplace_counts,
    'employment_counts', employment_counts,
    'countries', country_counts,
    'remote_count', remote_count
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_job_filter_facets IS
  'Returns aggregated facet counts for all job filter dimensions. '
  'Uses SQL GROUP BY to avoid PostgREST row-limit truncation.';

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION public.get_job_filter_facets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_job_filter_facets() TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. expand_function_slugs — Taxonomy hierarchy expansion
-- ---------------------------------------------------------------------------
-- Given an array of function slugs, returns the expanded array that includes
-- the original slugs PLUS any child slugs for parent-level categories.
-- Example: ARRAY['data-ai-ml'] -> ['data-ai-ml','data-science','data-engineering',
--           'data-ml','data-ai-engineering','data-analytics','data-research']
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expand_function_slugs(input_slugs TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expanded TEXT[];
BEGIN
  -- Start with the input slugs
  expanded := input_slugs;

  -- Add all children of any parent slugs in the input
  SELECT ARRAY(
    SELECT DISTINCT unnest FROM (
      -- Original slugs
      SELECT unnest(input_slugs)
      UNION
      -- Children of any slug that is a parent
      SELECT jf.slug
      FROM job_functions jf
      WHERE jf.parent_slug = ANY(input_slugs)
        AND jf.is_active = TRUE
    ) combined
  ) INTO expanded;

  RETURN expanded;
END;
$$;

COMMENT ON FUNCTION public.expand_function_slugs IS
  'Expands an array of job function slugs to include child sub-function slugs. '
  'Used for hierarchical taxonomy filtering: selecting a parent includes all children.';

REVOKE ALL ON FUNCTION public.expand_function_slugs(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expand_function_slugs(TEXT[]) TO authenticated;
