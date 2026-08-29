import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] || 'https://rgwutmthzigjmzsmmjnp.supabase.co',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || 'sb_publishable_fp0_z8ClAdYAgU3eKwwm2g_EoRCz9qR'
  );
}
