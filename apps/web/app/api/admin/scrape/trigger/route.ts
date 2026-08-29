import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const ScrapeTriggerSchema = z.object({
  companyIdentifier: z.string().trim().max(100).optional(),
  sourceId: z.string().uuid().optional(),
});

/**
 * POST /api/admin/scrape/trigger
 * 
 * Atomically schedules a scrape run for a target company source or global crawl.
 * HARD INVARIANT (P0): Uses PostgreSQL `schedule_admin_scrape_run` RPC with `pg_advisory_xact_lock`
 * to guarantee true atomic concurrency serialization and eliminate all TOCTOU race conditions.
 */
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

    // 3. Atomically schedule scrape run via PostgreSQL RPC with transactional advisory locking
    const { data: result, error: rpcError } = await supabase.rpc('schedule_admin_scrape_run', {
      p_admin_id: profile.id,
      p_company_identifier: companyIdentifier || 'all',
      p_source_id: sourceId || null,
      p_ttl_seconds: 900,
    });

    if (rpcError || !result) {
      return ApiResponse.error(
        'Failed to execute atomic scrape scheduling RPC in database.',
        rpcError,
        500
      );
    }

    if (!result.success) {
      if (result.conflict) {
        return ApiResponse.error(
          result.message || 'A crawl run is already in progress or queued for this target.',
          { existingRunId: result.existing_run_id, status: result.existing_status },
          409
        );
      }
      if (result.error_type === 'NOT_FOUND') {
        return ApiResponse.error(result.message, undefined, 404);
      }
      if (result.error_type === 'DISABLED') {
        return ApiResponse.error(result.message, { sourceId, isActive: false }, 400);
      }
      return ApiResponse.error(result.message || 'Could not schedule scrape run.', undefined, 400);
    }

    return ApiResponse.success(
      {
        message: 'Scrape run successfully scheduled and queued for execution.',
        runId: result.run_id,
        status: result.status,
        companyIdentifier: result.company_identifier,
        sourceId: result.source_id,
        scheduledAt: result.scheduled_at,
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
