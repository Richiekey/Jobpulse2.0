import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';

export interface WorkerActivityItem {
  id: string;
  category: 'assignment' | 'application' | 'verification' | 'sync';
  eventType: string;
  title: string;
  description: string;
  status?: string | null;
  occurredAt: string;
  organizationId?: string | null;
  metadata?: Record<string, any>;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const category = searchParams.get('category') || 'all';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    if (organizationId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
        return ApiResponse.error('Invalid organizationId query parameter: must be a valid UUID.', null, 400);
      }
      const memberCheck = await AuthGuard.requireOrgMember(organizationId);
      if ('errorResponse' in memberCheck) {
        return memberCheck.errorResponse;
      }
    }

    // -------------------------------------------------------------------------
    // 1. Primary Path: Database-Backed Event Pagination RPC (P-03 & P-04)
    // -------------------------------------------------------------------------
    if (typeof supabase.rpc === 'function') {
      try {
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          'get_worker_activity_stream',
          {
            p_organization_id: organizationId || null,
            p_category: category,
            p_limit: limit,
            p_offset: offset,
          }
        );

        if (!rpcError && rpcResult && Array.isArray(rpcResult.items)) {
          return ApiResponse.success(rpcResult);
        }
      } catch {
        // Fallback to table queries if RPC is unavailable in this context
      }
    }

    // -------------------------------------------------------------------------
    // 2. Fallback Path: Query Authoritative Event Tables
    // -------------------------------------------------------------------------
    const activityItems: WorkerActivityItem[] = [];

    // 2.1 Fetch Job Assignments for Worker (Authoritative Dispatch Record)
    if (category === 'all' || category === 'assignment') {
      let assignmentQuery = supabase
        .from('job_assignments')
        .select(`
          id,
          organization_id,
          job_id,
          status,
          deadline_at,
          notes,
          created_at,
          updated_at,
          jobs (
            id,
            canonical_title,
            display_title,
            companies (
              name
            )
          )
        `)
        .eq('worker_id', user.id);

      if (organizationId) {
        assignmentQuery = assignmentQuery.eq('organization_id', organizationId);
      }

      const { data: assignments } = await assignmentQuery;

      for (const a of assignments || []) {
        const job = (a as any).jobs;
        const compName = job?.companies?.name || 'Company';
        const jobTitle = job?.display_title || job?.canonical_title || 'Position';

        // Authoritative assignment dispatch record
        activityItems.push({
          id: `asgn-created-${a.id}`,
          category: 'assignment',
          eventType: 'assigned',
          title: `Assigned: ${jobTitle}`,
          description: `Dispatched by team for ${compName}${a.notes ? ` — "${a.notes}"` : ''}`,
          status: 'assigned',
          occurredAt: a.created_at,
          organizationId: a.organization_id,
          metadata: {
            assignmentId: a.id,
            jobId: a.job_id,
            deadlineAt: a.deadline_at,
          },
        });
      }

      // Query immutable assignment_events table if available
      try {
        let asgnEventsQuery = supabase
          .from('assignment_events')
          .select('*')
          .eq('worker_id', user.id)
          .neq('event_type', 'assigned')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (organizationId) {
          asgnEventsQuery = asgnEventsQuery.eq('organization_id', organizationId);
        }

        const { data: asgnEvents } = await asgnEventsQuery;

        for (const ev of asgnEvents || []) {
          activityItems.push({
            id: `asgn-ev-${ev.id}`,
            category: 'assignment',
            eventType: `assignment_${ev.to_status}`,
            title: `Assignment ${ev.event_type.charAt(0).toUpperCase() + ev.event_type.slice(1)}`,
            description: `Assignment transitioned to ${ev.to_status}${ev.notes ? ` — ${ev.notes}` : ''}`,
            status: ev.to_status,
            occurredAt: ev.created_at,
            organizationId: ev.organization_id,
            metadata: {
              assignmentId: ev.assignment_id,
              fromStatus: ev.from_status,
              toStatus: ev.to_status,
              ...ev.metadata,
            },
          });
        }
      } catch {
        // Table may not be mocked in legacy tests
      }
    }

    // 2.2 Fetch Applications & Authoritative Application Events
    let userApplications: any[] = [];
    if (category === 'all' || category === 'application' || category === 'sync' || category === 'verification') {
      let appQuery = supabase
        .from('applications')
        .select('id, organization_id, company_name, job_title, status, verification_status, sync_status, applied_at, created_at, updated_at')
        .eq('user_id', user.id)
        .is('deleted_at', null);

      if (organizationId) {
        appQuery = appQuery.eq('organization_id', organizationId);
      }

      const { data: apps } = await appQuery;
      userApplications = apps || [];
    }

    if (category === 'all' || category === 'application') {
      for (const app of userApplications) {
        // Authoritative application creation record
        activityItems.push({
          id: `app-created-${app.id}`,
          category: 'application',
          eventType: 'application_submitted',
          title: `Application Logged: ${app.job_title}`,
          description: `Tracked application to ${app.company_name} in ${app.status} stage`,
          status: app.status,
          occurredAt: app.applied_at || app.created_at,
          organizationId: app.organization_id,
          metadata: {
            applicationId: app.id,
          },
        });
      }

      // Query immutable application_events audit log
      const appIds = userApplications.map((a) => a.id);
      if (appIds.length > 0) {
        const { data: appEvents } = await supabase
          .from('application_events')
          .select('id, application_id, organization_id, event_type, from_status, to_status, metadata, created_at')
          .in('application_id', appIds.slice(0, 100))
          .order('created_at', { ascending: false })
          .limit(limit);

        const appMap = Object.fromEntries(userApplications.map((a) => [a.id, a]));

        for (const ev of appEvents || []) {
          const matchedApp = appMap[ev.application_id];
          const jobTitle = matchedApp?.job_title || 'Position';
          const compName = matchedApp?.company_name || 'Company';

          activityItems.push({
            id: `ev-${ev.id}`,
            category: 'application',
            eventType: ev.event_type,
            title: `Lifecycle: ${jobTitle} (${compName})`,
            description: ev.from_status && ev.to_status
              ? `Transitioned from ${ev.from_status} to ${ev.to_status}`
              : `Application event: ${ev.event_type.replace(/_/g, ' ')}`,
            status: ev.to_status || matchedApp?.status || null,
            occurredAt: ev.created_at,
            organizationId: ev.organization_id,
            metadata: {
              applicationId: ev.application_id,
              ...ev.metadata,
            },
          });
        }
      }
    }

    // 2.3 Fetch Verifications for Worker (Authoritative Submission & Review Records)
    if (category === 'all' || category === 'verification') {
      let verifQuery = supabase
        .from('application_verifications')
        .select(`
          id,
          application_id,
          organization_id,
          worker_id,
          status,
          notes,
          rejection_reason,
          created_at,
          reviewed_at,
          applications (
            company_name,
            job_title
          )
        `)
        .eq('worker_id', user.id);

      if (organizationId) {
        verifQuery = verifQuery.eq('organization_id', organizationId);
      }

      const { data: verifications } = await verifQuery;

      for (const v of verifications || []) {
        const app = (v as any).applications;
        const compName = app?.company_name || 'Company';
        const jobTitle = app?.job_title || 'Position';

        // Authoritative verification submission
        activityItems.push({
          id: `verif-sub-${v.id}`,
          category: 'verification',
          eventType: 'verification_submitted',
          title: `Proof Uploaded: ${jobTitle}`,
          description: `Screenshot evidence submitted for ${compName}`,
          status: v.status,
          occurredAt: v.created_at,
          organizationId: v.organization_id,
          metadata: {
            verificationId: v.id,
            applicationId: v.application_id,
          },
        });

        // Authoritative verification review
        if (v.reviewed_at && v.status !== 'pending') {
          const isApproved = v.status === 'verified';
          activityItems.push({
            id: `verif-rev-${v.id}`,
            category: 'verification',
            eventType: isApproved ? 'verification_approved' : 'verification_rejected',
            title: `Proof ${isApproved ? 'Approved' : 'Rejected'}: ${jobTitle}`,
            description: isApproved
              ? `Admin verified application proof for ${compName}`
              : `Verification rejected: ${v.rejection_reason || v.notes || 'Evidence insufficient'}`,
            status: v.status,
            occurredAt: v.reviewed_at,
            organizationId: v.organization_id,
            metadata: {
              verificationId: v.id,
              applicationId: v.application_id,
            },
          });
        }
      }
    }

    // 2.4 Fetch Sync Events for Worker Applications
    if (category === 'all' || category === 'sync') {
      const appIds = userApplications.map((a) => a.id);
      if (appIds.length > 0) {
        let syncQuery = supabase
          .from('sync_events')
          .select('id, application_id, organization_id, status, attempts, last_error, created_at, updated_at')
          .in('application_id', appIds.slice(0, 100))
          .order('updated_at', { ascending: false });

        if (organizationId) {
          syncQuery = syncQuery.eq('organization_id', organizationId);
        }

        const { data: syncEvents } = await syncQuery;
        const appMap = Object.fromEntries(userApplications.map((a) => [a.id, a]));

        for (const s of syncEvents || []) {
          const matchedApp = appMap[s.application_id];
          const jobTitle = matchedApp?.job_title || 'Position';
          const compName = matchedApp?.company_name || 'Company';

          if (s.status === 'synced') {
            activityItems.push({
              id: `sync-ok-${s.id}`,
              category: 'sync',
              eventType: 'sync_synced',
              title: `Synced to Sheets: ${jobTitle}`,
              description: `Successfully exported ${compName} application to Google Sheets`,
              status: 'synced',
              occurredAt: s.updated_at || s.created_at,
              organizationId: s.organization_id,
              metadata: {
                syncEventId: s.id,
                applicationId: s.application_id,
              },
            });
          } else if (s.status === 'failed' || s.status === 'dead_letter') {
            activityItems.push({
              id: `sync-err-${s.id}`,
              category: 'sync',
              eventType: 'sync_failed',
              title: `Sync Issue: ${jobTitle}`,
              description: `Google Sheets sync failed: ${s.last_error || 'Export error'}`,
              status: s.status,
              occurredAt: s.updated_at || s.created_at,
              organizationId: s.organization_id,
              metadata: {
                syncEventId: s.id,
                applicationId: s.application_id,
                attempts: s.attempts,
              },
            });
          }
        }
      }
    }

    // Sort all activities strictly descending by occurredAt
    activityItems.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    const total = activityItems.length;
    const paginated = activityItems.slice(offset, offset + limit);

    return ApiResponse.success({
      items: paginated,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while listing worker activities.', err, 500);
  }
}
