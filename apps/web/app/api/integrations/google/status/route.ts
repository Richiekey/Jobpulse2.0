import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { sanitizeIntegrationRecord } from '@jobpulse/domain';
import { GetIntegrationStatusQuerySchema } from '@jobpulse/validation';

export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);

    const queryParse = GetIntegrationStatusQuerySchema.safeParse({
      provider: searchParams.get('provider') || 'google_sheets',
      organizationId: searchParams.get('organizationId') || undefined,
    });

    if (!queryParse.success) {
      return ApiResponse.error(
        'Invalid status query parameters',
        queryParse.error.flatten(),
        400
      );
    }

    const { provider, organizationId } = queryParse.data;

    // If querying an organization integration, caller must be a member of that organization
    if (organizationId) {
      const orgMemberResult = await AuthGuard.requireOrgMember(organizationId);
      if ('errorResponse' in orgMemberResult) {
        return orgMemberResult.errorResponse;
      }
    }

    let query = supabase
      .from('user_integrations')
      .select('*')
      .eq('provider', provider);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    } else {
      query = query.eq('user_id', user.id).is('organization_id', null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return ApiResponse.error('Failed to fetch integration status', error, 500);
    }

    if (!data) {
      return ApiResponse.success({
        connected: false,
        provider,
        integration: null,
      });
    }

    const sanitized = sanitizeIntegrationRecord(data);

    return ApiResponse.success({
      connected: Boolean(data.is_active),
      provider,
      integration: sanitized,
    });
  } catch (error: unknown) {
    return ApiResponse.error('Failed to get integration status', error, 500);
  }
}
