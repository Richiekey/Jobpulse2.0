import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (organizationId) {
      const orgCheck = await AuthGuard.requireOrgMember(organizationId);
      if ('errorResponse' in orgCheck) {
        return orgCheck.errorResponse;
      }
    }

    // Base query scoped to tenant/user
    let query = supabase.from('sync_events').select('*');
    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    } else {
      query = query.eq('user_id', user.id).is('organization_id', null);
    }

    const { data: events, error: queryError } = await query
      .order('created_at', { ascending: false })
      .limit(50);

    if (queryError) {
      return ApiResponse.error('Failed to retrieve sync status.', queryError, 500);
    }

    const allEvents = events || [];
    const counts = {
      pending: 0,
      processing: 0,
      synced: 0,
      failed: 0,
      dead_letter: 0,
    };

    for (const e of allEvents) {
      if (e.status in counts) {
        counts[e.status as keyof typeof counts]++;
      }
    }

    return ApiResponse.success({
      counts,
      recentEvents: allEvents.slice(0, 20),
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while fetching sync status.', err, 500);
  }
}
