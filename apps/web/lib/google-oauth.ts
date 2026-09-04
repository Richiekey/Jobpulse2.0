import { DEFAULT_JOBPULSE_SHEET_HEADERS, type GoogleDriveSpreadsheetItem } from '@jobpulse/domain';

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
  idToken?: string;
}

export class GoogleOAuthService {
  public static getClientId(): string {
    return process.env['GOOGLE_CLIENT_ID'] || 'mock-google-client-id';
  }

  public static getClientSecret(): string {
    return process.env['GOOGLE_CLIENT_SECRET'] || 'mock-google-client-secret';
  }

  public static getRedirectUri(): string {
    return (
      process.env['GOOGLE_REDIRECT_URI'] ||
      'http://localhost:3000/api/integrations/google/callback'
    );
  }

  public static getOAuthScopes(): string[] {
    return [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ];
  }

  /**
   * Constructs Google OAuth 2.0 authorization URL with offline access and consent prompt.
   */
  public static buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.getClientId(),
      redirect_uri: this.getRedirectUri(),
      response_type: 'code',
      scope: this.getOAuthScopes().join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   */
  public static async exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
    // In test environment or mock mode
    if (
      process.env['NODE_ENV'] === 'test' ||
      process.env['GOOGLE_MOCK_OAUTH'] === 'true'
    ) {
      if (code === 'invalid_code' || code === 'error_trigger') {
        throw new Error('Google OAuth token exchange failed: invalid_grant');
      }
      return {
        accessToken: `ya29.mock_access_token_${Date.now()}`,
        refreshToken: `1//0mock_refresh_token_${Date.now()}`,
        expiresIn: 3600,
        tokenType: 'Bearer',
        scope: this.getOAuthScopes().join(' '),
      };
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: this.getClientId(),
        client_secret: this.getClientSecret(),
        redirect_uri: this.getRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Google OAuth token exchange failed (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
      idToken: data.id_token,
    };
  }

  /**
   * Fetches the email address associated with the Google access token.
   */
  public static async fetchUserEmail(accessToken: string): Promise<string> {
    if (
      process.env['NODE_ENV'] === 'test' ||
      process.env['GOOGLE_MOCK_OAUTH'] === 'true'
    ) {
      return 'worker@jobpulse-demo.com';
    }

    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Google user info: HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.email || 'unknown-google-account';
  }

  /**
   * Refreshes an expired access token using the stored refresh token.
   */
  public static async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    if (
      process.env['NODE_ENV'] === 'test' ||
      process.env['GOOGLE_MOCK_OAUTH'] === 'true'
    ) {
      return {
        accessToken: `ya29.refreshed_access_token_${Date.now()}`,
        expiresIn: 3600,
      };
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.getClientId(),
        client_secret: this.getClientSecret(),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Failed to refresh Google token (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Revokes a Google OAuth token.
   */
  public static async revokeToken(token: string): Promise<boolean> {
    if (
      process.env['NODE_ENV'] === 'test' ||
      process.env['GOOGLE_MOCK_OAUTH'] === 'true'
    ) {
      return true;
    }

    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Lists Google Spreadsheets accessible by the user via Drive API.
   */
  public static async listSpreadsheets(
    accessToken: string
  ): Promise<GoogleDriveSpreadsheetItem[]> {
    if (
      process.env['NODE_ENV'] === 'test' ||
      process.env['GOOGLE_MOCK_OAUTH'] === 'true'
    ) {
      return [
        {
          id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          name: 'JobPulse Applications 2026',
          mimeType: 'application/vnd.google-apps.spreadsheet',
          modifiedTime: new Date().toISOString(),
          webViewLink:
            'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
        },
        {
          id: '1X_demo_org_shared_tracker_998877665544332211',
          name: 'TechCorp Workforce Outbound Tracker',
          mimeType: 'application/vnd.google-apps.spreadsheet',
          modifiedTime: new Date().toISOString(),
          webViewLink:
            'https://docs.google.com/spreadsheets/d/1X_demo_org_shared_tracker_998877665544332211/edit',
        },
      ];
    }

    const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,webViewLink)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=20`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to list Google Spreadsheets: ${err}`);
    }

    const data = await response.json();
    return data.files || [];
  }

  /**
   * Bootstraps standard JobPulse headers in the target sheet.
   */
  public static async initializeHeaders(
    accessToken: string,
    spreadsheetId: string,
    sheetName = 'Sheet1'
  ): Promise<boolean> {
    if (
      process.env['NODE_ENV'] === 'test' ||
      process.env['GOOGLE_MOCK_OAUTH'] === 'true'
    ) {
      return true;
    }

    const range = `${encodeURIComponent(sheetName)}!A1:J1`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values: [DEFAULT_JOBPULSE_SHEET_HEADERS],
      }),
    });

    return response.ok;
  }
}
