import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const SourcesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(50),
  offset: z.coerce.number().int().min(0, 'Offset cannot be negative').default(0),
  healthStatus: z.enum(['healthy', 'degraded', 'failing', 'disabled']).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAdmin();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase } = authResult;
    const { searchParams } = new URL(request.url);

    const rawParams = {
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
      healthStatus: searchParams.get('healthStatus') ?? undefined,
    };

    const parseResult = SourcesQuerySchema.safeParse(rawParams);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid query parameters: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { limit, offset, healthStatus } = parseResult.data;

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
      .range(offset, offset + limit - 1);

    if (healthStatus) {
      query = query.eq('health_status', healthStatus);
    }

    const { data: sources, error } = await query;

    if (error) {
      return ApiResponse.error('Failed to fetch company sources.', error, 500);
    }

    return ApiResponse.success({
      count: (sources || []).length,
      limit,
      offset,
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
