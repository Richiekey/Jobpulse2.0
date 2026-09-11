import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GoogleOAuthService } from '@/lib/google-oauth';
import {
  decryptToken,
  formatApplicationSheetRow,
  syncApplicationToGoogleSheet,
  isGoogleApiRetryableError,
  calculateSyncRetryDelaySeconds,
  findMatchingResume,
  type SyncEventPayload,
} from '@jobpulse/domain';

/**
 * POST /api/sync/process
 *
 * Serverless-compatible sync processor. Processes pending Google Sheets sync events
 * directly within a Vercel function. Designed to be called by:
 *   - Vercel Cron (every minute)
 *   - Manual trigger (for debugging)
 *
 * Protected by CRON_SECRET (Vercel injects this automatically for cron routes)
 * or SYNC_CRON_SECRET env var for manual invocations.
 */
export const maxDuration = 60; // Allow up to 60s for batch processing

interface ClaimedEvent {
  id: string;
  user_id: string;
  organization_id: string | null;
  application_id: string;
  integration_id: string;
  provider: string;
  attempts: number;
  max_attempts: number;
  payload: SyncEventPayload;
  claim_token: string;
}

export async function POST(request: NextRequest) {
  // Verify authorization: Vercel Cron sends Authorization header with CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env['CRON_SECRET'] || process.env['SYNC_CRON_SECRET'];

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'Sync processor not configured: missing CRON_SECRET' },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const batchSize = 10;
  let successCount = 0;
  let errorCount = 0;

  try {
    // 1. Recover any stale leases (best-effort, non-blocking)
    await supabase.rpc('recover_stale_sync_events', { p_lease_seconds: 300 });

    // 2. Claim batch of pending sync events
    const { data: claimedEvents, error: claimError } = await supabase.rpc(
      'claim_next_pending_sync_events',
      { p_batch_size: batchSize }
    );

    if (claimError || !claimedEvents || claimedEvents.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: claimError ? `Claim error: ${claimError.message}` : 'No pending sync events',
      });
    }

    // 3. Process each claimed event
    for (const event of claimedEvents as ClaimedEvent[]) {
      try {
        await processEvent(supabase, event);
        successCount++;
      } catch (err: unknown) {
        errorCount++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        const isRetryable = isGoogleApiRetryableError(err);
        const retryDelay = isRetryable ? calculateSyncRetryDelaySeconds(event.attempts) : 0;

        await supabase.rpc('fail_sync_event', {
          p_event_id: event.id,
          p_claim_token: event.claim_token,
          p_error_message: errorMsg,
          p_retry_delay_seconds: retryDelay,
          p_is_non_retryable: !isRetryable,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      processed: successCount,
      errors: errorCount,
      total: claimedEvents.length,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Sync processor failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

/**
 * Processes a single sync event: decrypt credentials → refresh token →
 * optional resume discovery → format row → write to Google Sheets.
 */
async function processEvent(supabase: ReturnType<typeof createAdminClient>, event: ClaimedEvent) {
  // 1. Get integration config
  const { data: integration, error: intError } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('id', event.integration_id)
    .maybeSingle();

  if (intError || !integration || !integration.is_active) {
    throw new Error(`Integration ${event.integration_id} not found or inactive`);
  }

  const config = (integration.config || {}) as {
    spreadsheetId?: string;
    sheetName?: string;
    resumeFolderId?: string | null;
    applicantName?: string | null;
  };

  if (!config.spreadsheetId) {
    throw new Error(`Integration ${event.integration_id} has no spreadsheetId`);
  }

  // 2. Get encrypted credentials
  const { data: secret, error: secretError } = await supabase
    .from('integration_secrets')
    .select('*')
    .eq('integration_id', event.integration_id)
    .maybeSingle();

  if (secretError || !secret) {
    throw new Error(`No credentials for integration ${event.integration_id}`);
  }

  // 3. Decrypt refresh token
  const aad = event.organization_id || event.user_id;
  const refreshToken = decryptToken(
    {
      ciphertext: secret.encrypted_refresh_token,
      iv: secret.token_iv,
      tag: secret.token_auth_tag,
    },
    undefined,
    aad
  );

  // 4. Refresh access token
  const { accessToken } = await GoogleOAuthService.refreshAccessToken(refreshToken);

  // 5. Resume discovery enrichment
  if (config.resumeFolderId && config.applicantName && event.payload.companyName) {
    try {
      const match = await findMatchingResume({
        accessToken,
        folderId: config.resumeFolderId,
        applicantName: config.applicantName,
        companyName: event.payload.companyName,
      });

      if (match?.webViewLink) {
        event.payload.resumeUrl = match.webViewLink;
      } else if (event.attempts < 3) {
        // Upload race: retry later
        throw new Error(
          `Resume not yet found for ${event.payload.companyName} (attempt ${event.attempts + 1}/3)`
        );
      } else {
        event.payload.resumeUrl = '';
      }
    } catch (discoveryErr) {
      if (event.attempts < 3 && discoveryErr instanceof Error && discoveryErr.message.includes('not yet found')) {
        throw discoveryErr;
      }
      // Non-fatal: proceed without resume
      event.payload.resumeUrl = '';
    }
  }

  // 6. Format 8-column row and write to sheet
  const rowValues = formatApplicationSheetRow(event.payload);
  const syncResult = await syncApplicationToGoogleSheet({
    accessToken,
    spreadsheetId: config.spreadsheetId,
    sheetName: config.sheetName || 'Sheet1',
    rowValues,
  });

  // 7. Mark complete
  const rowIdStr = syncResult.rowIndex ? `row_${syncResult.rowIndex}` : null;
  const { error: completeError } = await supabase.rpc('complete_sync_event', {
    p_event_id: event.id,
    p_claim_token: event.claim_token,
    p_external_row_id: rowIdStr,
  });

  if (completeError) {
    throw new Error(`Failed to complete sync event: ${completeError.message}`);
  }
}

// Also support GET for Vercel Cron (which sends GET requests)
export async function GET(request: NextRequest) {
  return POST(request);
}
