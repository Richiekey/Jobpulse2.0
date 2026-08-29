import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const UpdateAlertSchema = z.object({
  title: z.string().trim().min(2).max(100).optional(),
  query: z.string().trim().max(100).optional().nullable(),
  location: z.string().trim().max(100).optional().nullable(),
  department: z.string().trim().max(100).optional().nullable(),
  employmentType: z.string().trim().max(50).optional().nullable(),
  remoteType: z.enum(['remote', 'hybrid', 'onsite', 'any']).optional().nullable(),
  frequency: z.enum(['instant', 'daily', 'weekly']).optional(),
  channel: z.enum(['email', 'webhook', 'in_app']).optional(),
  webhookUrl: z.string().url().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/alerts/[id]
 * Updates alert configuration or toggles active/paused state.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = UpdateAlertSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid update payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    const data = parseResult.data;

    if (data.title !== undefined) updates.title = data.title;
    if (data.query !== undefined) updates.query = data.query;
    if (data.location !== undefined) updates.location = data.location;
    if (data.department !== undefined) updates.department = data.department;
    if (data.employmentType !== undefined) updates.employment_type = data.employmentType;
    if (data.remoteType !== undefined) updates.remote_type = data.remoteType;
    if (data.frequency !== undefined) updates.frequency = data.frequency;
    if (data.channel !== undefined) updates.channel = data.channel;
    if (data.webhookUrl !== undefined) updates.webhook_url = data.webhookUrl;
    if (data.isActive !== undefined) updates.is_active = data.isActive;

    const { data: updatedAlert, error: updateError } = await supabase
      .from('job_alerts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError || !updatedAlert) {
      return ApiResponse.error('Failed to update job alert or alert not found.', updateError, 404);
    }

    return ApiResponse.success({
      message: 'Job alert updated successfully.',
      alert: updatedAlert,
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while updating the alert.', err, 500);
  }
}

/**
 * DELETE /api/alerts/[id]
 * Deletes a job alert.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    const { error: deleteError } = await supabase
      .from('job_alerts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      return ApiResponse.error('Failed to delete job alert.', deleteError, 500);
    }

    return ApiResponse.success({
      message: 'Job alert successfully deleted.',
      id,
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while deleting the alert.', err, 500);
  }
}
