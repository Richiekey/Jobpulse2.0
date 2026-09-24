import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { AuthGuard } from '@/lib/auth-guard';
import { resolveJobrightDetail } from '@jobpulse/ats';
import { URLResolver } from '@jobpulse/url-resolution';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) return authResult.errorResponse;

    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Missing required job ID parameter', null, 400);
    }

    const supabase = await createClient();

    // 1. Fetch current job URL states
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, apply_url, canonical_url, source_job_url, ats_platform_slug, source_metadata')
      .eq('id', id)
      .single();

    if (jobError || !job) {
      return ApiResponse.error('Job not found', null, 404);
    }

    const metadata = (job.source_metadata as Record<string, any>) || {};
    const existingDirectAts = metadata.direct_ats_url;

    // 2. If already resolved and direct ATS is known, return immediately
    if (existingDirectAts && URLResolver.isDirectAtsUrl(existingDirectAts)) {
      return ApiResponse.success({
        directUrl: existingDirectAts,
        jobrightUrl: metadata.jobright_reference_url || (job.apply_url?.includes('jobright.ai') ? job.apply_url : null),
        method: 'cached_direct_ats',
        confidence: 1.0,
        isDirectAts: true,
        cached: true,
      });
    }

    // 3. Extract Jobright external job ID
    const externalIdMatch =
      job.apply_url?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/) ||
      job.canonical_url?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/) ||
      job.source_job_url?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/);

    const externalJobId = externalIdMatch?.[1];

    if (!externalJobId) {
      // If it's already a direct company URL
      const currentApply = job.apply_url || job.canonical_url;
      const isDirect = currentApply ? URLResolver.isDirectAtsUrl(currentApply) : false;
      return ApiResponse.success({
        directUrl: currentApply,
        jobrightUrl: null,
        method: isDirect ? 'direct_ats' : 'direct_company',
        confidence: isDirect ? 0.95 : 0.8,
        isDirectAts: isDirect,
        cached: true,
      });
    }

    // 4. Resolve Jobright detail page
    const detail = await resolveJobrightDetail(externalJobId);
    if (!detail || !detail.directUrl) {
      return ApiResponse.error('Unable to resolve direct ATS URL from provider', { externalJobId }, 502);
    }

    const directUrl = detail.directUrl;
    const isDirectAts = URLResolver.isDirectAtsUrl(directUrl);
    const jobrightReferenceUrl = `https://jobright.ai/jobs/info/${externalJobId}`;

    const updatedMetadata = {
      ...metadata,
      direct_ats_url: directUrl,
      jobright_reference_url: jobrightReferenceUrl,
      enrichment_status: 'enriched',
      enriched_at: new Date().toISOString(),
    };

    // 5. Update database record
    await supabase
      .from('jobs')
      .update({
        apply_url: directUrl,
        original_apply_url: directUrl,
        canonical_url: directUrl,
        source_metadata: updatedMetadata,
        url_resolution_method: isDirectAts ? 'direct_ats' : 'employer_application',
        url_resolution_confidence: isDirectAts ? 0.95 : 0.85,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return ApiResponse.success({
      directUrl,
      jobrightUrl: jobrightReferenceUrl,
      method: isDirectAts ? 'direct_ats' : 'employer_application',
      confidence: isDirectAts ? 0.95 : 0.85,
      isDirectAts,
      cached: false,
    });
  } catch (err: any) {
    return ApiResponse.error(err.message || 'Internal server error resolving job URL', err, 500);
  }
}
