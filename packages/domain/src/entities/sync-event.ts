import type { ApplicationStatus } from '../application-lifecycle.js';

export type SyncEventStatus =
  | 'pending'
  | 'processing'
  | 'synced'
  | 'failed'
  | 'dead_letter';

export interface SyncEventPayload {
  applicationId: string;
  jobTitle: string;
  companyName: string;
  status: ApplicationStatus | string;
  appliedAt: string;
  verificationStatus?: string;
  directApplyUrl?: string;
  location?: string;
  notes?: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface SyncEventRecord {
  id: string;
  userId: string;
  organizationId: string | null;
  applicationId: string;
  integrationId: string;
  provider: string;
  status: SyncEventStatus;
  attempts: number;
  maxAttempts: number;
  manualRetryCount?: number;
  claimToken?: string | null;
  processingStartedAt?: string | null;
  nextRetryAt: string;
  lastError: string | null;
  payload: SyncEventPayload;
  pendingPayload?: SyncEventPayload | null;
  externalRowId: string | null;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncEventDto {
  id: string;
  applicationId: string;
  status: SyncEventStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string;
  lastError: string | null;
  externalRowId: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
}

export function toSyncEventDto(record: any): SyncEventDto {
  return {
    id: record.id,
    applicationId: record.application_id || record.applicationId,
    status: record.status,
    attempts: record.attempts,
    maxAttempts: record.max_attempts ?? record.maxAttempts ?? 5,
    nextRetryAt: record.next_retry_at || record.nextRetryAt,
    lastError: record.last_error ?? record.lastError ?? null,
    externalRowId: record.external_row_id ?? record.externalRowId ?? null,
    createdAt: record.created_at || record.createdAt,
    updatedAt: record.updated_at || record.updatedAt,
    syncedAt: record.synced_at ?? record.syncedAt ?? null,
  };
}

export function isSyncEventStatus(val: unknown): val is SyncEventStatus {
  return (
    typeof val === 'string' &&
    ['pending', 'processing', 'synced', 'failed', 'dead_letter'].includes(val)
  );
}
