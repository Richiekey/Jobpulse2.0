import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { AuthGuard } from '@/lib/auth-guard';
import { resolveOriginalJobUrl } from '@jobpulse/ats';
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
        companies (
          id,
          name,
          normalized_name,
          logo_url,
          website,
          careers_url,
          industry
        ),
        job_sources (
          id,
          source_id,
          discovery_url,
          source_job_url,
          first_seen_at,
          last_seen_at,
          sources (
            id,
            name,
            adapter_name,
            domain
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error || !job) {
      return ApiResponse.error('Job posting not found.', error, 404);
    }

    // On-demand enrichment: if this is a Jobright job and direct ATS URL has not yet been resolved
    const isJobright =
      job.ats_platform_slug === 'jobright' ||
      job.apply_url?.includes('jobright.ai') ||
      (job.source_metadata as any)?.originalSource === 'jobright_github_markdown';

    const needsEnrichment =
      isJobright &&
      (!job.apply_url || job.apply_url.includes('jobright.ai')) &&
      (job.source_metadata as any)?.enrichment_status !== 'enriched';

    if (needsEnrichment) {
      const externalIdMatch =
        job.apply_url?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/) ||
        job.canonical_url?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/);
      const externalJobId =
        externalIdMatch?.[1] ||
        (job.job_sources as any)?.[0]?.external_job_id;

      if (externalJobId) {
        try {
          const directUrl = await resolveOriginalJobUrl(externalJobId);
          if (directUrl) {
            const isDirectAts = URLResolver.isDirectAtsUrl(directUrl);
            const detectedSlug = isDirectAts
              ? (directUrl.includes('myworkdayjobs.com') ? 'workday'
                : directUrl.includes('greenhouse.io') ? 'greenhouse'
                : directUrl.includes('lever.co') ? 'lever'
                : directUrl.includes('ashbyhq.com') ? 'ashby'
                : directUrl.includes('icims.com') ? 'icims'
                : directUrl.includes('smartrecruiters.com') ? 'smartrecruiters'
                : 'direct')
              : 'direct';

            const currentJobrightRef = job.apply_url?.includes('jobright.ai')
              ? job.apply_url
              : `https://jobright.ai/jobs/info/${externalJobId}`;

            const updatedSourceMetadata = {
              ...((job.source_metadata as any) || {}),
              jobright_reference_url: currentJobrightRef,
              enrichment_status: 'enriched',
              enriched_at: new Date().toISOString(),
            };

            await supabase
              .from('jobs')
              .update({
                apply_url: directUrl,
                original_apply_url: directUrl,
                canonical_url: directUrl,
                ats_platform_slug: detectedSlug,
                url_resolution_method: isDirectAts ? 'direct_ats' : 'employer_application',
                url_resolution_confidence: isDirectAts ? 0.95 : 0.85,
                source_metadata: updatedSourceMetadata,
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.id);

            job.apply_url = directUrl;
            job.original_apply_url = directUrl;
            job.canonical_url = directUrl;
            job.ats_platform_slug = detectedSlug;
            job.source_metadata = updatedSourceMetadata;
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
