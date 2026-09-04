import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { GoogleOAuthService } from '@/lib/google-oauth';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken } from '@jobpulse/domain';
import { DisconnectIntegrationSchema } from '@jobpulse/validation';

async function handleDisconnect(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    // Parse input from body or query params
    let inputData: Record<string, unknown> = {};
    if (request.method === 'POST') {
      inputData = await request.json().catch(() => ({}));
    } else {
      const { searchParams } = new URL(request.url);
      inputData = {
        provider: searchParams.get('provider') || 'google_sheets',
        organizationId: searchParams.get('organizationId') || undefined,
      };
    }

    const parseResult = DisconnectIntegrationSchema.safeParse(inputData);
    if (!parseResult.success) {
      return ApiResponse.error(
        'Invalid disconnect request',
        parseResult.error.flatten(),
        400
      );
    }

    const { provider, organizationId } = parseResult.data;

    // If disconnecting an organization integration, caller must be Org Admin
    if (organizationId) {
      const orgAdminResult = await AuthGuard.requireOrgAdmin(organizationId);
      if ('errorResponse' in orgAdminResult) {
        return orgAdminResult.errorResponse;
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

    const { data: integration, error: fetchError } = await query.maybeSingle();

    if (fetchError) {
      return ApiResponse.error('Failed to query integration', fetchError, 500);
    }

    if (!integration) {
      return ApiResponse.success({
        disconnected: true,
        message: 'No active integration found',
        provider,
      });
    }

    // Revoke token with Google if refresh token exists
    try {
      const adminClient = createAdminClient();
      const { data: secret } = await adminClient
        .from('integration_secrets')
        .select('encrypted_refresh_token, token_iv, token_auth_tag')
        .eq('integration_id', integration.id)
        .maybeSingle();

      if (
        secret?.encrypted_refresh_token &&
        secret?.token_iv &&
        secret?.token_auth_tag
      ) {
        const aad = organizationId || user.id;
        const refreshToken = decryptToken(
          {
            ciphertext: secret.encrypted_refresh_token,
            iv: secret.token_iv,
            tag: secret.token_auth_tag,
          },
          undefined,
          aad
        );
        await GoogleOAuthService.revokeToken(refreshToken);
      }
    } catch {
      // Continue deletion even if remote revocation fails or token is already revoked
    }

    // Delete the integration record from the database
    const { error: deleteError } = await supabase
      .from('user_integrations')
      .delete()
      .eq('id', integration.id);

    if (deleteError) {
      return ApiResponse.error('Failed to remove integration record', deleteError, 500);
    }

    return ApiResponse.success({
      disconnected: true,
      provider,
      organizationId: organizationId || null,
    });
  } catch (error: unknown) {
    return ApiResponse.error('Failed to disconnect integration', error, 500);
  }
}

export async function POST(request: NextRequest) {
  return handleDisconnect(request);
}

export async function DELETE(request: NextRequest) {
  return handleDisconnect(request);
}
