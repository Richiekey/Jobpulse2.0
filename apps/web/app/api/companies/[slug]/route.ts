import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { AuthGuard } from '@/lib/auth-guard';
import { CompanyNormalizer, StaffingDetector } from '@jobpulse/domain';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) return authResult.errorResponse;

    const { slug } = await context.params;
    if (!slug) {
      return ApiResponse.error('Company slug is required.', null, 400);
    }

    const supabase = await createClient();

    // 1. Fetch company by slug
    let { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, normalized_name, slug, domain, website, careers_url, logo_url, description, industry, company_size, verified, is_staffing_agency')
      .eq('slug', slug.toLowerCase())
      .single();

    // If not found by exact slug, try finding by normalized name
    if (!company) {
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name, normalized_name, slug, domain, website, careers_url, logo_url, description, industry, company_size, verified, is_staffing_agency')
        .limit(100);

      const matched = (companies || []).find(
        (c) => CompanyNormalizer.generateSlug(c.name) === slug.toLowerCase() || c.slug === slug.toLowerCase()
      );
      if (matched) {
        company = matched;
      }
    }

    // 2. Query active jobs for this company
    let jobsQuery = supabase
      .from('jobs')
      .select(`
        id,
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
        annualized_min,
        annualized_max,
        has_salary,
        equity_mentioned,
        skills,
        posted_at,
        apply_url,
        canonical_url,
        source:company_sources (
          ats_platform
        )
      `)
      .eq('status', 'active')
      .order('posted_at', { ascending: false });

    if (company?.id) {
      jobsQuery = jobsQuery.eq('company_id', company.id);
    }

    const { data: rawJobs, error: jobsError } = await jobsQuery;
    if (jobsError) {
      return ApiResponse.error('Failed to load company jobs.', jobsError, 500);
    }

    const jobs = (rawJobs || []).map((j: any) => {
      const staffingResult = StaffingDetector.detect(company?.name, j.description);
      return {
        ...j,
        company: company ? { name: company.name, logo_url: company.logo_url } : null,
        ats_platform_slug: j.source?.ats_platform || 'direct',
        is_staffing_agency: Boolean(company?.is_staffing_agency || staffingResult.isStaffingAgency),
      };
    });

    // If company not registered in DB, synthesize display profile from slug
    const displayCompany = company || {
      id: `synthetic-${slug}`,
      name: slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      slug,
      domain: null,
      website: null,
      careersUrl: null,
      logoUrl: null,
      description: null,
      industry: null,
      companySize: null,
      verified: false,
      isStaffingAgency: false,
    };

    return ApiResponse.success(
      {
        company: displayCompany,
        jobs,
        total_active_jobs: jobs.length,
      },
      undefined,
      {
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while fetching company profile.', err, 500);
  }
}
