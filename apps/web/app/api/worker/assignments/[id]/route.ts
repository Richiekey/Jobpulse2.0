import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { UpdateJobAssignmentStatusSchema } from '@jobpulse/validation';
import { AssignmentLifecycleService, type AssignmentStatus } from '@jobpulse/domain';

export async function PATCH(
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
    const parseResult = UpdateJobAssignmentStatusSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid status payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { status: targetStatus, notes } = parseResult.data;

    // Fetch existing assignment to verify ownership and validate transition
    const { data: existingAssignment, error: fetchError } = await supabase
      .from('job_assignments')
      .select('*')
      .eq('id', assignmentId)
      .eq('worker_id', user.id)
      .maybeSingle();

    if (fetchError || !existingAssignment) {
      return ApiResponse.error('Assignment not found or unauthorized to update.', fetchError, 404);
    }

    const currentStatus = existingAssignment.status as AssignmentStatus;

    // Check FSM validity for worker transitions
    if (!AssignmentLifecycleService.canWorkerTransition(currentStatus, targetStatus as AssignmentStatus)) {
      return ApiResponse.error(
        `Invalid status transition: cannot transition assignment from '${currentStatus}' to '${targetStatus}'.`,
        { currentStatus, targetStatus },
        400
      );
    }

    const updateData: Record<string, any> = {
      status: targetStatus,
      updated_at: new Date().toISOString(),
    };

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const { data: updated, error: updateError } = await supabase
      .from('job_assignments')
      .update(updateData)
      .eq('id', assignmentId)
      .eq('worker_id', user.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return ApiResponse.error('Failed to update assignment status.', updateError, 500);
    }

    return ApiResponse.success(updated);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while updating assignment.', err, 500);
  }
}
