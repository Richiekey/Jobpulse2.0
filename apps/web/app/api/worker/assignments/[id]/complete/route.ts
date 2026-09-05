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

    // -------------------------------------------------------------------------
    // Authoritative Single-Transaction Atomic Execution (P-H01)
    // -------------------------------------------------------------------------
    // The complete_assignment_with_application RPC locks the assignment row,
    // verifies worker ownership, validates the FSM transition, upserts the application,
    // fires application event + sync event triggers, and commits atomically.
    // If any step fails, PostgreSQL rolls back the entire transaction.
    // No non-atomic fallback is permitted.
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'complete_assignment_with_application',
      {
        p_assignment_id: assignmentId,
        p_notes: notes || null,
        p_company_name: companyName || null,
        p_job_title: jobTitle || null,
      }
    );

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

      // Operational diagnostic logging
      console.error(`[COMPLETE_ASSIGNMENT_RPC_FAILURE] Worker: ${user.id}, Assignment: ${assignmentId}`, rpcError);

      return ApiResponse.error(
        `Failed to complete assignment atomically: ${msg || 'Internal transaction error'}`,
        rpcError,
        500
      );
    }

    if (!rpcResult) {
      return ApiResponse.error('Atomic completion returned empty response.', null, 500);
    }

    return ApiResponse.success(rpcResult, undefined, { status: 200 });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while completing assignment.', err, 500);
  }
}
