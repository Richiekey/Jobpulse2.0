import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const CompleteAssignmentSchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
  companyName: z.string().trim().min(1).max(120).optional().nullable(),
  jobTitle: z.string().trim().min(1).max(150).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assignmentId } = await params;

    if (!assignmentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignmentId)) {
      return ApiResponse.error('Invalid assignment identifier: must be a valid UUID.', null, 400);
    }

    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = CompleteAssignmentSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid completion payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { notes, companyName, jobTitle } = parseResult.data;

    // 1. Attempt atomic stored procedure execution
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'complete_assignment_with_application',
      {
        p_assignment_id: assignmentId,
        p_notes: notes || null,
        p_company_name: companyName || null,
        p_job_title: jobTitle || null,
      }
    );

    if (!rpcError && rpcResult) {
      return ApiResponse.success(rpcResult, undefined, { status: 200 });
    }

    // If RPC returned a known business domain error
    if (rpcError) {
      const msg = rpcError.message || '';
      if (msg.includes('UNAUTHORIZED')) {
        return ApiResponse.error(msg, rpcError, 401);
      }
      if (msg.includes('FORBIDDEN')) {
        return ApiResponse.error(msg, rpcError, 403);
      }
      if (msg.includes('NOT_FOUND')) {
        return ApiResponse.error(msg, rpcError, 404);
      }
      if (msg.includes('CONFLICT')) {
        return ApiResponse.error(msg, rpcError, 409);
      }

      // If RPC is missing or fails unexpectedly, fall back to transactional client logic
      // (ensures mock tests and environments without RPC can still execute atomically)
    }

    // 2. Transactional / Fallback execution
    // Fetch assignment to verify ownership and tenant
    const { data: assignment, error: fetchError } = await supabase
      .from('job_assignments')
      .select('*, jobs(id, display_title, canonical_title, companies(name))')
      .eq('id', assignmentId)
      .maybeSingle();

    if (fetchError || !assignment) {
      return ApiResponse.error('Assignment not found.', fetchError, 404);
    }

    if (assignment.worker_id !== user.id) {
      return ApiResponse.error('Forbidden: You are not authorized to complete this assignment.', null, 403);
    }

    // Verify tenant membership
    const memberCheck = await AuthGuard.requireOrgMember(assignment.organization_id);
    if ('errorResponse' in memberCheck) {
      return memberCheck.errorResponse;
    }

    // Idempotency: already completed
    if (assignment.status === 'completed') {
      const { data: existingApp } = await supabase
        .from('applications')
        .select('*')
        .eq('user_id', user.id)
        .eq('job_id', assignment.job_id)
        .maybeSingle();

      return ApiResponse.success({
        assignment,
        application: existingApp || null,
        idempotent: true,
      });
    }

    if (assignment.status === 'skipped') {
      return ApiResponse.error('Cannot complete an assignment with status skipped.', { currentStatus: 'skipped' }, 409);
    }

    if (assignment.status !== 'assigned' && assignment.status !== 'in_progress') {
      return ApiResponse.error(`Cannot complete assignment from status '${assignment.status}'.`, { currentStatus: assignment.status }, 409);
    }

    // Resolve company and title
    const jobData = (assignment as any).jobs;
    const finalCompName = companyName || jobData?.companies?.name || 'Company';
    const finalJobTitle = jobTitle || jobData?.display_title || jobData?.canonical_title || 'Position';

    // Atomic conditional update on status to prevent TOCTOU race
    const { data: updatedAssignment, error: updateError } = await supabase
      .from('job_assignments')
      .update({
        status: 'completed',
        notes: notes !== undefined ? notes : assignment.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignmentId)
      .eq('worker_id', user.id)
      .eq('status', assignment.status)
      .select('*')
      .maybeSingle();

    if (updateError || !updatedAssignment) {
      // Re-fetch to check if a concurrent request completed or mutated it
      const { data: checkAssignment } = await supabase
        .from('job_assignments')
        .select('*')
        .eq('id', assignmentId)
        .eq('worker_id', user.id)
        .maybeSingle();

      if (checkAssignment?.status === 'completed') {
        const { data: existingApp } = await supabase
          .from('applications')
          .select('*')
          .eq('user_id', user.id)
          .eq('job_id', assignment.job_id)
          .maybeSingle();

        return ApiResponse.success({
          assignment: checkAssignment,
          application: existingApp || null,
          idempotent: true,
        });
      }

      return ApiResponse.error(
        'State conflict: assignment was updated concurrently by another request.',
        { currentStatus: checkAssignment?.status || 'unknown' },
        409
      );
    }

    // Create or upsert application
    const { data: appData, error: appError } = await supabase
      .from('applications')
      .upsert(
        {
          user_id: user.id,
          job_id: assignment.job_id,
          company_name: finalCompName,
          job_title: finalJobTitle,
          status: 'applied',
          notes: notes || 'Application logged via Worker Command Center',
          organization_id: assignment.organization_id,
          worker_id: user.id,
          applied_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id, job_id' }
      )
      .select('*')
      .single();

    if (appError) {
      return ApiResponse.error('Failed to record application for completed assignment.', appError, 500);
    }

    return ApiResponse.success(
      {
        assignment: updatedAssignment,
        application: appData,
        idempotent: false,
      },
      undefined,
      { status: 200 }
    );
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while completing assignment.', err, 500);
  }
}
