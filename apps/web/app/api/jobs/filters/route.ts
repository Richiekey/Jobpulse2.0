import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { AuthGuard } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) return authResult.errorResponse;

    const supabase = await createClient();

    // 1. Fetch Taxonomy Hierarchy from job_functions table
    const { data: taxRows, error: taxError } = await supabase
      .from('job_functions')
      .select('slug, name, parent_slug, sort_order')
      .order('sort_order', { ascending: true });

    if (taxError) {
      return ApiResponse.error('Failed to load taxonomy.', taxError, 500);
    }

    // 2. Fetch Aggregated Facet Counts via Server-Side RPC
    // This uses SQL COUNT/GROUP BY in Postgres, eliminating the PostgREST
    // 1,000-row default limit that previously caused truncated/incorrect counts.
    const { data: facets, error: facetsError } = await supabase.rpc('get_job_filter_facets');

    if (facetsError) {
      return ApiResponse.error('Failed to load job filter facets.', facetsError, 500);
    }

    const functionCounts: Record<string, number> = facets?.function_counts || {};
    const platformCounts: Record<string, number> = facets?.platform_counts || {};
    const workplaceCounts: Record<string, number> = facets?.workplace_counts || {};
    const employmentCounts: Record<string, number> = facets?.employment_counts || {};
    const remoteCount: number = facets?.remote_count || 0;
    const totalActiveJobs: number = facets?.total_active_jobs || 0;

    // Organize taxonomy tree with aggregated parent counts
    // Parent count = direct parent matches + sum of all children counts
    const topLevelFunctions = (taxRows || [])
      .filter((r) => !r.parent_slug)
      .map((r) => {
        const subFunctions = (taxRows || [])
          .filter((sub) => sub.parent_slug === r.slug)
          .map((sub) => ({
            slug: sub.slug,
            name: sub.name,
            count: functionCounts[sub.slug] || 0,
          }));

        // Parent count = jobs directly tagged with parent slug + all children
        const directParentCount = functionCounts[r.slug] || 0;
        const childrenTotal = subFunctions.reduce((sum, sub) => sum + sub.count, 0);

        return {
          slug: r.slug,
          name: r.name,
          count: directParentCount + childrenTotal,
          subFunctions,
        };
      });

    // Supported ATS Platforms
    const platforms = [
      { slug: 'greenhouse', name: 'Greenhouse', count: platformCounts['greenhouse'] || 0 },
      { slug: 'lever', name: 'Lever', count: platformCounts['lever'] || 0 },
      { slug: 'ashby', name: 'Ashby', count: platformCounts['ashby'] || 0 },
      { slug: 'workday', name: 'Workday', count: platformCounts['workday'] || 0 },
      { slug: 'smartrecruiters', name: 'SmartRecruiters', count: platformCounts['smartrecruiters'] || 0 },
      { slug: 'icims', name: 'iCIMS', count: platformCounts['icims'] || 0 },
      { slug: 'successfactors', name: 'SAP SuccessFactors', count: platformCounts['successfactors'] || 0 },
      { slug: 'oracle', name: 'Oracle Cloud HCM', count: platformCounts['oracle'] || 0 },
      { slug: 'jobright', name: 'Jobright Aggregator', count: platformCounts['jobright'] || 0 },
    ];

    // Workplace Types
    const workplaceTypes = [
      { slug: 'remote', name: 'Remote', count: workplaceCounts['remote'] || remoteCount },
      { slug: 'hybrid', name: 'Hybrid', count: workplaceCounts['hybrid'] || 0 },
      { slug: 'on_site', name: 'On-site', count: workplaceCounts['on_site'] || 0 },
    ];

    // Employment Types
    const employmentTypes = [
      { slug: 'full_time', name: 'Full-time', count: employmentCounts['full_time'] || 0 },
      { slug: 'contract', name: 'Contract', count: employmentCounts['contract'] || 0 },
      { slug: 'part_time', name: 'Part-time', count: employmentCounts['part_time'] || 0 },
      { slug: 'internship', name: 'Internship', count: employmentCounts['internship'] || 0 },
    ];

    // Top Countries (from RPC, already sorted by count desc)
    const topCountries: Array<{ country: string; count: number }> = facets?.countries || [];

    // Date Presets
    const datePresets = [
      { id: '24h', label: 'Last 24 hours', hours: 24 },
      { id: '3d', label: 'Last 3 days', hours: 72 },
      { id: '7d', label: 'Last 7 days', hours: 168 },
      { id: '14d', label: 'Last 14 days', hours: 336 },
      { id: '30d', label: 'Last 30 days', hours: 720 },
    ];

    return ApiResponse.success({
      total_active_jobs: totalActiveJobs,
      functions: topLevelFunctions,
      platforms,
      workplace_types: workplaceTypes,
      employment_types: employmentTypes,
      countries: topCountries,
      date_presets: datePresets,
    });
  } catch (err) {
    return ApiResponse.error('Failed to load filter metadata.', err, 500);
  }
}
