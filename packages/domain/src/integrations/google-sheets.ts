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
