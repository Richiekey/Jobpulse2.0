import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const IntelligenceQuerySchema = z.object({
  organizationId: z.string().uuid('Invalid organizationId format: must be a valid UUID.').optional(),
  range: z.enum(['24h', '7d', '30d'], {
    errorMap: () => ({ message: 'Invalid range parameter: supported ranges are 24h, 7d, 30d.' }),
  }).default('24h'),
});

/**
 * GET /api/admin/intelligence
 * 
 * Batch R — Authoritative Operational Intelligence.
 * Returns authoritative metrics across:
 *   1. Workforce Intelligence (Roster, Velocity, Completion Rate, Verifications, Overdue Backlog, Turnaround)
 *   2. Job Inventory & Freshness (Inventory, Ingestion Velocity, Freshness Buckets, Quality Distributions)
 *   3. Source Health & Telemetry (Reliability, Distribution, Performance, Yield, Failure Taxonomy)
 *   4. Data Quality & Resolution Radar (Missing Fields, ATS Resolution, Method Breakdown, Compensation)
 * 
 * Strictly aggregated inside PostgreSQL via get_operational_intelligence_metrics RPC;
 * zero raw operational rows loaded into Node.js memory.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);

    const rawOrgId = searchParams.get('organizationId');
    const rawRange = searchParams.get('range');

    const parseResult = IntelligenceQuerySchema.safeParse({
      organizationId: rawOrgId ? rawOrgId : undefined,
      range: rawRange ? rawRange : '24h',
    });

    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return ApiResponse.error(
        firstIssue ? firstIssue.message : 'Invalid query parameters.',
        parseResult.error,
        400
      );
    }

    const { organizationId, range } = parseResult.data;

    // Check platform admin status
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    const isPlatformAdmin = Boolean(profile && (profile as any).role === 'admin');

    // Tenant Authorization Gate (R-P0-05)
    if (organizationId) {
      // Organization-scoped metrics: caller must be an admin of that organization or platform admin
      if (!isPlatformAdmin) {
        const orgCheck = await AuthGuard.requireOrgAdmin(organizationId, supabase);
        if ('errorResponse' in orgCheck) {
          return orgCheck.errorResponse;
        }
      }
    } else {
      // Global metrics: requires platform superadmin
      if (!isPlatformAdmin) {
        return ApiResponse.error(
          'Forbidden: Global operational intelligence requires platform administrator permissions.',
          { userId: user.id },
          403
        );
      }
    }

    // Database-Side Aggregation RPC (R-P0-04)
    const { data: metrics, error: rpcError } = await supabase.rpc(
      'get_operational_intelligence_metrics',
      {
        p_organization_id: organizationId ?? null,
        p_time_range: range,
      }
    );

    if (rpcError || !metrics) {
      return ApiResponse.error(
        'Failed to compile operational intelligence metrics.',
        rpcError,
        500
      );
    }

    return ApiResponse.success(metrics);
  } catch (err) {
    return ApiResponse.error(
      'An unexpected error occurred while compiling operational intelligence.',
      err,
      500
    );
  }
}
