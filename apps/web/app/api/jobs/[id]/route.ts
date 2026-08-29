import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return ApiResponse.error('Invalid job ID: Must be a valid UUID.', null, 400);
    }

    const supabase = await createClient();

    const { data: job, error } = await supabase
      .from('jobs')
      .select(`
        *,
        companies (
          id,
          name,
          normalized_name,
          logo_url,
          website,
          careers_url,
          industry
        ),
        job_sources (
          id,
          source_id,
          discovery_url,
          source_job_url,
          first_seen_at,
          last_seen_at,
          sources (
            id,
            name,
            adapter_name,
            domain
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error || !job) {
      return ApiResponse.error('Job posting not found.', error, 404);
    }

    return ApiResponse.success(job);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred.', err, 500);
  }
}
