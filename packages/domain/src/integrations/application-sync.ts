import { DEFAULT_JOBPULSE_SHEET_HEADERS } from './google-sheets.js';
import type { SyncEventPayload } from '../entities/sync-event.js';

/**
 * Maps a job application sync payload into the canonical 10-column Google Sheet row.
 */
export function formatApplicationSheetRow(payload: SyncEventPayload): string[] {
  return [
    payload.applicationId,
    payload.jobTitle || 'Untitled Role',
    payload.companyName || 'Unknown Company',
    payload.location || 'N/A',
    payload.status || 'applied',
    payload.appliedAt || new Date().toISOString(),
    payload.verificationStatus || 'pending',
    payload.directApplyUrl || '',
    payload.notes || '',
    payload.updatedAt || new Date().toISOString(),
  ];
}

/**
 * Calculates exponential retry delay in seconds with jitter for failed sync events.
 * Attempt 1: ~10s
 * Attempt 2: ~20s
 * Attempt 3: ~40s
 * Attempt 4: ~80s
 * Max delay: 300s (5 mins)
 */
export function calculateSyncRetryDelaySeconds(
  attempt: number,
  baseSeconds = 10,
  maxSeconds = 300
): number {
  if (attempt <= 0) return baseSeconds;
  const rawBackoff = baseSeconds * Math.pow(2, attempt - 1);
  const capped = Math.min(rawBackoff, maxSeconds);
  // Apply +/- 15% jitter to prevent thundering herds on recovery
  const jitterFactor = 0.85 + Math.random() * 0.3;
  return Math.max(1, Math.round(capped * jitterFactor));
}

/**
 * Classifies Google Sheets and OAuth API errors into retryable vs non-retryable.
 *
 * Retryable:
 * - HTTP 429 (rate limits/quota)
 * - HTTP 500, 502, 503, 504 (transient server errors)
 * - Transient network errors (timeouts, connection resets, fetch failure)
 *
 * Non-retryable (immediately transitions to dead_letter to save retry quota):
 * - HTTP 400 (malformed request / invalid spreadsheet ID)
 * - HTTP 401 (unauthorized / invalid_grant / revoked token)
 * - HTTP 403 (permission denied / forbidden)
 * - HTTP 404 (spreadsheet or sheet not found)
 */
export function isGoogleApiRetryableError(error: unknown): boolean {
  if (typeof error === 'number') {
    return [429, 500, 502, 503, 504].includes(error);
  }

  // 1. Structured status & error object inspection (O-21 priority)
  if (error && typeof error === 'object') {
    const errObj = error as Record<string, any>;
    const statusCode =
      typeof errObj.status === 'number'
        ? errObj.status
        : typeof errObj.statusCode === 'number'
        ? errObj.statusCode
        : typeof errObj.response?.status === 'number'
        ? errObj.response.status
        : typeof errObj.code === 'number'
        ? errObj.code
        : null;

    if (statusCode !== null) {
      if ([429, 500, 502, 503, 504].includes(statusCode)) {
        return true;
      }
      if ([400, 401, 403, 404].includes(statusCode)) {
        return false;
      }
    }

    // Google API error reason inspection (e.g. rateLimitExceeded, authError, notFound)
    const googleReason =
      errObj.errors?.[0]?.reason ||
      errObj.error?.errors?.[0]?.reason ||
      errObj.error?.status;
    if (typeof googleReason === 'string') {
      if (
        ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'RESOURCE_EXHAUSTED'].includes(
          googleReason
        )
      ) {
        return true;
      }
      if (
        [
          'authError',
          'PERMISSION_DENIED',
          'UNAUTHENTICATED',
          'NOT_FOUND',
          'INVALID_ARGUMENT',
        ].includes(googleReason)
      ) {
        return false;
      }
    }

    // Node.js network primitives & system codes
    const sysCode = errObj.code || errObj.cause?.code;
    if (typeof sysCode === 'string') {
      if (
        ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN'].includes(
          sysCode
        )
      ) {
        return true;
      }
    }
  }

  // 2. Fallback message regex matching
  const msg = error instanceof Error ? error.message : String(error);

  // Explicit non-retryable error patterns
  if (
    /400|401|403|404|invalid_grant|invalid_client|unauthorized|permission\s*denied|not\s*found|invalid spreadsheet|no durable credentials/i.test(
      msg
    )
  ) {
    return false;
  }

  // Explicit retryable error patterns
  if (
    /429|500|502|503|504|rate\s*limit|quota|timeout|etimedout|econnreset|fetch failed|enotfound|socket hang up|service unavailable|internal server error/i.test(
      msg
    )
  ) {
    return true;
  }

  // Default to true for unknown errors
  return true;
}

export { DEFAULT_JOBPULSE_SHEET_HEADERS };
