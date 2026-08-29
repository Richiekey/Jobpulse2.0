import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { SSRFGuard } from '@jobpulse/validation';
import { z } from 'zod';

const CreateAlertSchema = z.object({
  title: z.string().trim().min(2).max(100),
  query: z.string().trim().max(100).optional().nullable(),
  location: z.string().trim().max(100).optional().nullable(),
  department: z.string().trim().max(100).optional().nullable(),
  employmentType: z.string().trim().max(50).optional().nullable(),
  remoteType: z.enum(['remote', 'hybrid', 'onsite', 'any']).optional().nullable(),
  frequency: z.enum(['instant', 'daily', 'weekly']).default('daily'),
  channel: z.enum(['email', 'webhook', 'in_app']).default('email'),
  webhookUrl: z.string().url().max(500).optional().nullable(),
});

/**
 * GET /api/alerts
 * Lists active and paused job alerts for the authenticated user.
 */
export async function GET() {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    const { data: alerts, error } = await supabase
      .from('job_alerts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return ApiResponse.error('Failed to retrieve job alerts.', error, 500);
    }

    return ApiResponse.success({
      alerts: alerts || [],
      count: alerts?.length || 0,
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while loading job alerts.', err, 500);
  }
}

/**
 * POST /api/alerts
 * Creates a new search alert with multi-criteria filters, frequency, and channel.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = CreateAlertSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid alert configuration: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const payload = parseResult.data;

    // Strict SSRF check if webhook channel is selected
    if (payload.channel === 'webhook') {
      if (!payload.webhookUrl) {
        return ApiResponse.error('Webhook URL is required when webhook channel is selected.', undefined, 400);
      }

      const ssrfCheck = SSRFGuard.isSafeUrl(payload.webhookUrl);
      if (!ssrfCheck.safe) {
        return ApiResponse.error(`Invalid webhook URL: ${ssrfCheck.reason}`, undefined, 400);
      }
    }

    const { data: newAlert, error: insertError } = await supabase
      .from('job_alerts')
      .insert({
        user_id: user.id,
        title: payload.title,
        query: payload.query || null,
        location: payload.location || null,
        department: payload.department || null,
        employment_type: payload.employmentType || null,
        remote_type: payload.remoteType || null,
        frequency: payload.frequency,
        channel: payload.channel,
        webhook_url: payload.webhookUrl || null,
        is_active: true,
      })
      .select('*')
      .single();

    if (insertError || !newAlert) {
      return ApiResponse.error('Failed to create job alert in database.', insertError, 500);
    }

    return ApiResponse.success(
      {
        message: 'Job alert successfully created.',
        alert: newAlert,
      },
      undefined,
      { status: 201 }
    );
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while creating the job alert.', err, 500);
  }
}
