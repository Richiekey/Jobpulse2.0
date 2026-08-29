import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const SaveJobSchema = z.object({
  jobId: z.string().uuid(),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return ApiResponse.error('Unauthorized: Authentication required.', authError, 401);
    }

    const { data: savedJobs, error: queryError } = await supabase
      .from('saved_jobs')
      .select(`
        id,
        created_at,
        jobs (
          id,
          display_title,
          canonical_title,
          description,
          employment_type,
          workplace_type,
          locations,
          salary_min,
          salary_max,
          salary_currency,
          posted_at,
          apply_url,
          canonical_url,
          companies (
            id,
            name,
            logo_url,
            website
          )
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (queryError) {
      return ApiResponse.error('Failed to retrieve saved jobs.', queryError, 500);
    }

    return ApiResponse.success(savedJobs || []);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred.', err, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return ApiResponse.error('Unauthorized: Authentication required.', authError, 401);
    }

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = SaveJobSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error('Invalid request body: jobId must be a valid UUID.', parseResult.error, 400);
    }

    const { jobId } = parseResult.data;

    const { data, error: insertError } = await supabase
      .from('saved_jobs')
      .upsert(
        {
          user_id: user.id,
          job_id: jobId,
        },
        { onConflict: 'user_id, job_id' }
      )
      .select('id')
      .single();

    if (insertError) {
      return ApiResponse.error('Failed to save job.', insertError, 500);
    }

    return ApiResponse.success({ id: data.id, jobId, saved: true });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred.', err, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return ApiResponse.error('Unauthorized: Authentication required.', authError, 401);
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
      return ApiResponse.error('Invalid query parameter: jobId must be a valid UUID.', null, 400);
    }

    const { error: deleteError } = await supabase
      .from('saved_jobs')
      .delete()
      .eq('user_id', user.id)
      .eq('job_id', jobId);

    if (deleteError) {
      return ApiResponse.error('Failed to remove saved job.', deleteError, 500);
    }

    return ApiResponse.success({ jobId, removed: true });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred.', err, 500);
  }
}
