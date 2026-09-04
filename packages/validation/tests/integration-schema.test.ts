import { describe, it, expect } from 'vitest';
import {
  ConnectGoogleOAuthQuerySchema,
  GoogleOAuthCallbackQuerySchema,
  SelectSpreadsheetSchema,
  DisconnectIntegrationSchema,
  GetIntegrationStatusQuerySchema,
} from '../src/schemas/integration.schema.js';

describe('Integration Validation Schemas (Batch N)', () => {
  describe('ConnectGoogleOAuthQuerySchema', () => {
    it('accepts empty parameters', () => {
      const parsed = ConnectGoogleOAuthQuerySchema.parse({});
      expect(parsed.organizationId).toBeUndefined();
    });

    it('accepts valid UUID organizationId', () => {
      const parsed = ConnectGoogleOAuthQuerySchema.parse({
        organizationId: '11111111-2222-3333-4444-555555555555',
        redirectTarget: '/worker/integrations',
      });
      expect(parsed.organizationId).toBe('11111111-2222-3333-4444-555555555555');
      expect(parsed.redirectTarget).toBe('/worker/integrations');
    });

    it('rejects invalid UUID organizationId', () => {
      expect(() =>
        ConnectGoogleOAuthQuerySchema.parse({ organizationId: 'not-a-uuid' })
      ).toThrow();
    });
  });

  describe('GoogleOAuthCallbackQuerySchema', () => {
    it('accepts valid code and state', () => {
      const parsed = GoogleOAuthCallbackQuerySchema.parse({
        code: '4/0AVMBs_mock_auth_code_123',
        state: 'signed_state_token_123',
      });
      expect(parsed.code).toBe('4/0AVMBs_mock_auth_code_123');
      expect(parsed.state).toBe('signed_state_token_123');
    });

    it('accepts error from Google OAuth denial', () => {
      const parsed = GoogleOAuthCallbackQuerySchema.parse({
        error: 'access_denied',
      });
      expect(parsed.error).toBe('access_denied');
    });
  });

  describe('SelectSpreadsheetSchema', () => {
    it('accepts valid spreadsheet input and applies defaults', () => {
      const parsed = SelectSpreadsheetSchema.parse({
        spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        spreadsheetName: 'My Applications Tracker',
      });
      expect(parsed.sheetName).toBe('Sheet1');
      expect(parsed.initializeHeaders).toBe(true);
    });

    it('rejects short/empty spreadsheet ID', () => {
      expect(() =>
        SelectSpreadsheetSchema.parse({ spreadsheetId: 'abc' })
      ).toThrow();
    });
  });

  describe('DisconnectIntegrationSchema', () => {
    it('defaults provider to google_sheets', () => {
      const parsed = DisconnectIntegrationSchema.parse({});
      expect(parsed.provider).toBe('google_sheets');
    });

    it('accepts organizationId', () => {
      const parsed = DisconnectIntegrationSchema.parse({
        provider: 'google_sheets',
        organizationId: '11111111-2222-3333-4444-555555555555',
      });
      expect(parsed.organizationId).toBe('11111111-2222-3333-4444-555555555555');
    });
  });

  describe('GetIntegrationStatusQuerySchema', () => {
    it('validates provider and org scope', () => {
      const parsed = GetIntegrationStatusQuerySchema.parse({
        provider: 'google_sheets',
      });
      expect(parsed.provider).toBe('google_sheets');
      expect(parsed.organizationId).toBeUndefined();
    });
  });
});
