import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { assertSafeUrl } from '@jobpulse/shared';
import { ApplicationLifecycleService, ApplicationStatus } from '@jobpulse/domain';

/**
 * Helper: Record best-effort outbound click telemetry asynchronously.
 * Telemetry is explicitly non-blocking and decoupled from authoritative application persistence.
 */
function recordClickTelemetry(
  supabase: any,
  jobId: string,
  userId: string | null,
  destinationUrl: string,
  confidence: number,
  request: NextRequest
) {
  const userAgent = request.headers.get('user-agent') || undefined;
  const referrer = request.headers.get('referer') || undefined;

  // Best-effort asynchronous telemetry logging
  supabase
    .from('outbound_clicks')
    .insert({
      job_id: jobId,
      user_id: userId,
      destination_url: destinationUrl,
      url_resolution_confidence: confidence,
      user_agent: userAgent,
      referrer: referrer,
    })
    .then(() => {}, (telemetryErr: any) => {
      console.debug('[Telemetry] Outbound click logging notice:', telemetryErr?.message || telemetryErr);
    });
}

/**
 * GET /api/jobs/:id/apply
 * 
 * Safe destination resolution endpoint.
 * HARD INVARIANT (P0): GET requests MUST NOT cause durable state mutation in applications table.
 */
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

    // 1. Fetch Job Record and Destination URL
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

    // 2. Validate URL Safety (SSRF centralized security boundary)
    try {
      assertSafeUrl(targetUrl);
    } catch (urlErr: any) {
      return ApiResponse.error(`Unsafe application destination URL: ${urlErr.message}`, null, 400);
    }

    // 3. Optional User Context for Telemetry (NO STATE MUTATION)
    const { data: { user } } = await supabase.auth.getUser();

    // 4. Record Best-Effort Click Telemetry
    recordClickTelemetry(
      supabase,
      jobId,
      user?.id || null,
      targetUrl,
      job.url_resolution_confidence || 1.0,
      request
    );

    // 5. Check if client requested JSON metadata
    const acceptHeader = request.headers.get('accept') || '';
    if (acceptHeader.includes('application/json')) {
      return ApiResponse.success({
        jobId,
        destinationUrl: targetUrl,
        confidence: job.url_resolution_confidence,
      });
    }

    // 6. Direct HTTP 302 Redirect
    return NextResponse.redirect(targetUrl, { status: 302 });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred during application destination resolution.', err, 500);
  }
}

/**
 * POST /api/jobs/:id/apply
 * 
 * Explicit state-changing application dispatch endpoint.
 * 
 * Guarantees:
 * 1. Awaits authoritative application lifecycle persistence before confirming dispatch.
 * 2. Enforces application lifecycle invariants: never regresses screening, interview, offer, or terminal stages.
 * 3. Decouples reliable application persistence from best-effort click telemetry.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
      return ApiResponse.error('Invalid job identifier: must be a valid UUID.', null, 400);
    }

    const supabase = await createClient();

    // 1. Fetch Job Record and Destination URL
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

    // 2. Validate URL Safety (SSRF centralized security boundary)
    try {
      assertSafeUrl(targetUrl);
    } catch (urlErr: any) {
      return ApiResponse.error(`Unsafe application destination URL: ${urlErr.message}`, null, 400);
    }

    // 3. User Authentication & Authoritative Lifecycle State Machine
    const { data: { user } } = await supabase.auth.getUser();
    let applicationRecord: any = null;

    if (user) {
      const companyName = (job.companies as any)?.name || 'Verified Company';

      // Check existing application for (user_id, job_id)
      const { data: existingApp, error: fetchAppError } = await supabase
        .from('applications')
        .select('*')
        .eq('user_id', user.id)
        .eq('job_id', jobId)
        .maybeSingle();

      if (fetchAppError) {
        return ApiResponse.error('Failed to query existing application record.', fetchAppError, 500);
      }

      // Compute deterministic target status via domain lifecycle service
      const targetStatus: ApplicationStatus = ApplicationLifecycleService.getNextStatusOnDispatch(
        existingApp?.status as ApplicationStatus | undefined
      );

      // Persist application lifecycle mutation and AWAIT confirmation
      const now = new Date().toISOString();
      const payload: Record<string, any> = {
        user_id: user.id,
        job_id: jobId,
        company_name: companyName,
        job_title: job.display_title,
        status: targetStatus,
        updated_at: now,
      };

      // Set applied_at if not already set or transitioning from saved/new
      if (!existingApp || existingApp.status === 'saved') {
        payload.applied_at = now;
      }

      const { data: savedApp, error: appPersistError } = await supabase
        .from('applications')
        .upsert(payload, { onConflict: 'user_id, job_id' })
        .select('*')
        .single();

      if (appPersistError || !savedApp) {
        return ApiResponse.error('Failed to record application lifecycle state.', appPersistError, 500);
      }

      applicationRecord = savedApp;
    }

    // 4. Record Best-Effort Click Telemetry (Decoupled & Non-Blocking)
    recordClickTelemetry(
      supabase,
      jobId,
      user?.id || null,
      targetUrl,
      job.url_resolution_confidence || 1.0,
      request
    );

    // 5. Response formatting
    const acceptHeader = request.headers.get('accept') || '';
    if (acceptHeader.includes('application/json')) {
      return ApiResponse.success({
        jobId,
        destinationUrl: targetUrl,
        confidence: job.url_resolution_confidence,
        application: applicationRecord,
      });
    }

    return NextResponse.redirect(targetUrl, { status: 302 });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred during application dispatch.', err, 500);
  }
}
