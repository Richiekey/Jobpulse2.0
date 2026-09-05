import { supabase } from '../db.js';
import { logger } from '@jobpulse/shared';
import {
  decryptToken,
  formatApplicationSheetRow,
  calculateSyncRetryDelaySeconds,
  syncApplicationToGoogleSheet,
  refreshGoogleAccessToken,
  isGoogleApiRetryableError,
  type SyncEventPayload,
} from '@jobpulse/domain';

export interface SyncRunnerOptions {
  batchSize?: number;
  fetchFn?: typeof fetch;
  supabaseClient?: any;
}

export interface ClaimedSyncEvent {
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

export class SyncRunner {
  private batchSize: number;
  private fetchFn: typeof fetch;
  private supabase: any;

  constructor(options: SyncRunnerOptions = {}) {
    // Bound batch size: minimum 1, maximum 100
    this.batchSize = Math.max(1, Math.min(options.batchSize || 10, 100));
    this.fetchFn = options.fetchFn || fetch;
    this.supabase = options.supabaseClient || supabase;
  }

  /**
   * Recovers any stale sync events stuck in processing beyond the lease duration.
   */
  public async recoverStaleLeases(leaseSeconds = 300): Promise<number> {
    const { data, error } = await this.supabase.rpc('recover_stale_sync_events', {
      p_lease_seconds: leaseSeconds,
    });
    if (error) {
      logger.error('SyncRunner: Failed to recover stale sync events:', { error: error.message });
      return 0;
    }
    return Number(data) || 0;
  }

  /**
   * Polls for the next batch of pending/failed sync events and replicates them to Google Sheets.
   * Returns the count of successfully processed events.
   */
  public async pollAndExecutePendingSync(): Promise<number> {
    // 1. Claim batch of pending/failed sync events atomically with SKIP LOCKED
    const { data: claimedEvents, error: claimError } = await this.supabase.rpc(
      'claim_next_pending_sync_events',
      { p_batch_size: this.batchSize }
    );

    if (claimError) {
      logger.error('SyncRunner: Failed to claim pending sync events:', { error: claimError.message });
      return 0;
    }

    if (!claimedEvents || claimedEvents.length === 0) {
      return 0;
    }

    logger.info(`SyncRunner: Claimed ${claimedEvents.length} sync events for execution.`);
    let successCount = 0;

    for (const event of claimedEvents as ClaimedSyncEvent[]) {
      try {
        await this.processSyncEvent(event);
        successCount++;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`SyncRunner: Error processing sync event ${event.id}:`, { error: errorMsg });

        const isRetryable = isGoogleApiRetryableError(err);
        const retryDelay = isRetryable ? calculateSyncRetryDelaySeconds(event.attempts) : 0;

        await this.supabase.rpc('fail_sync_event', {
          p_event_id: event.id,
          p_claim_token: event.claim_token,
          p_error_message: errorMsg,
          p_retry_delay_seconds: retryDelay,
          p_is_non_retryable: !isRetryable,
        });
      }
    }

    return successCount;
  }

  /**
   * Processes a single claimed sync event with full credential isolation and idempotency.
   */
  public async processSyncEvent(event: ClaimedSyncEvent): Promise<void> {
    // 1. Retrieve user_integration metadata
    const { data: integration, error: intError } = await this.supabase
      .from('user_integrations')
      .select('*')
      .eq('id', event.integration_id)
      .maybeSingle();

    if (intError || !integration || !integration.is_active) {
      throw new Error(
        `Integration ${event.integration_id} not found or is inactive.`
      );
    }

    const config = (integration.config || {}) as {
      spreadsheetId?: string;
      sheetName?: string;
    };

    if (!config.spreadsheetId) {
      throw new Error(
        `Integration ${event.integration_id} has no spreadsheetId configured.`
      );
    }

    // 2. Retrieve isolated secret material from integration_secrets using service_role
    const { data: secret, error: secretError } = await this.supabase
      .from('integration_secrets')
      .select('*')
      .eq('integration_id', event.integration_id)
      .maybeSingle();

    if (secretError || !secret) {
      throw new Error(
        `No durable credentials found in integration_secrets for integration ${event.integration_id}.`
      );
    }

    // 3. Decrypt refresh token with tenant/user AAD binding
    const aad = event.organization_id || event.user_id;
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
    } catch (decryptErr) {
      throw new Error(
        `Failed to decrypt OAuth refresh token: ${decryptErr instanceof Error ? decryptErr.message : String(decryptErr)}`
      );
    }

    // 4. Obtain valid Google access token
    const tokenResult = await refreshGoogleAccessToken(
      refreshToken,
      undefined,
      undefined,
      this.fetchFn
    );

    // 5. Format canonical 10-column row
    const rowValues = formatApplicationSheetRow(event.payload);

    // 6. Write to Google Sheets idempotently (update in place or append)
    const syncResult = await syncApplicationToGoogleSheet(
      {
        accessToken: tokenResult.accessToken,
        spreadsheetId: config.spreadsheetId,
        sheetName: config.sheetName || 'Sheet1',
        rowValues,
      },
      this.fetchFn
    );

    // 7. Complete sync event atomically in database with claim fencing
    const rowIdStr = syncResult.rowIndex ? `row_${syncResult.rowIndex}` : null;
    const { error: completeError } = await this.supabase.rpc('complete_sync_event', {
      p_event_id: event.id,
      p_claim_token: event.claim_token,
      p_external_row_id: rowIdStr,
    });

    if (completeError) {
      throw new Error(
        `Failed to mark sync event as completed in database: ${completeError.message}`
      );
    }

    logger.info(
      `SyncRunner: Synced application ${event.application_id} to sheet (${syncResult.action}).`
    );
  }
}
