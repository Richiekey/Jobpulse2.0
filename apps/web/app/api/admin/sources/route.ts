import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAdmin();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase } = authResult;
    const { searchParams } = new URL(request.url);

    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const healthStatus = searchParams.get('healthStatus');

    let query = supabase
      .from('company_sources')
      .select(`
        id,
        company_id,
        source_id,
        source_identifier,
        source_url,
        is_active,
        health_status,
        priority,
        schedule_interval_minutes,
        consecutive_failures,
        last_checked_at,
        last_success_at,
        last_failure_at,
        last_job_count,
        last_error,
        discovery_method,
        created_at,
        updated_at,
        companies (
          id,
          name,
          slug,
          domain
        ),
        sources (
          id,
          adapter_name,
          name
        )
      `)
      .order('priority', { ascending: true })
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (healthStatus) {
      query = query.eq('health_status', healthStatus);
    }

    const { data: sources, error } = await query;

    if (error) {
      return ApiResponse.error('Failed to fetch company sources.', error, 500);
    }

    return ApiResponse.success({
      count: (sources || []).length,
      sources: sources || [],
    });
  } catch (err) {
    return ApiResponse.error(
      'An unexpected error occurred while loading company sources.',
      err,
      500
    );
  }
}
