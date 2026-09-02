import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Fetch Taxonomy Hierarchy from job_functions table
    const { data: taxRows, error: taxError } = await supabase
      .from('job_functions')
      .select('slug, name, parent_slug, display_order')
      .order('display_order', { ascending: true });

    if (taxError) {
      return ApiResponse.error('Failed to load taxonomy.', taxError, 500);
    }

    // 2. Fetch Aggregated Statistics for Functions, Platforms, Locations, Workplace, Employment
    const { data: jobStats, error: statsError } = await supabase
      .from('jobs')
      .select('ats_platform_slug, job_function_slug, workplace_type, employment_type, location_country, is_remote')
      .eq('status', 'active');

    if (statsError) {
      return ApiResponse.error('Failed to load job filter facets.', statsError, 500);
    }

    const functionCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};
    const workplaceCounts: Record<string, number> = {};
    const employmentCounts: Record<string, number> = {};
    const countryCounts: Record<string, number> = {};
    let remoteCount = 0;

    for (const job of jobStats || []) {
      if (job.job_function_slug) {
        functionCounts[job.job_function_slug] = (functionCounts[job.job_function_slug] || 0) + 1;
      }
      if (job.ats_platform_slug) {
        platformCounts[job.ats_platform_slug] = (platformCounts[job.ats_platform_slug] || 0) + 1;
      }
      if (job.workplace_type) {
        workplaceCounts[job.workplace_type] = (workplaceCounts[job.workplace_type] || 0) + 1;
      }
      if (job.employment_type) {
        employmentCounts[job.employment_type] = (employmentCounts[job.employment_type] || 0) + 1;
      }
      if (job.location_country) {
        countryCounts[job.location_country] = (countryCounts[job.location_country] || 0) + 1;
      }
      if (job.is_remote) {
        remoteCount++;
      }
    }

    // Organize taxonomy tree
    const topLevelFunctions = (taxRows || [])
      .filter((r) => !r.parent_slug)
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        count: functionCounts[r.slug] || 0,
        subFunctions: (taxRows || [])
          .filter((sub) => sub.parent_slug === r.slug)
          .map((sub) => ({
            slug: sub.slug,
            name: sub.name,
            count: functionCounts[sub.slug] || 0,
          })),
      }));

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

    // Top Countries
    const topCountries = Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([country, count]) => ({ country, count }));

    // Date Presets
    const datePresets = [
      { id: '24h', label: 'Last 24 hours', hours: 24 },
      { id: '3d', label: 'Last 3 days', hours: 72 },
      { id: '7d', label: 'Last 7 days', hours: 168 },
      { id: '14d', label: 'Last 14 days', hours: 336 },
      { id: '30d', label: 'Last 30 days', hours: 720 },
    ];

    return ApiResponse.success({
      total_active_jobs: jobStats?.length || 0,
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
