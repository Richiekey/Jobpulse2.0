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

export interface ClaimedEvent {
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

/**
 * Processes a single sync event:
 * decrypt credentials -> refresh token -> optional resume discovery -> format row -> write to Google Sheets -> mark complete.
 */
export async function processEvent(
  supabase: ReturnType<typeof createAdminClient>,
  event: ClaimedEvent
): Promise<{ rowIndex?: number }> {
  console.info('[Sync] Starting event', {
    eventId: event.id,
    applicationId: event.application_id,
    integrationId: event.integration_id,
    attempt: event.attempts,
  });

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

  console.info('[Sync] Integration loaded', {
    eventId: event.id,
    spreadsheetId: config.spreadsheetId,
    sheetName: config.sheetName || 'Sheet1',
  });

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

  console.info('[Sync] Refresh token decrypted', {
    eventId: event.id,
  });

  // 4. Refresh access token
  const { accessToken } = await GoogleOAuthService.refreshAccessToken(refreshToken);

  console.info('[Sync] Google access token refreshed', {
    eventId: event.id,
  });

  // 5. Resume discovery enrichment (optional)
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
        throw new Error(
          `Resume not yet found for ${event.payload.companyName} (attempt ${event.attempts + 1}/3)`
        );
      } else {
        console.info('[Sync] Resume not found after 3 attempts, continuing without it', { eventId: event.id });
        event.payload.resumeUrl = '';
      }
    } catch (discoveryErr) {
      if (event.attempts < 3 && discoveryErr instanceof Error && discoveryErr.message.includes('not yet found')) {
        throw discoveryErr;
      }
      console.info('[Sync] Resume not found after 3 attempts, continuing without it', { eventId: event.id });
      event.payload.resumeUrl = '';
    }
  }

  // 6. Format 8-column row and write to sheet
  console.info('[Sync] Writing row to Google Sheets', {
    eventId: event.id,
    spreadsheetId: config.spreadsheetId,
    sheetName: config.sheetName || 'Sheet1',
  });

  const rowValues = formatApplicationSheetRow(event.payload);
  const syncResult = await syncApplicationToGoogleSheet({
    accessToken,
    spreadsheetId: config.spreadsheetId,
    sheetName: config.sheetName || 'Sheet1',
    rowValues,
  });

  console.info('[Sync] Google Sheets write completed', {
    eventId: event.id,
    action: syncResult.action,
    rowIndex: syncResult.rowIndex ?? null,
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

  console.info('[Sync] Event completed', {
    eventId: event.id,
  });

  return { rowIndex: syncResult.rowIndex };
}

/**
 * Processes a batch of claimed pending sync events.
 */
export async function processPendingSyncBatch(batchSize = 10) {
  const supabase = createAdminClient();
  let successCount = 0;
  let errorCount = 0;

  // 1. Recover stale leases
  await supabase.rpc('recover_stale_sync_events', { p_lease_seconds: 300 });

  // 2. Claim batch
  const { data: claimedEvents, error: claimError } = await supabase.rpc(
    'claim_next_pending_sync_events',
    { p_batch_size: batchSize }
  );

  if (claimError || !claimedEvents || claimedEvents.length === 0) {
    return {
      ok: true,
      processed: 0,
      message: claimError ? `Claim error: ${claimError.message}` : 'No pending sync events',
    };
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

  return {
    ok: true,
    processed: successCount,
    errors: errorCount,
    total: claimedEvents.length,
  };
}

/**
 * Immediately triggers sync for a specific newly created application.
 * Bypasses cron delay so user sees real-time sync in UI.
 */
export async function processSyncForApplication(applicationId: string, userId?: string) {
  const supabase = createAdminClient();

  // Find the sync event associated with this application
  let query = supabase
    .from('sync_events')
    .select('*')
    .eq('application_id', applicationId);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data: events, error } = await query.order('created_at', { ascending: false }).limit(1);

  if (error || !events || events.length === 0) {
    return { ok: false, error: 'No sync event found for application' };
  }

  const syncEvent = events[0];
  if (syncEvent.status === 'synced') {
    return { ok: true, status: 'synced', externalRowId: syncEvent.external_row_id };
  }

  // Attempt to claim and process directly
  const { data: claimedEvents, error: claimErr } = await supabase.rpc('claim_sync_event', {
    p_event_id: syncEvent.id,
  });

  if (claimErr) {
    console.error('[Sync] Failed to claim event', {
      eventId: syncEvent.id,
      applicationId,
      error: claimErr.message,
    });
    return {
      ok: false,
      status: 'failed',
      error: claimErr.message,
    };
  }

  if (!claimedEvents || claimedEvents.length === 0) {
    return {
      ok: false,
      status: 'pending',
      error: 'Sync event could not be claimed because it may already be processing or completed.',
    };
  }

  const claimed = claimedEvents[0];

  try {
    const result = await processEvent(supabase, {
      id: claimed.id,
      user_id: claimed.user_id,
      organization_id: claimed.organization_id,
      application_id: claimed.application_id,
      integration_id: claimed.integration_id,
      provider: claimed.provider,
      attempts: claimed.attempts,
      max_attempts: claimed.max_attempts,
      payload: claimed.payload,
      claim_token: claimed.claim_token,
    });

    return { ok: true, status: 'synced', rowIndex: result.rowIndex };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isRetryable = isGoogleApiRetryableError(err);
    const retryDelay = isRetryable ? calculateSyncRetryDelaySeconds(claimed.attempts) : 0;

    await supabase.rpc('fail_sync_event', {
      p_event_id: claimed.id,
      p_claim_token: claimed.claim_token,
      p_error_message: errorMsg.substring(0, 500),
      p_retry_delay_seconds: retryDelay,
      p_is_non_retryable: !isRetryable,
    });

    return { ok: false, status: 'failed', error: errorMsg };
  }
}
