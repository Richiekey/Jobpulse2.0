import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });
dotenv.config();

const supabaseUrl = process.env['SUPABASE_URL'] || process.env['NEXT_PUBLIC_SUPABASE_URL'] || '';
const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_SECRET_KEY'] || '';
const workerSecretToken = process.env['WORKER_SECRET_TOKEN'] || '';

// Resolve WebSocket constructor: use native globalThis.WebSocket (Node 22+) or fall back to 'ws' package
let WsImpl: unknown = globalThis.WebSocket;
if (!WsImpl) {
  try {
    // Dynamic require to avoid bundler issues — ws is a devDependency
    WsImpl = require('ws');
  } catch {
    // If ws is not available and no native WebSocket, realtime will fail
    // but the worker doesn't use realtime subscriptions so this is acceptable
  }
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      'x-worker-token': workerSecretToken,
    },
  },
  realtime: {
    ...(WsImpl ? { transport: WsImpl as any } : {}),
  },
});
