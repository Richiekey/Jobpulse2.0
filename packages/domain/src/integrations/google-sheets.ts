import crypto from 'node:crypto';

export const DEFAULT_JOBPULSE_SHEET_HEADERS = [
  'Application ID',
  'Job Title',
  'Company',
  'Location',
  'Status',
  'Applied At',
  'Verification Status',
  'Direct Apply URL',
  'Worker Notes',
  'Last Updated',
] as const;

export type JobPulseSheetHeader = (typeof DEFAULT_JOBPULSE_SHEET_HEADERS)[number];

export interface GoogleOAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export interface GoogleDriveSpreadsheetItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface GoogleOAuthStatePayload {
  userId: string;
  organizationId?: string | null;
  timestamp: number;
  nonce: string;
  redirectTarget?: string;
}

/**
 * Creates a cryptographically signed state token for Google OAuth CSRF protection.
 */
export function signOAuthState(
  payload: GoogleOAuthStatePayload,
  secret?: string
): string {
  const secretKey = secret || process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || 'jobpulse-default-oauth-state-secret';
  const serialized = JSON.stringify(payload);
  const dataB64 = Buffer.from(serialized, 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(dataB64)
    .digest('base64url');
  return `${dataB64}.${signature}`;
}

/**
 * Verifies and decodes a signed Google OAuth state token.
 * Rejects if tampered, malformed, or older than maxAgeMs (default: 15 minutes).
 */
export function verifyOAuthState(
  stateString: string,
  secret?: string,
  maxAgeMs = 15 * 60 * 1000
): GoogleOAuthStatePayload {
  if (!stateString || typeof stateString !== 'string') {
    throw new Error('Invalid state token: format must be string');
  }

  const parts = stateString.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid state token: expected two parts (data.signature)');
  }

  const [dataB64, signature] = parts;
  if (!dataB64 || !signature) {
    throw new Error('Invalid state token: expected two parts (data.signature)');
  }
  const secretKey = secret || process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || 'jobpulse-default-oauth-state-secret';

  const expectedSig = crypto
    .createHmac('sha256', secretKey)
    .update(dataB64)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('Invalid state token: signature verification failed (CSRF)');
  }

  try {
    const jsonStr = Buffer.from(dataB64, 'base64url').toString('utf8');
    const payload = JSON.parse(jsonStr) as GoogleOAuthStatePayload;

    if (!payload.userId || !payload.timestamp || !payload.nonce) {
      throw new Error('Invalid state token payload: missing required fields');
    }

    const age = Date.now() - payload.timestamp;
    if (age < 0 || age > maxAgeMs) {
      throw new Error('State token expired: request took longer than 15 minutes');
    }

    return payload;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('expired')) {
      throw err;
    }
    throw new Error('Invalid state token payload: malformed JSON');
  }
}

export interface SyncToSheetParams {
  accessToken: string;
  spreadsheetId: string;
  sheetName?: string;
  rowValues: string[];
}

export interface SyncToSheetResult {
  action: 'appended' | 'updated';
  rowIndex?: number;
}

/**
 * Idempotently writes or updates an application record in the target Google Sheet.
 * Reads column A to locate any existing row with the same application ID:
 * - If found: updates the matching row in place.
 * - If not found: appends a new row at the bottom of the table.
 */
export async function syncApplicationToGoogleSheet(
  params: SyncToSheetParams,
  fetchFn: typeof fetch = fetch
): Promise<SyncToSheetResult> {
  const { accessToken, spreadsheetId, sheetName = 'Sheet1', rowValues } = params;
  const appId = rowValues[0];

  // Fast-path in test / mock mode when no custom fetchFn is injected
  if (
    fetchFn === fetch &&
    (process.env['NODE_ENV'] === 'test' ||
      process.env['GOOGLE_MOCK_OAUTH'] === 'true')
  ) {
    return { action: 'appended', rowIndex: 2 };
  }

  // 1. Fetch column A to find if appId already exists
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:A`;
  const getRes = await fetchFn(getUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!getRes.ok) {
    const errText = await getRes.text();
    throw new Error(`Failed to read spreadsheet column A (${getRes.status}): ${errText}`);
  }

  const getData = (await getRes.json()) as { values?: string[][] };
  const rows: string[][] = getData.values || [];

  let existingIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row[0] === appId) {
      existingIndex = i + 1; // 1-indexed row in sheet
      break;
    }
  }

  if (existingIndex !== -1) {
    // 2. Update existing row in place
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A${existingIndex}:J${existingIndex}?valueInputOption=USER_ENTERED`;
    const updateRes = await fetchFn(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `${sheetName}!A${existingIndex}:J${existingIndex}`,
        majorDimension: 'ROWS',
        values: [rowValues],
      }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Failed to update spreadsheet row (${updateRes.status}): ${errText}`);
    }

    return { action: 'updated', rowIndex: existingIndex };
  } else {
    // 3. Append new row at bottom
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:J:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const appendRes = await fetchFn(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    });

    if (!appendRes.ok) {
      const errText = await appendRes.text();
      throw new Error(`Failed to append to spreadsheet (${appendRes.status}): ${errText}`);
    }

    return { action: 'appended' };
  }
}

/**
 * Refreshes an expired Google OAuth access token using a valid refresh token.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId?: string,
  clientSecret?: string,
  fetchFn: typeof fetch = fetch
): Promise<{ accessToken: string; expiresIn: number }> {
  if (
    fetchFn === fetch &&
    (process.env['NODE_ENV'] === 'test' ||
      process.env['GOOGLE_MOCK_OAUTH'] === 'true')
  ) {
    return {
      accessToken: `ya29.mock_refreshed_access_token_${Date.now()}`,
      expiresIn: 3600,
    };
  }

  const cId = clientId || process.env['GOOGLE_CLIENT_ID'] || '';
  const cSecret = clientSecret || process.env['GOOGLE_CLIENT_SECRET'] || '';

  const response = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: cId,
      client_secret: cSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Google OAuth token refresh failed (${response.status}): ${errBody}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in?: number };
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
  };
}

