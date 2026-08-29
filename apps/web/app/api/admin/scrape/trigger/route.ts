import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const ScrapeTriggerSchema = z.object({
  companyIdentifier: z.string().trim().max(100).optional(),
  sourceId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Authorize Admin
    const authResult = await AuthGuard.requireAdmin();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase, profile } = authResult;

    // 2. Validate Request Payload
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = ScrapeTriggerSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid request payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { companyIdentifier, sourceId } = parseResult.data;

    // 3. Create durable scrape_runs record in Supabase with status 'pending'
    const { data: scrapeRun, error: insertError } = await supabase
      .from('scrape_runs')
      .insert({
        started_at: new Date().toISOString(),
        status: 'pending',
        companies_attempted: 0,
        companies_succeeded: 0,
        companies_failed: 0,
        jobs_discovered: 0,
        jobs_inserted: 0,
        jobs_updated: 0,
        jobs_rejected: 0,
        jobs_failed: 0,
        metadata: {
          triggered_by_admin: profile.id,
          company_identifier: companyIdentifier || 'all',
          source_id: sourceId || null,
        },
      })
      .select('id, started_at, status')
      .single();

    if (insertError || !scrapeRun) {
      return ApiResponse.error(
        'Failed to schedule scrape run in database.',
        insertError,
        500
      );
    }

    return ApiResponse.success(
      {
        message: 'Scrape run successfully scheduled and queued for execution.',
        runId: scrapeRun.id,
        status: scrapeRun.status,
        companyIdentifier: companyIdentifier || 'all',
        sourceId: sourceId || null,
        scheduledAt: scrapeRun.started_at,
      },
      undefined,
      { status: 202 }
    );
  } catch (err) {
    return ApiResponse.error(
      'An unexpected error occurred while processing the scrape request.',
      err,
      500
    );
  }
}
