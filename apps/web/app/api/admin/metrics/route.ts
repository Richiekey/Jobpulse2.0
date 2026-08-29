import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';

/**
 * GET /api/admin/metrics
 * 
 * Aggregates production system health, ingestion, and application funnel metrics.
 * HARD INVARIANT (P0): Aggregations are computed entirely within PostgreSQL via RPC;
 * zero raw operational tables are read into Node.js memory.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAdmin();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase } = authResult;

    // Execute PostgreSQL database-side aggregation RPC
    const { data: metrics, error: rpcError } = await supabase.rpc('get_admin_system_metrics');

    if (rpcError || !metrics) {
      return ApiResponse.error(
        'Failed to aggregate system metrics in database.',
        rpcError,
        500
      );
    }

    // Enrich with process-level runtime stats
    const enrichedMetrics = {
      ...metrics,
      system: {
        ...metrics.system,
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
      },
    };

    return ApiResponse.success(enrichedMetrics);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while compiling system metrics.', err, 500);
  }
}
