import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { GoogleOAuthService } from '@/lib/google-oauth';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken } from '@jobpulse/domain';

/**
 * GET /api/integrations/google/folders
 *
 * Lists Google Drive folders accessible by the authenticated user.
 * Used by the UI to populate the "Resume Drive Folder" selector.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId') || undefined;

    if (organizationId) {
      const orgMemberResult = await AuthGuard.requireOrgMember(organizationId);
      if ('errorResponse' in orgMemberResult) {
        return orgMemberResult.errorResponse;
      }
    }

    // Find active Google Sheets integration for this user
    let query = supabase
      .from('user_integrations')
      .select('*')
      .eq('provider', 'google_sheets')
      .eq('is_active', true);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    } else {
      query = query.eq('user_id', user.id).is('organization_id', null);
    }

    const { data: integration, error } = await query.maybeSingle();

    if (error || !integration) {
      return ApiResponse.error(
        'No active Google integration found. Please connect Google first.',
        error,
        400
      );
    }

    // Retrieve encrypted credentials
    const adminClient = createAdminClient();
    const { data: secret, error: secretError } = await adminClient
      .from('integration_secrets')
      .select('encrypted_refresh_token, token_iv, token_auth_tag')
      .eq('integration_id', integration.id)
      .maybeSingle();

    if (
      secretError ||
      !secret ||
      !secret.encrypted_refresh_token ||
      !secret.token_iv ||
      !secret.token_auth_tag
    ) {
      return ApiResponse.error(
        'Integration credentials missing. Please reconnect Google.',
        secretError || null,
        400
      );
    }

    // Decrypt refresh token
    const aad = organizationId || user.id;
    let refreshToken: string;
    try {
      refreshToken = decryptToken(
        {
          ciphertext: secret.encrypted_refresh_token,
          iv: secret.token_iv,
          tag: secret.token_auth_tag,
        },
        undefined,
        aad
      );
    } catch (decryptErr: unknown) {
      return ApiResponse.error(
        'Failed to decrypt integration credentials',
        decryptErr,
        500
      );
    }

    // Refresh access token and list Drive folders
    const tokenResult = await GoogleOAuthService.refreshAccessToken(refreshToken);
    const folders = await GoogleOAuthService.listDriveFolders(tokenResult.accessToken);

    return ApiResponse.success({ folders });
  } catch (error: unknown) {
    return ApiResponse.error('Failed to list Google Drive folders', error, 500);
  }
}
