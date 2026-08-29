import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { assertSafeUrl } from '@jobpulse/shared';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
      return ApiResponse.error('Invalid job identifier: must be a valid UUID.', null, 400);
    }

    const supabase = await createClient();

    // 1. Fetch Job and Apply URL
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, display_title, company_id, apply_url, canonical_url, url_resolution_confidence, companies(name)')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return ApiResponse.error('Job not found or inactive.', jobError, 404);
    }

    const targetUrl = job.apply_url || job.canonical_url;
    if (!targetUrl) {
      return ApiResponse.error('No valid application destination URL configured for this job.', null, 400);
    }

    // 2. Validate URL safety (SSRF boundary check)
    try {
      assertSafeUrl(targetUrl);
    } catch (urlErr: any) {
      return ApiResponse.error(`Unsafe application destination URL: ${urlErr.message}`, null, 400);
    }

    // 3. Optional Authenticated User Context
    const { data: { user } } = await supabase.auth.getUser();

    // 4. Record Outbound Click Telemetry Asynchronously
    const userAgent = request.headers.get('user-agent') || undefined;
    const referrer = request.headers.get('referer') || undefined;

    // Fire and record telemetry
    supabase
      .from('outbound_clicks')
      .insert({
        job_id: jobId,
        user_id: user?.id || null,
        destination_url: targetUrl,
        url_resolution_confidence: job.url_resolution_confidence || 1.0,
        user_agent: userAgent,
        referrer: referrer,
      })
      .then();

    // 5. If authenticated, optionally auto-log to applications tracker as 'applied' if not already tracked
    if (user) {
      const companyName = (job.companies as any)?.name || 'Unknown Company';
      supabase
        .from('applications')
        .upsert(
          {
            user_id: user.id,
            job_id: jobId,
            company_name: companyName,
            job_title: job.display_title,
            status: 'applied',
            applied_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id, job_id' }
        )
        .then();
    }

    // Check if client expects JSON or direct redirect
    const acceptHeader = request.headers.get('accept') || '';
    if (acceptHeader.includes('application/json')) {
      return ApiResponse.success({
        jobId,
        destinationUrl: targetUrl,
        confidence: job.url_resolution_confidence,
      });
    }

    // Redirect to original ATS destination
    return NextResponse.redirect(targetUrl, { status: 302 });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred during application dispatch.', err, 500);
  }
}
