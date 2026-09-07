import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { AuthGuard } from '@/lib/auth-guard';
import { resolveJobrightDetail, resolveOriginalJobUrl } from '@jobpulse/ats';
import { URLResolver } from '@jobpulse/url-resolution';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) return authResult.errorResponse;

    const { id } = await params;

    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return ApiResponse.error('Invalid job ID: Must be a valid UUID.', null, 400);
    }

    const supabase = await createClient();

    const { data: job, error } = await supabase
      .from('jobs')
      .select(`
        *,
        companies:company_id (
          id,
          name,
          website,
          logo_url,
          industry
        ),
        job_sources (
          id,
          source_id,
          external_job_id,
          source_job_url,
          first_seen_at
        )
      `)
      .eq('id', id)
      .single();

    if (error || !job) {
      return ApiResponse.error('Job posting not found.', error, 404);
    }

    // On-demand enrichment: if this is a Jobright job needing direct ATS URL or clean title
    const isJobright =
      job.ats_platform_slug === 'jobright' ||
      job.apply_url?.includes('jobright.ai') ||
      job.canonical_url?.includes('jobright.ai') ||
      (job.source_metadata as any)?.originalSource === 'jobright_github_markdown';

    const hasMalformedTitle =
      job.display_title?.includes('](') ||
      job.display_title?.endsWith(']') ||
      job.display_title?.length <= 2;

    const isCompanyHomepageApply =
      job.apply_url &&
      (job.apply_url.replace(/\/$/, '') === (job.companies?.website || '').replace(/\/$/, '') ||
       job.apply_url.replace(/\/$/, '') === ((job.source_metadata as any)?.companyWebsite || '').replace(/\/$/, ''));

    const needsEnrichment =
      isJobright &&
      (hasMalformedTitle ||
       isCompanyHomepageApply ||
       !job.apply_url ||
       job.apply_url.includes('jobright.ai') ||
       job.ats_platform_slug === 'jobright');

    if (needsEnrichment) {
      const externalIdMatch =
        job.apply_url?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/) ||
        job.canonical_url?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/) ||
        job.source_job_url?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/) ||
        (job.locations && job.locations[0]?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/));
      const externalJobId =
        externalIdMatch?.[1] ||
        (job.job_sources as any)?.[0]?.external_job_id;

      if (externalJobId) {
        try {
          const detail = await resolveJobrightDetail(externalJobId);
          if (detail) {
            const directUrl = detail.directUrl;
            const isDirectAts = directUrl ? URLResolver.isDirectAtsUrl(directUrl) : false;
            const detectedSlug = directUrl
              ? (isDirectAts
                  ? (directUrl.includes('myworkdayjobs.com') ? 'workday'
                    : directUrl.includes('greenhouse.io') ? 'greenhouse'
                    : directUrl.includes('lever.co') ? 'lever'
                    : directUrl.includes('ashbyhq.com') ? 'ashby'
                    : directUrl.includes('bamboohr.com') ? 'bamboohr'
                    : directUrl.includes('icims.com') ? 'icims'
                    : directUrl.includes('smartrecruiters.com') ? 'smartrecruiters'
                    : 'direct')
                  : 'direct')
              : job.ats_platform_slug;

            const currentJobrightRef = job.apply_url?.includes('jobright.ai')
              ? job.apply_url
              : `https://jobright.ai/jobs/info/${externalJobId}`;

            const updateFields: Record<string, any> = {
              source_metadata: {
                ...((job.source_metadata as any) || {}),
                jobright_reference_url: currentJobrightRef,
                enrichment_status: 'enriched',
                enriched_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            };

            if (directUrl) {
              updateFields.apply_url = directUrl;
              updateFields.original_apply_url = directUrl;
              updateFields.canonical_url = directUrl;
              updateFields.ats_platform_slug = detectedSlug;
              updateFields.url_resolution_method = isDirectAts ? 'direct_ats' : 'employer_application';
              updateFields.url_resolution_confidence = isDirectAts ? 0.95 : 0.85;

              job.apply_url = directUrl;
              job.original_apply_url = directUrl;
              job.canonical_url = directUrl;
              job.ats_platform_slug = detectedSlug;
            }

            if (detail.cleanTitle) {
              updateFields.canonical_title = detail.cleanTitle;
              updateFields.display_title = detail.cleanTitle;

              job.canonical_title = detail.cleanTitle;
              job.display_title = detail.cleanTitle;
            }

            if (detail.companyName && job.companies?.name?.startsWith('[')) {
              await supabase
                .from('companies')
                .update({ name: detail.companyName })
                .eq('id', job.company_id);
              if (job.companies) job.companies.name = detail.companyName;
            }

            await supabase
              .from('jobs')
              .update(updateFields)
              .eq('id', job.id);

            job.source_metadata = updateFields.source_metadata;
          }
        } catch (enrichErr) {
          console.warn('[Jobright OnDemand] Failed to enrich on the fly:', enrichErr);
        }
      }
    }

    return ApiResponse.success(job);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred.', err, 500);
  }
}
