import { createClient } from '@supabase/supabase-js';

/**
 * Creates an administrative Supabase client using the service role key.
 * This client bypasses Row Level Security and is strictly reserved for internal
 * backend operations (such as reading/writing isolated OAuth credential secrets in
 * public.integration_secrets).
 *
 * NEVER expose this client or its keys to frontend components or client-facing RPCs.
 */
export function createAdminClient() {
  const supabaseUrl =
    process.env['NEXT_PUBLIC_SUPABASE_URL'] || process.env['SUPABASE_URL'] || '';
  const serviceRoleKey =
    process.env['SUPABASE_SECRET_KEY'] || process.env['SUPABASE_SERVICE_ROLE_KEY'] || '';

  if (!supabaseUrl) {
    throw new Error('CRITICAL CONFIGURATION ERROR: Supabase URL is missing.');
  }

  if (!serviceRoleKey) {
    throw new Error('CRITICAL CONFIGURATION ERROR: Supabase service/secret key is missing.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
