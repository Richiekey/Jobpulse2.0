import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { SSRFGuard } from '@jobpulse/validation';
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
 * INVARIANT: Enforces SSRFGuard validation on new webhook URLs and ensures channel/URL consistency.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    // 1. Fetch current alert to check ownership and existing channel state
    const { data: existingAlert, error: fetchError } = await supabase
      .from('job_alerts')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existingAlert) {
      return ApiResponse.error('Job alert not found or access denied.', fetchError, 404);
    }

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = UpdateAlertSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid update payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const data = parseResult.data;
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    const effectiveChannel = data.channel !== undefined ? data.channel : existingAlert.channel;

    // 2. Enforce SSRF & consistency for webhook URLs
    if (effectiveChannel === 'webhook') {
      const targetWebhookUrl = data.webhookUrl !== undefined ? data.webhookUrl : existingAlert.webhook_url;
      if (!targetWebhookUrl || targetWebhookUrl.trim().length === 0) {
        return ApiResponse.error('Webhook URL is required when channel is webhook.', undefined, 400);
      }

      const ssrfCheck = SSRFGuard.isSafeUrl(targetWebhookUrl);
      if (!ssrfCheck.safe) {
        return ApiResponse.error(`Invalid webhook URL: ${ssrfCheck.reason}`, undefined, 400);
      }
      updates.webhook_url = targetWebhookUrl;
    } else if (data.channel !== undefined && data.channel !== 'webhook') {
      // Clear webhook URL if channel switched to email or in_app
      updates.webhook_url = null;
    }

    if (data.title !== undefined) updates.title = data.title;
    if (data.query !== undefined) updates.query = data.query;
    if (data.location !== undefined) updates.location = data.location;
    if (data.department !== undefined) updates.department = data.department;
    if (data.employmentType !== undefined) updates.employment_type = data.employmentType;
    if (data.remoteType !== undefined) updates.remote_type = data.remoteType;
    if (data.frequency !== undefined) updates.frequency = data.frequency;
    if (data.channel !== undefined) updates.channel = data.channel;
    if (data.isActive !== undefined) updates.is_active = data.isActive;

    const { data: updatedAlert, error: updateError } = await supabase
      .from('job_alerts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError || !updatedAlert) {
      return ApiResponse.error('Failed to update job alert in database.', updateError, 500);
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

    const { data: deletedAlerts, error: deleteError } = await supabase
      .from('job_alerts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id');

    if (deleteError) {
      return ApiResponse.error('Failed to delete job alert.', deleteError, 500);
    }

    if (!deletedAlerts || deletedAlerts.length === 0) {
      return ApiResponse.error('Job alert not found or access denied.', undefined, 404);
    }

    return ApiResponse.success({
      message: 'Job alert successfully deleted.',
      id,
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while deleting the alert.', err, 500);
  }
}
