import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { processSyncForApplication } from '../lib/sync-processor';
import { createAdminClient } from '../lib/supabase/admin';

async function main() {
  const supabase = createAdminClient();
  const { data: events } = await supabase.from('sync_events').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(1);
  const event = events?.[0];
  
  if (!event) throw new Error('No pending event');
  console.log('Testing sync for app:', event.application_id);
  
  const res = await processSyncForApplication(event.application_id, event.user_id);
  console.log('Result:', res);
}

main().catch(console.error);
