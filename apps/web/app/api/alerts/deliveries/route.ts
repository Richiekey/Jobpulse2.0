import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';

/**
 * GET /api/alerts/deliveries
 * Retrieves delivery logs for alerts belonging to the authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const url = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10), 1), 100);

    const { data: deliveries, error } = await supabase
      .from('job_alert_deliveries')
      .select('*')
      .eq('user_id', user.id)
      .order('dispatched_at', { ascending: false })
      .limit(limit);

    if (error) {
      return ApiResponse.error('Failed to load alert delivery logs.', error, 500);
    }

    return ApiResponse.success({
      deliveries: deliveries || [],
      count: deliveries?.length || 0,
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while loading delivery logs.', err, 500);
  }
}
