import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { GoogleOAuthService } from '@/lib/google-oauth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  decryptToken,
  sanitizeIntegrationRecord,
  type GoogleSheetsConfig,
} from '@jobpulse/domain';
import { SelectSpreadsheetSchema } from '@jobpulse/validation';

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
        'No active Google Sheets integration found for this account',
        error,
        400
      );
    }

    // Privileged secret retrieval: Fetch encrypted credentials from isolated integration_secrets table
    const adminClient = createAdminClient();
    const { data: secret, error: secretError } = await adminClient
      .from('integration_secrets')
      .select('encrypted_refresh_token, token_iv, token_auth_tag, token_expires_at, key_version')
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
        'Integration credentials missing or incomplete. Reconnection required.',
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

    // Refresh access token to call Google Drive API
    const tokenResult = await GoogleOAuthService.refreshAccessToken(refreshToken);
    const spreadsheets = await GoogleOAuthService.listSpreadsheets(
      tokenResult.accessToken
    );

    return ApiResponse.success({ spreadsheets });
  } catch (error: unknown) {
    return ApiResponse.error('Failed to list Google Spreadsheets', error, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const body = await request.json().catch(() => ({}));

    const parseResult = SelectSpreadsheetSchema.safeParse(body);
    if (!parseResult.success) {
      return ApiResponse.error(
        'Invalid spreadsheet selection payload',
        parseResult.error.flatten(),
        400
      );
    }

    const {
      spreadsheetId,
      spreadsheetName,
      sheetName,
      organizationId,
      initializeHeaders,
    } = parseResult.data;

    // If setting for an organization, user must be Org Admin
    if (organizationId) {
      const orgAdminResult = await AuthGuard.requireOrgAdmin(organizationId);
      if ('errorResponse' in orgAdminResult) {
        return orgAdminResult.errorResponse;
      }
    }

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
        'Active Google Sheets integration not found',
        error,
        400
      );
    }

    // Optionally initialize standard headers in the target sheet
    let headerSuccess = false;
    if (initializeHeaders) {
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
          const { accessToken } = await GoogleOAuthService.refreshAccessToken(refreshToken);
          headerSuccess = await GoogleOAuthService.initializeHeaders(
            accessToken,
            spreadsheetId,
            sheetName || 'Sheet1'
          );
        }
      } catch {
        // Non-fatal: if header initialization fails (e.g. read-only sheet permissions), proceed with binding
      }
    }

    const currentConfig: GoogleSheetsConfig = (integration.config &&
    typeof integration.config === 'object'
      ? integration.config
      : {}) as GoogleSheetsConfig;

    const updatedConfig: GoogleSheetsConfig = {
      ...currentConfig,
      spreadsheetId,
      spreadsheetName: spreadsheetName || currentConfig.spreadsheetName,
      sheetName: sheetName || 'Sheet1',
      autoHeaderInitialized: headerSuccess || initializeHeaders,
    };

    const { data: updated, error: updateError } = await supabase
      .from('user_integrations')
      .update({
        config: updatedConfig,
        last_error: null,
      })
      .eq('id', integration.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return ApiResponse.error('Failed to bind spreadsheet to integration', updateError, 500);
    }

    // Backfill existing applications for this integration asynchronously into sync_events
    try {
      const adminClient = createAdminClient();
      await adminClient.rpc('enqueue_existing_applications_for_sync', {
        p_integration_id: integration.id,
        p_limit: 500,
      });
    } catch {
      // Non-fatal: backfill runs opportunistically in database
    }

    return ApiResponse.success(sanitizeIntegrationRecord(updated));
  } catch (error: unknown) {
    return ApiResponse.error('Failed to select spreadsheet', error, 500);
  }
}
