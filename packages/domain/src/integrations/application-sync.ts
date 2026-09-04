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

export { DEFAULT_JOBPULSE_SHEET_HEADERS };
