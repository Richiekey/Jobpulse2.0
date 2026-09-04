import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const ApplicationSchema = z.object({
  jobId: z.string().uuid().optional().nullable(),
  companyName: z.string().trim().min(1).max(120),
  jobTitle: z.string().trim().min(1).max(150),
  status: z.enum(['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'archived']).default('applied'),
  notes: z.string().max(2000).optional().nullable(),
  organizationId: z.string().uuid().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const organizationId = searchParams.get('organizationId');

    let query = supabase.from('applications').select('*');

    if (organizationId) {
      // Check if user is admin or member of this organization
      const orgCheck = await AuthGuard.requireOrgMember(organizationId);
      if ('errorResponse' in orgCheck) {
        return orgCheck.errorResponse;
      }

      query = query.eq('organization_id', organizationId);
      // If caller is worker (not owner/admin), restrict to their own applications
      if (orgCheck.membership.role === 'worker') {
        query = query.eq('user_id', user.id);
      }
    } else {
      // Personal mode: only caller's own applications
      query = query.eq('user_id', user.id);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    query = query.order('applied_at', { ascending: false });

    const { data: applications, error: queryError } = await query;

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
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = ApplicationSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid application data: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { jobId, companyName, jobTitle, status, notes, organizationId } = parseResult.data;

    if (organizationId) {
      const orgCheck = await AuthGuard.requireOrgMember(organizationId);
      if ('errorResponse' in orgCheck) {
        return orgCheck.errorResponse;
      }
    }

    const insertPayload: Record<string, any> = {
      user_id: user.id,
      job_id: jobId || null,
      company_name: companyName,
      job_title: jobTitle,
      status,
      notes: notes || null,
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (organizationId) {
      insertPayload.organization_id = organizationId;
      insertPayload.worker_id = user.id;
    }

    const { data, error: insertError } = await supabase
      .from('applications')
      .upsert(
        insertPayload,
        jobId ? { onConflict: 'user_id, job_id' } : undefined
      )
      .select('*')
      .single();

    if (insertError) {
      return ApiResponse.error('Failed to record application.', insertError, 500);
    }

    return ApiResponse.success(data, undefined, { status: 201 });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred.', err, 500);
  }
}
