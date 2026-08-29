import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });
dotenv.config();

const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || 'https://rgwutmthzigjmzsmmjnp.supabase.co';
const supabaseKey =
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
  process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ||
  'sb_publishable_fp0_z8ClAdYAgU3eKwwm2g_EoRCz9qR';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
