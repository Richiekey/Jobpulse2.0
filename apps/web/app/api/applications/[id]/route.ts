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

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (parseResult.data.status !== undefined) updates.status = parseResult.data.status;
    if (parseResult.data.notes !== undefined) updates.notes = parseResult.data.notes;
    if (parseResult.data.companyName !== undefined) updates.company_name = parseResult.data.companyName;
    if (parseResult.data.jobTitle !== undefined) updates.job_title = parseResult.data.jobTitle;

    // Fetch application to verify existence and ownership
    const { data: existingApp, error: fetchError } = await supabase
      .from('applications')
      .select('id, user_id, organization_id, deleted_at')
      .eq('id', applicationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (fetchError) {
      return ApiResponse.error('Failed to query application.', fetchError, 500);
    }

    if (!existingApp) {
      return ApiResponse.error('Application not found or unauthorized to modify.', null, 404);
    }

    const isOwner = existingApp.user_id === user.id;

    if (organizationId) {
      if (!isOwner) {
        const orgCheck = await AuthGuard.requireOrgAdmin(organizationId);
        if ('errorResponse' in orgCheck) {
          return orgCheck.errorResponse;
        }
      }
    } else if (!isOwner) {
      return ApiResponse.error('Application not found or unauthorized to modify.', null, 404);
    }

    let updateQuery = supabase
      .from('applications')
      .update(updates)
      .eq('id', applicationId)
      .is('deleted_at', null);

    if (organizationId && !isOwner) {
      updateQuery = updateQuery.eq('organization_id', organizationId);
    } else {
      updateQuery = updateQuery.eq('user_id', user.id);
    }

    const { data: updated, error: updateError } = await updateQuery.select('*').single();

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
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (organizationId) {
      const orgCheck = await AuthGuard.requireOrgAdmin(organizationId);
      if ('errorResponse' in orgCheck) {
        return orgCheck.errorResponse;
      }
    }

    const now = new Date().toISOString();
    let deleteQuery = supabase
      .from('applications')
      .update({
        deleted_at: now,
        status: 'archived',
        updated_at: now,
      })
      .eq('id', applicationId)
      .is('deleted_at', null);

    if (organizationId) {
      deleteQuery = deleteQuery.eq('organization_id', organizationId);
    } else {
      deleteQuery = deleteQuery.eq('user_id', user.id);
    }

    const { data: archivedApp, error: deleteError } = await deleteQuery.select('id').maybeSingle();

    if (deleteError) {
      return ApiResponse.error('Failed to remove application record.', deleteError, 500);
    }

    if (!archivedApp) {
      return ApiResponse.error('Application not found or unauthorized to delete.', null, 404);
    }

    return ApiResponse.success({ id: applicationId, deleted: true });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while deleting application.', err, 500);
  }
}
