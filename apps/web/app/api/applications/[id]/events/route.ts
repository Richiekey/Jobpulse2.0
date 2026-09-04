import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const AppendEventSchema = z.object({
  eventType: z.enum(['note_updated', 'status_changed', 'assigned', 'reassigned']).default('note_updated'),
  note: z.string().trim().min(1, 'Note content cannot be empty').max(2000),
  metadata: z.record(z.unknown()).optional().default({}),
});

export async function GET(
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

    // Verify application existence and access permissions
    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('id, user_id, organization_id')
      .eq('id', applicationId)
      .maybeSingle();

    if (appError || !app) {
      return ApiResponse.error('Application not found or unauthorized to access.', appError, 404);
    }

    const isOwner = app.user_id === user.id;
    let hasOrgAccess = false;
    if (!isOwner && app.organization_id) {
      const orgCheck = await AuthGuard.requireOrgMember(app.organization_id);
      if (!('errorResponse' in orgCheck)) {
        hasOrgAccess = true;
      }
    }

    if (!isOwner && !hasOrgAccess) {
      return ApiResponse.error('Application not found or unauthorized to access.', null, 404);
    }

    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const offsetParam = parseInt(searchParams.get('offset') || '0', 10);
    const eventType = searchParams.get('eventType');

    const limit = Math.min(Math.max(isNaN(limitParam) ? 50 : limitParam, 1), 100);
    const offset = Math.max(isNaN(offsetParam) ? 0 : offsetParam, 0);

    let query = supabase
      .from('application_events')
      .select('id, application_id, organization_id, actor_id, event_type, from_status, to_status, metadata, created_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true });

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    const { data: events, error: eventsError } = await query.range(offset, offset + limit - 1);

    if (eventsError) {
      return ApiResponse.error('Failed to retrieve application timeline events.', eventsError, 500);
    }

    const rawEvents = events || [];

    // Optionally enrich actor info from profiles table
    const actorIds = Array.from(new Set(rawEvents.map((e) => e.actor_id).filter(Boolean)));
    let actorMap: Record<string, { id: string; email: string | null; fullName: string | null; avatarUrl: string | null }> = {};

    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .in('id', actorIds);

      if (profiles) {
        actorMap = Object.fromEntries(
          profiles.map((p: any) => [
            p.id,
            {
              id: p.id,
              email: p.email || null,
              fullName: p.full_name || null,
              avatarUrl: p.avatar_url || null,
            },
          ])
        );
      }
    }

    const formatted = rawEvents.map((e) => ({
      id: e.id,
      applicationId: e.application_id,
      organizationId: e.organization_id,
      actorId: e.actor_id,
      eventType: e.event_type,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      metadata: (e.metadata as Record<string, unknown>) || {},
      createdAt: e.created_at,
      actor: actorMap[e.actor_id] || null,
    }));

    return ApiResponse.success(formatted);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while retrieving timeline events.', err, 500);
  }
}

export async function POST(
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

    // Verify application existence and access permissions
    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('id, user_id, organization_id, status, notes')
      .eq('id', applicationId)
      .maybeSingle();

    if (appError || !app) {
      return ApiResponse.error('Application not found or unauthorized to access.', appError, 404);
    }

    const isOwner = app.user_id === user.id;
    let hasOrgAccess = false;
    if (!isOwner && app.organization_id) {
      const orgCheck = await AuthGuard.requireOrgMember(app.organization_id);
      if (!('errorResponse' in orgCheck)) {
        hasOrgAccess = true;
      }
    }

    if (!isOwner && !hasOrgAccess) {
      return ApiResponse.error('Application not found or unauthorized to access.', null, 404);
    }

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = AppendEventSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid event payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { eventType, note, metadata } = parseResult.data;

    const { data: newEvent, error: insertError } = await supabase
      .from('application_events')
      .insert({
        application_id: applicationId,
        organization_id: app.organization_id || null,
        actor_id: user.id,
        event_type: eventType,
        from_status: app.status,
        to_status: app.status,
        metadata: {
          note,
          ...metadata,
        },
      })
      .select('*')
      .single();

    if (insertError || !newEvent) {
      return ApiResponse.error('Failed to append timeline event.', insertError, 500);
    }

    const formatted = {
      id: newEvent.id,
      applicationId: newEvent.application_id,
      organizationId: newEvent.organization_id,
      actorId: newEvent.actor_id,
      eventType: newEvent.event_type,
      fromStatus: newEvent.from_status,
      toStatus: newEvent.to_status,
      metadata: (newEvent.metadata as Record<string, unknown>) || {},
      createdAt: newEvent.created_at,
    };

    return ApiResponse.success(formatted, undefined, { status: 201 });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while appending timeline event.', err, 500);
  }
}
