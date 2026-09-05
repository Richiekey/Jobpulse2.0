import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);

    const organizationId = searchParams.get('organizationId');
    const statusParam = searchParams.get('status') || 'pending';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    // Validate organizationId format if provided
    if (organizationId && !UUID_REGEX.test(organizationId)) {
      return ApiResponse.error('Invalid organizationId format: must be a valid UUID.', null, 400);
    }

    // Check platform admin status
    let isPlatformAdmin = false;
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && (profile as any).role === 'admin') {
      isPlatformAdmin = true;
    }

    // Authorization verification
    if (organizationId) {
      if (!isPlatformAdmin) {
        const orgCheck = await AuthGuard.requireOrgAdmin(organizationId);
        if ('errorResponse' in orgCheck) {
          return orgCheck.errorResponse;
        }
      }
    } else {
      if (!isPlatformAdmin) {
        return ApiResponse.error('organizationId query parameter is required for non-platform administrators.', null, 400);
      }
    }

    // Build verifications query
    let query = supabase
      .from('application_verifications')
      .select(
        `
        id,
        application_id,
        organization_id,
        worker_id,
        screenshot_url,
        status,
        reviewer_id,
        reviewer_notes,
        reviewed_at,
        idempotency_key,
        created_at,
        updated_at,
        applications (
          id,
          company_name,
          job_title,
          status,
          applied_at,
          notes,
          user_id,
          worker_id,
          verification_status
        )
      `,
        { count: 'exact' }
      );

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    if (statusParam && statusParam !== 'all') {
      query = query.eq('status', statusParam);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: rawVerifications, error: queryError, count } = await query;

    if (queryError) {
      return ApiResponse.error('Failed to retrieve verification records.', queryError, 500);
    }

    const verificationsList = rawVerifications || [];

    // Collect profile IDs (worker and reviewer)
    const profileIds = Array.from(
      new Set(
        verificationsList
          .flatMap((v: any) => [v.worker_id, v.reviewer_id])
          .filter((id): id is string => Boolean(id))
      )
    );

    let profileMap: Record<string, { id: string; email: string | null; fullName: string | null; avatarUrl: string | null }> = {};
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .in('id', profileIds);

      if (profiles) {
        profileMap = Object.fromEntries(
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

    // Generate signed URLs for screenshot viewing without leaking raw paths
    const formatted = await Promise.all(
      verificationsList.map(async (v: any) => {
        let signedUrl: string | null = null;
        const storagePath = v.screenshot_url;
        const app = v.applications;
        const expectedOrgScope = v.organization_id || 'personal';
        const expectedPrefix = `verification-screenshots/${expectedOrgScope}/${v.application_id}/`;

        // Check path bounds and prevent traversal/remote URLs
        if (
          storagePath &&
          (storagePath.startsWith(expectedPrefix) || storagePath.startsWith(`${expectedOrgScope}/${v.application_id}/`)) &&
          !storagePath.includes('..') &&
          !storagePath.startsWith('http://') &&
          !storagePath.startsWith('https://')
        ) {
          const relativeStoragePath = storagePath.replace(/^verification-screenshots\//, '');
          try {
            const { data: signedData } = await supabase.storage
              .from('verification-screenshots')
              .createSignedUrl(relativeStoragePath, 3600);

            if (signedData?.signedUrl) {
              signedUrl = signedData.signedUrl;
            }
          } catch {
            signedUrl = null;
          }
        }

        return {
          id: v.id,
          applicationId: v.application_id,
          organizationId: v.organization_id,
          workerId: v.worker_id,
          status: v.status,
          signedUrl,
          hasScreenshot: Boolean(v.screenshot_url),
          reviewerId: v.reviewer_id,
          reviewerNotes: v.reviewer_notes,
          reviewedAt: v.reviewed_at,
          createdAt: v.created_at,
          updatedAt: v.updated_at,
          application: app
            ? {
                id: app.id,
                companyName: app.company_name,
                jobTitle: app.job_title,
                status: app.status,
                appliedAt: app.applied_at,
                notes: app.notes,
                userId: app.user_id,
                workerId: app.worker_id,
                verificationStatus: app.verification_status,
              }
            : null,
          worker: profileMap[v.worker_id] || null,
          reviewer: v.reviewer_id ? profileMap[v.reviewer_id] || null : null,
        };
      })
    );

    return ApiResponse.success({
      count: count ?? formatted.length,
      limit,
      offset,
      verifications: formatted,
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while fetching verifications queue.', err, 500);
  }
}
