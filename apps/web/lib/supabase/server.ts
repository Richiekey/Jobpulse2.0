import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] || 'https://rgwutmthzigjmzsmmjnp.supabase.co',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || 'sb_publishable_fp0_z8ClAdYAgU3eKwwm2g_EoRCz9qR',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored if called from Server Component
          }
        },
      },
    }
  );
}
