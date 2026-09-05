import { AuthGuard } from './auth-guard';
import { ApiResponse } from './api-response';
import { createAdminClient } from './supabase/admin';

export interface SyncRetryParams {
  eventId?: string;
  organizationId?: string;
}

export class SyncRetryService {
  /**
   * Executes single or bulk sync event retry with strict multi-tenant authorization
   * and state transition enforcement.
   */
  public static async executeRetry(
    params: SyncRetryParams,
    clientOverride?: any
  ) {
    const authResult = await AuthGuard.requireAuthenticatedUser(clientOverride);
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user } = authResult;
    const { eventId, organizationId } = params;
    const adminClient = createAdminClient();

    if (eventId) {
      // Find the target sync event
      const { data: event, error: findError } = await adminClient
        .from('sync_events')
        .select('*')
        .eq('id', eventId)
        .maybeSingle();

      if (findError || !event) {
        return ApiResponse.error('Sync event not found', null, 404);
      }

      // Verify caller authorization
      if (event.organization_id) {
        const orgCheck = await AuthGuard.requireOrgAdmin(event.organization_id, clientOverride);
        if ('errorResponse' in orgCheck) {
          return orgCheck.errorResponse;
        }
      } else if (event.user_id !== user.id) {
        return ApiResponse.error(
          'Forbidden: You do not have permission to retry this sync event.',
          null,
          403
        );
      }

      // Validate current event status: Only failed or dead_letter can be retried
      if (!['failed', 'dead_letter'].includes(event.status)) {
        return ApiResponse.error(
          `Cannot retry sync event with status '${event.status}'. Only failed or dead_letter events can be retried.`,
          { currentStatus: event.status },
          400
        );
      }

      // Enforce manual replay limit to prevent indefinite bypass of retry policy
      const currentManualRetries = event.manual_retry_count || 0;
      if (currentManualRetries >= 5) {
        return ApiResponse.error(
          'Manual retry limit reached for this event (maximum 5 manual replays permitted).',
          { manualRetryCount: currentManualRetries },
          400
        );
      }

      // Re-enqueue event preserving automatic attempts history atomically guarding current status
      const { data: updatedRows, error: updateError } = await adminClient
        .from('sync_events')
        .update({
          status: 'pending',
          claim_token: null,
          processing_started_at: null,
          next_retry_at: new Date().toISOString(),
          last_error: null,
          manual_retry_count: currentManualRetries + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
        .in('status', ['failed', 'dead_letter'])
        .select('id');

      if (updateError) {
        return ApiResponse.error('Failed to retry sync event.', updateError, 500);
      }

      if (!updatedRows || updatedRows.length === 0) {
        return ApiResponse.error(
          'Sync event state changed concurrently (event is no longer in a retryable state).',
          { eventId },
          409
        );
      }

      return ApiResponse.success({ retriedCount: 1 });
    } else if (organizationId) {
      const orgCheck = await AuthGuard.requireOrgAdmin(organizationId, clientOverride);
      if ('errorResponse' in orgCheck) {
        return orgCheck.errorResponse;
      }

      const { data: retriedCount, error: updateError } = await adminClient.rpc(
        'retry_sync_events_bulk',
        {
          p_user_id: user.id,
          p_organization_id: organizationId,
          p_max_manual_retries: 5,
        }
      );

      if (updateError) {
        return ApiResponse.error('Failed to retry organization sync events.', updateError, 500);
      }

      return ApiResponse.success({ retriedCount: retriedCount ?? 0 });
    } else {
      // Personal retry: retry all caller's own failed/dead_letter events
      const { data: retriedCount, error: updateError } = await adminClient.rpc(
        'retry_sync_events_bulk',
        {
          p_user_id: user.id,
          p_organization_id: null,
          p_max_manual_retries: 5,
        }
      );

      if (updateError) {
        return ApiResponse.error('Failed to retry sync events.', updateError, 500);
      }

      return ApiResponse.success({ retriedCount: retriedCount ?? 0 });
    }
  }
}
