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
        ),
        profiles:worker_id (
          id,
          email,
          full_name,
          avatar_url
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
        applyUrl: a.jobs.apply_url,
        canonicalUrl: a.jobs.canonical_url,
        company: a.jobs.companies ? {
          id: a.jobs.companies.id,
          name: a.jobs.companies.name,
          logoUrl: a.jobs.companies.logo_url,
        } : null,
      } : null,
      worker: a.profiles ? {
        id: a.profiles.id,
        email: a.profiles.email,
        fullName: a.profiles.full_name,
        avatarUrl: a.profiles.avatar_url,
      } : null,
    }));

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

    const { organizationId, jobId, workerId, deadlineAt, notes } = parseResult.data;

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

    // Verify target job exists
    const { data: job } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', jobId)
      .maybeSingle();

    if (!job) {
      return ApiResponse.error('The specified job was not found.', null, 404);
    }

    // Check if an assignment already exists for (organizationId, jobId, workerId)
    const { data: existingAssignment } = await supabase
      .from('job_assignments')
      .select('id, status, deadline_at, notes')
      .eq('organization_id', organizationId)
      .eq('job_id', jobId)
      .eq('worker_id', workerId)
      .maybeSingle();

    if (!existingAssignment) {
      // 1. No existing assignment: create with status 'assigned'
      const { data: assignment, error: insertError } = await supabase
        .from('job_assignments')
        .insert({
          organization_id: organizationId,
          job_id: jobId,
          worker_id: workerId,
          assigned_by: user.id,
          status: 'assigned',
          deadline_at: deadlineAt || null,
          notes: notes || null,
        })
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

    const { data: deleted, error: deleteError } = await supabase
      .from('job_assignments')
      .delete()
      .eq('id', assignmentId)
      .eq('organization_id', organizationId)
      .select('id');

    if (deleteError) {
      return ApiResponse.error('Failed to cancel job assignment.', deleteError, 500);
    }

    if (!deleted || deleted.length === 0) {
      return ApiResponse.error('Assignment not found in this organization.', null, 404);
    }

    return ApiResponse.success({ cancelled: true, assignmentId });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while cancelling assignment.', err, 500);
  }
}
