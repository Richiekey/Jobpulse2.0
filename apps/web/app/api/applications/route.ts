import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { processSyncForApplication } from '@/lib/sync-processor';
import { resolveJobrightDetail } from '@jobpulse/ats';
import { URLResolver } from '@jobpulse/url-resolution';
import { z } from 'zod';

const ApplicationSchema = z.object({
  jobId: z.string().uuid().optional().nullable(),
  companyName: z.string().trim().min(1).max(120),
  jobTitle: z.string().trim().min(1).max(150),
  status: z.enum(['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'archived']).default('applied'),
  notes: z.string().max(2000).optional().nullable(),
  organizationId: z.string().uuid().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const organizationId = searchParams.get('organizationId');

    let query = supabase.from('applications').select(`
      *,
      jobs (
        id,
        canonical_title,
        display_title,
        apply_url,
        companies (
          id,
          name,
          logo_url
        )
      ),
      sync_events (
        id,
        status,
        synced_at,
        last_error
      )
    `);

    if (organizationId) {
      // Check if user is admin or member of this organization
      const orgCheck = await AuthGuard.requireOrgMember(organizationId);
      if ('errorResponse' in orgCheck) {
        return orgCheck.errorResponse;
      }

      query = query.eq('organization_id', organizationId);
      // If caller is worker (not owner/admin), restrict to their own applications
      if (orgCheck.membership.role === 'worker') {
        query = query.eq('user_id', user.id);
      }
    } else {
      // Personal mode: only caller's own applications
      query = query.eq('user_id', user.id);
    }

    const includeArchived = searchParams.get('includeArchived') === 'true';
    if (!includeArchived) {
      query = query.is('deleted_at', null);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    query = query.order('applied_at', { ascending: false });

    const { data: applications, error: queryError } = await query;

    if (queryError) {
      return ApiResponse.error('Failed to retrieve applications.', queryError, 500);
    }

    return ApiResponse.success(applications || []);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred.', err, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = ApplicationSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid application data: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { jobId, companyName, jobTitle, status, notes, organizationId } = parseResult.data;

    if (organizationId) {
      const orgCheck = await AuthGuard.requireOrgMember(organizationId);
      if ('errorResponse' in orgCheck) {
        return orgCheck.errorResponse;
      }
    }

    const insertPayload: Record<string, any> = {
      user_id: user.id,
      job_id: jobId || null,
      company_name: companyName,
      job_title: jobTitle,
      status,
      notes: notes || null,
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (organizationId) {
      insertPayload.organization_id = organizationId;
      insertPayload.worker_id = user.id;
    }

    // Lazily resolve Jobright URLs before creating the application so the sync trigger gets the ATS link
    if (jobId) {
      const { data: job } = await supabase.from('jobs').select('canonical_url, apply_url, source_job_url, source_metadata').eq('id', jobId).maybeSingle();
      if (job) {
        const metadata = (job.source_metadata as Record<string, any>) || {};
        if (!metadata.direct_ats_url) {
          const externalIdMatch =
            job.apply_url?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/) ||
            job.canonical_url?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/) ||
            job.source_job_url?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/);
          
          if (externalIdMatch?.[1]) {
            const externalJobId = externalIdMatch[1];
            try {
              const detail = await resolveJobrightDetail(externalJobId);
              if (detail?.directUrl) {
                const directUrl = detail.directUrl;
                const isDirectAts = URLResolver.isDirectAtsUrl(directUrl);
                
                await supabase.from('jobs').update({
                  apply_url: directUrl,
                  original_apply_url: directUrl,
                  canonical_url: directUrl,
                  source_metadata: {
                    ...metadata,
                    direct_ats_url: directUrl,
                    jobright_reference_url: `https://jobright.ai/jobs/info/${externalJobId}`,
                    enrichment_status: 'enriched',
                    enriched_at: new Date().toISOString(),
                  },
                  url_resolution_method: isDirectAts ? 'direct_ats' : 'employer_application',
                  url_resolution_confidence: isDirectAts ? 0.95 : 0.85,
                  updated_at: new Date().toISOString(),
                }).eq('id', jobId);
              }
            } catch (err) {
              console.error('[Applications] Failed to resolve jobright url inline:', err);
            }
          }
        }
      }
    }

    const { data, error: insertError } = await supabase
      .from('applications')
      .upsert(
        insertPayload,
        jobId ? { onConflict: 'user_id, job_id' } : undefined
      )
      .select('*')
      .single();

    if (insertError) {
      return ApiResponse.error('Failed to record application.', insertError, 500);
    }

    // Trigger immediate Google Sheets sync so user sees real-time sync in UI
    let syncResult = null;
    try {
      syncResult = await processSyncForApplication(data.id, user.id);
    } catch (syncErr: any) {
      console.error('[Applications] Immediate Google Sheets sync error:', syncErr?.message || syncErr);
    }

    const finalSyncStatus = syncResult?.status || data.sync_status || 'pending';

    return ApiResponse.success(
      { ...data, sync_status: finalSyncStatus, sync_result: syncResult },
      undefined,
      { status: 201 }
    );
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred.', err, 500);
  }
}
