import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { AuthGuard } from '@/lib/auth-guard';

export async function GET() {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) return authResult.errorResponse;

    const supabase = await createClient();

    const { data: companies, error } = await supabase
      .from('companies')
      .select('id, name, normalized_name, logo_url, website, industry, status')
      .eq('status', 'active')
      .order('name', { ascending: true });

    if (error) {
      return ApiResponse.error('Failed to retrieve companies.', error, 500);
    }

    return ApiResponse.success(companies || []);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred.', err, 500);
  }
}
