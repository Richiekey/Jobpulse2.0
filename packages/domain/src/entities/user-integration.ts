export type IntegrationProvider = 'google_sheets' | 'google_drive' | 'notion' | 'airtable';

export interface GoogleSheetsConfig {
  spreadsheetId?: string;
  spreadsheetName?: string;
  sheetName?: string;
  googleEmail?: string;
  connectedAt?: string;
  scopes?: string[];
  autoHeaderInitialized?: boolean;
  [key: string]: unknown;
}

export interface UserIntegrationRecord {
  id: string;
  userId: string;
  organizationId: string | null;
  provider: IntegrationProvider;
  config: GoogleSheetsConfig;
  isActive: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationSecretRecord {
  id: string;
  integrationId: string;
  encryptedRefreshToken: string;
  tokenIv: string;
  tokenAuthTag: string;
  tokenExpiresAt: string | null;
  keyVersion: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sanitized client-safe summary of an integration that never exposes encrypted tokens or keys.
 */
export interface PublicIntegrationSummary {
  id: string;
  provider: IntegrationProvider;
  organizationId: string | null;
  isActive: boolean;
  config: GoogleSheetsConfig;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Strips sensitive cryptographic token columns from raw database records.
 */
export function sanitizeIntegrationRecord(record: {
  id: string;
  user_id?: string;
  userId?: string;
  organization_id?: string | null;
  organizationId?: string | null;
  provider: string;
  config: unknown;
  is_active?: boolean;
  isActive?: boolean;
  token_expires_at?: string | null;
  tokenExpiresAt?: string | null;
  last_synced_at?: string | null;
  lastSyncedAt?: string | null;
  last_error?: string | null;
  lastError?: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}): PublicIntegrationSummary {
  const config = (record.config && typeof record.config === 'object' ? record.config : {}) as GoogleSheetsConfig;

  return {
    id: record.id,
    provider: record.provider as IntegrationProvider,
    organizationId: record.organization_id !== undefined ? record.organization_id : (record.organizationId ?? null),
    isActive: record.is_active !== undefined ? record.is_active : (record.isActive ?? true),
    config: {
      spreadsheetId: config.spreadsheetId,
      spreadsheetName: config.spreadsheetName,
      sheetName: config.sheetName,
      googleEmail: config.googleEmail,
      connectedAt: config.connectedAt,
      autoHeaderInitialized: config.autoHeaderInitialized,
    },
    lastSyncedAt: record.last_synced_at !== undefined ? record.last_synced_at : (record.lastSyncedAt ?? null),
    lastError: record.last_error !== undefined ? record.last_error : (record.lastError ?? null),
    createdAt: record.created_at || record.createdAt || new Date().toISOString(),
    updatedAt: record.updated_at || record.updatedAt || new Date().toISOString(),
  };
}
