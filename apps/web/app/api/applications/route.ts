import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const ApplicationSchema = z.object({
  jobId: z.string().uuid().optional().nullable(),
  companyName: z.string().trim().min(1).max(120),
  jobTitle: z.string().trim().min(1).max(150),
  status: z.enum(['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'archived']).default('applied'),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return ApiResponse.error('Unauthorized: Authentication required.', authError, 401);
    }

    const { data: applications, error: queryError } = await supabase
      .from('applications')
      .select('*')
      .eq('user_id', user.id)
      .order('applied_at', { ascending: false });

    if (queryError) {
      return ApiResponse.error('Failed to retrieve applications.', queryError, 500);
    }

    return ApiResponse.success(applications || []);
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
    const parseResult = ApplicationSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid application data: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { jobId, companyName, jobTitle, status, notes } = parseResult.data;

    const { data, error: insertError } = await supabase
      .from('applications')
      .upsert({
        user_id: user.id,
        job_id: jobId || null,
        company_name: companyName,
        job_title: jobTitle,
        status,
        notes: notes || null,
        applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (insertError) {
      return ApiResponse.error('Failed to record application.', insertError, 500);
    }

    return ApiResponse.success(data);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred.', err, 500);
  }
}
