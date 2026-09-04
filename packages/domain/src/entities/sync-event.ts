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
  nextRetryAt: string;
  lastError: string | null;
  payload: SyncEventPayload;
  externalRowId: string | null;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function isSyncEventStatus(val: unknown): val is SyncEventStatus {
  return (
    typeof val === 'string' &&
    ['pending', 'processing', 'synced', 'failed', 'dead_letter'].includes(val)
  );
}
