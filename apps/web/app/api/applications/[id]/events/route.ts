import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import {
  AppendApplicationCrmEventSchema,
  isProhibitedClientLifecycleEvent,
} from '@jobpulse/validation';

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

    // Verify application existence and access permissions (owner, assigned worker, org admin)
    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('id, user_id, organization_id, worker_id')
      .eq('id', applicationId)
      .maybeSingle();

    if (appError || !app) {
      return ApiResponse.error('Application not found or unauthorized to access.', appError, 404);
    }

    const isOwnerOrWorker = app.user_id === user.id || app.worker_id === user.id;
    let isOrgAdmin = false;
    if (!isOwnerOrWorker && app.organization_id) {
      const orgCheck = await AuthGuard.requireOrgAdmin(app.organization_id);
      if (!('errorResponse' in orgCheck)) {
        isOrgAdmin = true;
      }
    }

    if (!isOwnerOrWorker && !isOrgAdmin) {
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
      .select('id, application_id, organization_id, actor_id, actor_type, event_type, from_status, to_status, metadata, created_at')
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

    // Enrich actor info from profiles table where actor_id is present
    const actorIds = Array.from(
      new Set(rawEvents.map((e) => e.actor_id).filter((id): id is string => Boolean(id)))
    );
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
      actorType: e.actor_type || 'user',
      eventType: e.event_type,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      metadata: (e.metadata as Record<string, unknown>) || {},
      createdAt: e.created_at,
      actor: e.actor_id ? actorMap[e.actor_id] || null : null,
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
      .select('id, user_id, organization_id, worker_id, status, deleted_at')
      .eq('id', applicationId)
      .maybeSingle();

    if (appError || !app) {
      return ApiResponse.error('Application not found or unauthorized to access.', appError, 404);
    }

    const isOwnerOrWorker = app.user_id === user.id || app.worker_id === user.id;
    let isOrgAdmin = false;
    if (!isOwnerOrWorker && app.organization_id) {
      const orgCheck = await AuthGuard.requireOrgAdmin(app.organization_id);
      if (!('errorResponse' in orgCheck)) {
        isOrgAdmin = true;
      }
    }

    if (!isOwnerOrWorker && !isOrgAdmin) {
      return ApiResponse.error('Application not found or unauthorized to access.', null, 404);
    }

    if (app.deleted_at) {
      return ApiResponse.error('Cannot append CRM events to an archived application.', null, 400);
    }

    const rawBody = await request.json().catch(() => ({}));

    // HARD SECURITY GATE: Reject client attempts to fabricate authoritative lifecycle events
    if (rawBody?.eventType && isProhibitedClientLifecycleEvent(rawBody.eventType)) {
      return ApiResponse.error(
        `Authoritative lifecycle events (${rawBody.eventType}) cannot be directly created by clients. Only CRM events ('note_added', 'comment_added') are permitted.`,
        null,
        400
      );
    }

    const parseResult = AppendApplicationCrmEventSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid CRM event payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { eventType, note, metadata } = parseResult.data;
    const actorType = isOrgAdmin ? 'admin' : (app.worker_id === user.id ? 'worker' : 'user');

    const { data: newEvent, error: insertError } = await supabase
      .from('application_events')
      .insert({
        application_id: applicationId,
        organization_id: app.organization_id || null,
        actor_id: user.id,
        actor_type: actorType,
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
      return ApiResponse.error('Failed to append CRM timeline event.', insertError, 500);
    }

    const formatted = {
      id: newEvent.id,
      applicationId: newEvent.application_id,
      organizationId: newEvent.organization_id,
      actorId: newEvent.actor_id,
      actorType: newEvent.actor_type,
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
