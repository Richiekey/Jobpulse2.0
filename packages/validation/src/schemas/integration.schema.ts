import { z } from 'zod';

export const IntegrationProviderSchema = z.enum([
  'google_sheets',
  'google_drive',
  'notion',
  'airtable',
]);

export const ConnectGoogleOAuthQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  redirectTarget: z.string().trim().max(200).optional(),
});

export const GoogleOAuthCallbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code is required').optional(),
  state: z.string().min(1, 'State parameter is required').optional(),
  error: z.string().optional(),
});

export const SelectSpreadsheetSchema = z.object({
  spreadsheetId: z
    .string()
    .trim()
    .min(5, 'Invalid spreadsheet ID')
    .max(100, 'Invalid spreadsheet ID'),
  spreadsheetName: z.string().trim().min(1).max(200).optional(),
  sheetName: z.string().trim().min(1).max(100).default('Sheet1'),
  organizationId: z.string().uuid().optional().nullable(),
  initializeHeaders: z.boolean().default(true),
});

export const DisconnectIntegrationSchema = z.object({
  provider: IntegrationProviderSchema.default('google_sheets'),
  organizationId: z.string().uuid().optional().nullable(),
});

export const GetIntegrationStatusQuerySchema = z.object({
  provider: IntegrationProviderSchema.default('google_sheets'),
  organizationId: z.string().uuid().optional().nullable(),
});

export type IntegrationProviderType = z.infer<typeof IntegrationProviderSchema>;
export type ConnectGoogleOAuthQuery = z.infer<typeof ConnectGoogleOAuthQuerySchema>;
export type GoogleOAuthCallbackQuery = z.infer<typeof GoogleOAuthCallbackQuerySchema>;
export type SelectSpreadsheetInput = z.infer<typeof SelectSpreadsheetSchema>;
export type DisconnectIntegrationInput = z.infer<typeof DisconnectIntegrationSchema>;
export type GetIntegrationStatusQuery = z.infer<typeof GetIntegrationStatusQuerySchema>;
