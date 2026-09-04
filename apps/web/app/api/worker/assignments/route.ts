import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const status = searchParams.get('status');

    let query = supabase
      .from('job_assignments')
      .select(`
        id,
        organization_id,
        job_id,
        worker_id,
        assigned_by,
        status,
        deadline_at,
        notes,
        created_at,
        updated_at,
        jobs (
          id,
          canonical_title,
          display_title,
          locations,
          workplace_type,
          employment_type,
          apply_url,
          canonical_url,
          posted_at,
          companies (
            id,
            name,
            logo_url
          )
        )
      `)
      .eq('worker_id', user.id);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    query = query.order('created_at', { ascending: false });

    const { data: assignments, error: queryError } = await query;

    if (queryError) {
      return ApiResponse.error('Failed to retrieve worker assignments.', queryError, 500);
    }

    const formatted = (assignments || []).map((a: any) => ({
      id: a.id,
      organizationId: a.organization_id,
      jobId: a.job_id,
      workerId: a.worker_id,
      assignedBy: a.assigned_by,
      status: a.status,
      deadlineAt: a.deadline_at,
      notes: a.notes,
      assignedAt: a.created_at,
      updatedAt: a.updated_at,
      job: a.jobs ? {
        id: a.jobs.id,
        canonicalTitle: a.jobs.canonical_title,
        displayTitle: a.jobs.display_title,
        locations: a.jobs.locations,
        workplaceType: a.jobs.workplace_type,
        employmentType: a.jobs.employment_type,
        applyUrl: a.jobs.apply_url,
        canonicalUrl: a.jobs.canonical_url,
        postedAt: a.jobs.posted_at,
        company: a.jobs.companies ? {
          id: a.jobs.companies.id,
          name: a.jobs.companies.name,
          logoUrl: a.jobs.companies.logo_url,
        } : null,
      } : null,
    }));

    return ApiResponse.success(formatted);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while listing worker assignments.', err, 500);
  }
}
