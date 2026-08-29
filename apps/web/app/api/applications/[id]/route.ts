import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const UpdateApplicationSchema = z.object({
  status: z.enum(['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'archived']).optional(),
  notes: z.string().max(2000).optional().nullable(),
  companyName: z.string().trim().min(1).max(120).optional(),
  jobTitle: z.string().trim().min(1).max(150).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    if (!applicationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId)) {
      return ApiResponse.error('Invalid application identifier: must be a valid UUID.', null, 400);
    }

    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = UpdateApplicationSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid update payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (parseResult.data.status !== undefined) updates.status = parseResult.data.status;
    if (parseResult.data.notes !== undefined) updates.notes = parseResult.data.notes;
    if (parseResult.data.companyName !== undefined) updates.company_name = parseResult.data.companyName;
    if (parseResult.data.jobTitle !== undefined) updates.job_title = parseResult.data.jobTitle;

    const { data: updated, error: updateError } = await supabase
      .from('applications')
      .update(updates)
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return ApiResponse.error('Application not found or unauthorized to modify.', updateError, 404);
    }

    return ApiResponse.success(updated);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while updating application.', err, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    if (!applicationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId)) {
      return ApiResponse.error('Invalid application identifier: must be a valid UUID.', null, 400);
    }

    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    const { error: deleteError } = await supabase
      .from('applications')
      .delete()
      .eq('id', applicationId)
      .eq('user_id', user.id);

    if (deleteError) {
      return ApiResponse.error('Failed to remove application record.', deleteError, 500);
    }

    return ApiResponse.success({ id: applicationId, deleted: true });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while deleting application.', err, 500);
  }
}
