import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { CreateJobAssignmentSchema } from '@jobpulse/validation';
import { AssignmentLifecycleService } from '@jobpulse/domain';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
      return ApiResponse.error('Invalid or missing organizationId query parameter.', null, 400);
    }

    const authResult = await AuthGuard.requireOrgAdmin(organizationId);
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase } = authResult;
    const workerId = searchParams.get('workerId');
    const jobId = searchParams.get('jobId');
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
          apply_url,
          canonical_url,
          companies (
            id,
            name,
            logo_url
          )
        )
      `)
      .eq('organization_id', organizationId);

    if (workerId) {
      query = query.eq('worker_id', workerId);
    }
    if (jobId) {
      query = query.eq('job_id', jobId);
    }
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    query = query.order('created_at', { ascending: false });

    const { data: assignments, error: queryError } = await query;

    if (queryError) {
      return ApiResponse.error('Failed to retrieve organization assignments.', queryError, 500);
    }

    // Fetch worker profiles separately (RLS blocks cross-user profile joins)
    const workerIds = [...new Set((assignments || []).map((a: any) => a.worker_id).filter(Boolean))];
    let workerProfilesMap = new Map<string, any>();
    if (workerIds.length > 0) {
      const { data: workerProfiles } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .in('id', workerIds);
      for (const p of workerProfiles || []) {
        workerProfilesMap.set(p.id, p);
      }
    }

    const formatted = (assignments || []).map((a: any) => {
      const workerProfile = workerProfilesMap.get(a.worker_id);
      return {
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
          applyUrl: a.jobs.apply_url,
          canonicalUrl: a.jobs.canonical_url,
          company: a.jobs.companies ? {
            id: a.jobs.companies.id,
            name: a.jobs.companies.name,
            logoUrl: a.jobs.companies.logo_url,
          } : null,
        } : null,
        worker: workerProfile ? {
          id: workerProfile.id,
          email: workerProfile.email,
          fullName: workerProfile.full_name,
          avatarUrl: workerProfile.avatar_url,
        } : null,
      };
    });

    return ApiResponse.success(formatted);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while listing assignments.', err, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = CreateJobAssignmentSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid assignment payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { organizationId, jobId, jobFunctionSlug, workerId, deadlineAt, notes } = parseResult.data;

    // Verify caller is admin of this organization
    const authResult = await AuthGuard.requireOrgAdmin(organizationId);
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    // Verify worker belongs to this organization
    const { data: workerMembership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', workerId)
      .maybeSingle();

    if (!workerMembership) {
      return ApiResponse.error('The target worker is not a member of this organization.', null, 400);
    }

    // For job-specific dispatches, verify the job exists
    if (jobId) {
      const { data: job } = await supabase
        .from('jobs')
        .select('id')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) {
        return ApiResponse.error('The specified job was not found.', null, 404);
      }
    }

    // Check for existing assignment
    let existingQuery = supabase
      .from('job_assignments')
      .select('id, status, deadline_at, notes')
      .eq('organization_id', organizationId)
      .eq('worker_id', workerId);

    if (jobId) {
      existingQuery = existingQuery.eq('job_id', jobId);
    } else if (jobFunctionSlug) {
      existingQuery = existingQuery.eq('job_function_slug', jobFunctionSlug).is('job_id', null);
    }

    const { data: existingAssignment } = await existingQuery.maybeSingle();

    if (!existingAssignment) {
      // 1. No existing assignment: create with status 'assigned'
      const insertPayload: Record<string, any> = {
        organization_id: organizationId,
        worker_id: workerId,
        assigned_by: user.id,
        status: 'assigned',
        deadline_at: deadlineAt || null,
        notes: notes || null,
      };
      if (jobId) insertPayload.job_id = jobId;
      if (jobFunctionSlug) insertPayload.job_function_slug = jobFunctionSlug;

      const { data: assignment, error: insertError } = await supabase
        .from('job_assignments')
        .insert(insertPayload)
        .select('*')
        .single();

      if (insertError) {
        return ApiResponse.error('Failed to dispatch job assignment.', insertError, 500);
      }

      return ApiResponse.success(assignment, undefined, { status: 201 });
    }

    // 2. Existing terminal assignment: reject re-dispatch to prevent resetting terminal records
    if (AssignmentLifecycleService.isTerminal(existingAssignment.status)) {
      return ApiResponse.error(
        `Cannot re-dispatch: Assignment is in terminal state '${existingAssignment.status}' and cannot be reset to assigned.`,
        null,
        409
      );
    }

    // 3. Existing active assignment: update metadata without resetting status
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (deadlineAt !== undefined) updatePayload.deadline_at = deadlineAt || null;
    if (notes !== undefined) updatePayload.notes = notes || null;

    const { data: updatedAssignment, error: updateError } = await supabase
      .from('job_assignments')
      .update(updatePayload)
      .eq('id', existingAssignment.id)
      .select('*')
      .single();

    if (updateError) {
      return ApiResponse.error('Failed to update existing assignment.', updateError, 500);
    }

    return ApiResponse.success(
      updatedAssignment,
      { message: 'Existing active assignment updated without status reset.' },
      { status: 200 }
    );
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while dispatching job assignment.', err, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('assignmentId');
    const organizationId = searchParams.get('organizationId');

    if (!assignmentId || !organizationId) {
      return ApiResponse.error('Both assignmentId and organizationId query parameters are required.', null, 400);
    }

    const authResult = await AuthGuard.requireOrgAdmin(organizationId);
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase } = authResult;

    // Fetch existing assignment to verify existence and enforce lifecycle invariants
    const { data: existingAssignment, error: findError } = await supabase
      .from('job_assignments')
      .select('id, status, organization_id, worker_id, job_id, notes')
      .eq('id', assignmentId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (findError) {
      return ApiResponse.error('Database query error while verifying assignment.', findError, 500);
    }

    if (!existingAssignment) {
      return ApiResponse.error('Assignment not found in this organization.', null, 404);
    }

    // Terminal state invariants (Q-H02)
    if (existingAssignment.status === 'completed') {
      return ApiResponse.error('Cannot cancel a completed assignment: terminal state reached.', null, 400);
    }

    if (existingAssignment.status === 'skipped') {
      return ApiResponse.error('Cannot cancel a skipped assignment: terminal state reached.', null, 400);
    }

    if (existingAssignment.status === 'cancelled') {
      return ApiResponse.error('Assignment is already cancelled.', null, 400);
    }

    // Non-destructive transition to 'cancelled': preserves row, timestamps, notes, and triggers audit event
    const { data: updated, error: updateError } = await supabase
      .from('job_assignments')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignmentId)
      .eq('organization_id', organizationId)
      .select('*')
      .single();

    if (updateError) {
      return ApiResponse.error('Failed to cancel job assignment.', updateError, 500);
    }

    return ApiResponse.success({ cancelled: true, assignment: updated });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while cancelling assignment.', err, 500);
  }
}
