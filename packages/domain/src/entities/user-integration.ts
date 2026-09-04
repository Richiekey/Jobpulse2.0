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

export interface ReconciliationAnomaly {
  code: 'MISSING_SECRET' | 'ORPHAN_SECRET' | 'DUPLICATE_SECRET' | 'MALFORMED_PARENT';
  message: string;
  integrationId?: string;
  secretId?: string;
}

/**
 * Validates record-by-record database reconciliation between user_integrations and integration_secrets.
 * Asserts:
 * 1. Exact 1:1 foreign-key mapping for active google_sheets integrations.
 * 2. Absence of duplicate secrets per integration_id.
 * 3. Absence of orphan secrets without a parent integration.
 * 4. Valid parent tenant scope (must have valid user_id and provider).
 */
export function validateIntegrationReconciliation(
  integrations: Array<{
    id: string;
    user_id?: string;
    userId?: string;
    organization_id?: string | null;
    organizationId?: string | null;
    provider?: string;
    is_active?: boolean;
    isActive?: boolean;
  }>,
  secrets: Array<{
    id: string;
    integration_id?: string;
    integrationId?: string;
  }>
): { isValid: boolean; anomalies: ReconciliationAnomaly[] } {
  const anomalies: ReconciliationAnomaly[] = [];

  const secretCountsByIntegrationId = new Map<string, number>();
  for (const s of secrets) {
    const intId = s.integration_id || s.integrationId;
    if (intId) {
      secretCountsByIntegrationId.set(intId, (secretCountsByIntegrationId.get(intId) || 0) + 1);
    }
  }

  // Invariant 1: Every active google_sheets integration MUST have exactly one secret
  for (const int of integrations) {
    const isActive = int.is_active !== undefined ? int.is_active : (int.isActive ?? true);
    const provider = int.provider;
    if (isActive && provider === 'google_sheets') {
      const count = secretCountsByIntegrationId.get(int.id) || 0;
      if (count === 0) {
        anomalies.push({
          code: 'MISSING_SECRET',
          message: `Reconciliation failure: Active integration ${int.id} lacks corresponding integration_secrets record.`,
          integrationId: int.id,
        });
      }
    }
  }

  // Invariant 2: No duplicate secrets per integration_id
  for (const [intId, count] of secretCountsByIntegrationId.entries()) {
    if (count > 1) {
      anomalies.push({
        code: 'DUPLICATE_SECRET',
        message: `Reconciliation failure: Found ${count} duplicate secrets for integration ${intId}.`,
        integrationId: intId,
      });
    }
  }

  // Invariant 3: No orphan secrets without parent integration
  const integrationMap = new Map<string, any>(integrations.map((i) => [i.id, i]));
  for (const s of secrets) {
    const intId = s.integration_id || s.integrationId;
    if (!intId || !integrationMap.has(intId)) {
      anomalies.push({
        code: 'ORPHAN_SECRET',
        message: `Reconciliation failure: Orphan integration_secrets record ${s.id} has no matching parent integration.`,
        secretId: s.id,
        integrationId: intId,
      });
    }
  }

  // Invariant 4: Valid parent tenant scope
  for (const s of secrets) {
    const intId = s.integration_id || s.integrationId;
    if (intId && integrationMap.has(intId)) {
      const parent = integrationMap.get(intId)!;
      const uId = parent.user_id || parent.userId;
      const prov = parent.provider;
      if (!uId || !prov) {
        anomalies.push({
          code: 'MALFORMED_PARENT',
          message: `Reconciliation failure: Secret ${s.id} has malformed parent integration ${intId}.`,
          secretId: s.id,
          integrationId: intId,
        });
      }
    }
  }

  return {
    isValid: anomalies.length === 0,
    anomalies,
  };
}
