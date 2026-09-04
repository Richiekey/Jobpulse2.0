import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { GoogleOAuthService } from '@/lib/google-oauth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  verifyOAuthState,
  encryptToken,
  sanitizeIntegrationRecord,
  type GoogleSheetsConfig,
} from '@jobpulse/domain';
import { GoogleOAuthCallbackQuerySchema } from '@jobpulse/validation';

export async function GET(request: NextRequest) {
  try {
    // Ensure user is authenticated
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);

    const queryParse = GoogleOAuthCallbackQuerySchema.safeParse({
      code: searchParams.get('code') || undefined,
      state: searchParams.get('state') || undefined,
      error: searchParams.get('error') || undefined,
    });

    if (!queryParse.success) {
      return ApiResponse.error(
        'Invalid OAuth callback parameters',
        queryParse.error.flatten(),
        400
      );
    }

    const { code, state: queryState, error: oauthError } = queryParse.data;

    if (oauthError) {
      return ApiResponse.error(
        `Google OAuth access denied: ${oauthError}`,
        null,
        400
      );
    }

    if (!code || !queryState) {
      return ApiResponse.error(
        'Missing authorization code or state parameter',
        null,
        400
      );
    }

    // CSRF verification: Read state cookie and compare
    const cookieStore = await cookies();
    const cookieState = cookieStore.get('jobpulse_google_oauth_state')?.value;

    if (!cookieState || cookieState !== queryState) {
      return ApiResponse.error(
        'OAuth state mismatch or missing cookie (CSRF protection failed)',
        null,
        400
      );
    }

    // Verify cryptographic signature and expiry of the state token
    let statePayload;
    try {
      statePayload = verifyOAuthState(queryState);
    } catch (err: unknown) {
      return ApiResponse.error(
        err instanceof Error ? err.message : 'Invalid state token',
        null,
        400
      );
    }

    // Ensure user matches state payload
    if (user.id !== statePayload.userId) {
      return ApiResponse.error(
        'Forbidden: OAuth session user does not match authenticated user',
        null,
        403
      );
    }

    // If an organization context is present, ensure user is org admin
    if (statePayload.organizationId) {
      const orgAdminResult = await AuthGuard.requireOrgAdmin(
        statePayload.organizationId
      );
      if ('errorResponse' in orgAdminResult) {
        return orgAdminResult.errorResponse;
      }
    }

    // Exchange authorization code for tokens
    const tokens = await GoogleOAuthService.exchangeCodeForTokens(code);

    // Retrieve user's Google email
    const googleEmail = await GoogleOAuthService.fetchUserEmail(tokens.accessToken);

    // Encrypt refresh token using AES-256-GCM with tenant/user AAD binding
    const aad = statePayload.organizationId || user.id;
    let encryptedPayload = null;
    if (tokens.refreshToken) {
      encryptedPayload = encryptToken(tokens.refreshToken, undefined, aad);
    }

    const tokenExpiresAt = new Date(
      Date.now() + tokens.expiresIn * 1000
    ).toISOString();

    // Check existing integration record
    let query = supabase
      .from('user_integrations')
      .select('*')
      .eq('provider', 'google_sheets');

    if (statePayload.organizationId) {
      query = query.eq('organization_id', statePayload.organizationId);
    } else {
      query = query.eq('user_id', user.id).is('organization_id', null);
    }

    const { data: existingIntegration } = await query.maybeSingle();

    const currentConfig: GoogleSheetsConfig = (existingIntegration?.config &&
    typeof existingIntegration.config === 'object'
      ? existingIntegration.config
      : {}) as GoogleSheetsConfig;

    const updatedConfig: GoogleSheetsConfig = {
      ...currentConfig,
      googleEmail,
      connectedAt: new Date().toISOString(),
      scopes: tokens.scope.split(' '),
    };

    let savedRecord = null;

    if (existingIntegration) {
      const { data, error: updateError } = await supabase
        .from('user_integrations')
        .update({
          config: updatedConfig,
          is_active: true,
          last_error: null,
        })
        .eq('id', existingIntegration.id)
        .select('*')
        .single();

      if (updateError) {
        return ApiResponse.error(
          'Failed to update integration record',
          updateError,
          500
        );
      }
      savedRecord = data;
    } else {
      const insertData = {
        user_id: user.id,
        organization_id: statePayload.organizationId || null,
        provider: 'google_sheets',
        config: updatedConfig,
        is_active: true,
        last_error: null,
      };

      const { data, error: insertError } = await supabase
        .from('user_integrations')
        .insert(insertData)
        .select('*')
        .single();

      if (insertError) {
        return ApiResponse.error(
          'Failed to insert integration record',
          insertError,
          500
        );
      }
      savedRecord = data;
    }

    // Securely persist OAuth secret material into isolated integration_secrets table via admin client
    if (encryptedPayload && savedRecord?.id) {
      const adminClient = createAdminClient();
      const { error: secretError } = await adminClient
        .from('integration_secrets')
        .upsert(
          {
            integration_id: savedRecord.id,
            encrypted_refresh_token: encryptedPayload.ciphertext,
            token_iv: encryptedPayload.iv,
            token_auth_tag: encryptedPayload.tag,
            token_expires_at: tokenExpiresAt,
            key_version: 1,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'integration_id' }
        );

      if (secretError) {
        return ApiResponse.error(
          'Failed to securely persist integration credentials',
          secretError,
          500
        );
      }
    }

    // Clean up CSRF state cookie
    cookieStore.delete('jobpulse_google_oauth_state');

    const wantsJson =
      searchParams.get('json') === 'true' ||
      request.headers.get('accept')?.includes('application/json');

    if (wantsJson) {
      return ApiResponse.success(sanitizeIntegrationRecord(savedRecord));
    }

    // Redirect to destination
    const targetUrl =
      statePayload.redirectTarget ||
      (statePayload.organizationId
        ? '/admin/integrations?connected=true'
        : '/worker/integrations?connected=true');

    return NextResponse.redirect(new URL(targetUrl, request.url));
  } catch (error: unknown) {
    return ApiResponse.error('Failed to process Google OAuth callback', error, 500);
  }
}
