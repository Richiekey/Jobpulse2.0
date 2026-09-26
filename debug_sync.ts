import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './packages/domain/src/security/encryption';
import { GoogleOAuthService } from './apps/web/lib/google-oauth';
import { findMatchingResume } from './packages/domain/src/integrations/resume-discovery';
import { formatApplicationSheetRow } from './packages/domain/src/integrations/application-sync';
import { syncApplicationToGoogleSheet } from './packages/domain/src/integrations/google-sheets';

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase env vars');
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('Fetching pending event...');
  const { data: events } = await supabase.from('sync_events').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(1);
  const event = events?.[0];
  
  if (!event) throw new Error('Event not found');
  console.log('Event found:', event.id);

  console.log('Fetching integration...');
  const { data: integration } = await supabase.from('user_integrations').select('*').eq('id', event.integration_id).single();
  
  if (!integration) throw new Error('Integration not found');
  const config = integration.config;
  console.log('Integration config:', config);

  console.log('Fetching secrets...');
  const { data: secret } = await supabase.from('integration_secrets').select('*').eq('integration_id', event.integration_id).single();
  
  if (!secret) throw new Error('Secret not found');

  console.log('Decrypting token...');
  const aad = event.organization_id || event.user_id;
  const refreshToken = decryptToken(
    { ciphertext: secret.encrypted_refresh_token, iv: secret.token_iv, tag: secret.token_auth_tag },
    undefined,
    aad
  );
  
  console.log('Refreshing token...');
  const { accessToken } = await GoogleOAuthService.refreshAccessToken(refreshToken);
  
  console.log('Token refreshed successfully!');

  const payload = event.payload;

  if (config.resumeFolderId && config.applicantName && payload.companyName) {
    console.log(`Finding resume for ${payload.companyName}...`);
    try {
      const match = await findMatchingResume({
        accessToken,
        folderId: config.resumeFolderId,
        applicantName: config.applicantName,
        companyName: payload.companyName,
      });
      if (match?.webViewLink) {
        console.log('Found resume:', match.webViewLink);
        payload.resumeUrl = match.webViewLink;
      } else {
        console.log('Resume not found yet.');
      }
    } catch (err) {
      console.error('Error finding resume:', err);
    }
  }

  console.log('Formatting row and writing to sheet...');
  const rowValues = formatApplicationSheetRow(payload);
  const syncResult = await syncApplicationToGoogleSheet({
    accessToken,
    spreadsheetId: config.spreadsheetId,
    sheetName: config.sheetName || 'Sheet1',
    rowValues,
  });

  console.log('Sync result:', syncResult);
}

main().catch(console.error);
