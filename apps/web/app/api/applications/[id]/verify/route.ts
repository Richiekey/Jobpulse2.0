import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import {
  CreateVerificationSchema,
  ReviewVerificationSchema,
} from '@jobpulse/validation';
import { isTerminalVerificationStatus } from '@jobpulse/domain';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    if (!applicationId || !UUID_REGEX.test(applicationId)) {
      return ApiResponse.error('Invalid application identifier: must be a valid UUID.', null, 400);
    }

    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    // Fetch application to verify existence, soft-delete, and access permissions
    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('id, user_id, worker_id, organization_id, deleted_at, verification_status')
      .eq('id', applicationId)
      .maybeSingle();

    if (appError || !app) {
      return ApiResponse.error('Application not found or unauthorized to access.', appError, 404);
    }

    // Soft-deleted applications return 404 per Batch L invariant
    if (app.deleted_at) {
      return ApiResponse.error('Application not found or unauthorized to access.', null, 404);
    }

    // Authorization check: Owner, Assigned Worker, Org Admin, or Platform Admin
    const isOwnerOrWorker = app.user_id === user.id || app.worker_id === user.id;
    let isOrgAdmin = false;

    if (!isOwnerOrWorker && app.organization_id) {
      const orgCheck = await AuthGuard.requireOrgAdmin(app.organization_id);
      if (!('errorResponse' in orgCheck)) {
        isOrgAdmin = true;
      }
    }

    // Platform admin check
    let isPlatformAdmin = false;
    if (!isOwnerOrWorker && !isOrgAdmin) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile && (profile as any).role === 'admin') {
        isPlatformAdmin = true;
      }
    }

    if (!isOwnerOrWorker && !isOrgAdmin && !isPlatformAdmin) {
      return ApiResponse.error('Application not found or unauthorized to access.', null, 404);
    }

    // Retrieve verification history for this application
    const { data: verifications, error: verifError } = await supabase
      .from('application_verifications')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });

    if (verifError) {
      return ApiResponse.error('Failed to retrieve application verifications.', verifError, 500);
    }

    const rawVerifications = verifications || [];

    // Collect reviewer and worker IDs for profile enrichment
    const profileIds = Array.from(
      new Set(
        rawVerifications
          .flatMap((v) => [v.worker_id, v.reviewer_id])
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

    // Generate signed URLs for private storage screenshots
    const enriched = await Promise.all(
      rawVerifications.map(async (v) => {
        let signedUrl: string | null = null;
        let storagePath = v.screenshot_url;

        // If screenshot_url is a storage path rather than an external HTTP URL
        if (storagePath && !storagePath.startsWith('http://') && !storagePath.startsWith('https://')) {
          if (storagePath.startsWith('verification-screenshots/')) {
            storagePath = storagePath.replace(/^verification-screenshots\//, '');
          }

          try {
            const { data: signedData } = await supabase.storage
              .from('verification-screenshots')
              .createSignedUrl(storagePath, 3600);

            if (signedData?.signedUrl) {
              signedUrl = signedData.signedUrl;
            }
          } catch {
            // If signed URL generation fails, fallback gracefully
            signedUrl = null;
          }
        } else {
          signedUrl = v.screenshot_url;
        }

        return {
          id: v.id,
          applicationId: v.application_id,
          organizationId: v.organization_id,
          workerId: v.worker_id,
          screenshotUrl: v.screenshot_url,
          signedUrl,
          status: v.status,
          reviewerId: v.reviewer_id,
          reviewerNotes: v.reviewer_notes,
          reviewedAt: v.reviewed_at,
          idempotencyKey: v.idempotency_key,
          createdAt: v.created_at,
          updatedAt: v.updated_at,
          worker: profileMap[v.worker_id] || null,
          reviewer: v.reviewer_id ? profileMap[v.reviewer_id] || null : null,
        };
      })
    );

    return ApiResponse.success({
      applicationId,
      currentVerificationStatus: app.verification_status,
      verifications: enriched,
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while retrieving verification history.', err, 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    if (!applicationId || !UUID_REGEX.test(applicationId)) {
      return ApiResponse.error('Invalid application identifier: must be a valid UUID.', null, 400);
    }

    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    // Validate request body
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = CreateVerificationSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid verification submission payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { screenshotUrl, idempotencyKey } = parseResult.data;

    // Verify application existence and soft-delete state
    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('id, user_id, worker_id, organization_id, deleted_at, status')
      .eq('id', applicationId)
      .maybeSingle();

    if (appError || !app) {
      return ApiResponse.error('Application not found or unauthorized to access.', appError, 404);
    }

    if (app.deleted_at) {
      return ApiResponse.error('Cannot submit verification for an archived or deleted application.', null, 404);
    }

    // Check authorization: Must be owner, assigned worker, or platform admin
    const isOwnerOrWorker = app.user_id === user.id || app.worker_id === user.id;
    let isPlatformAdmin = false;

    if (!isOwnerOrWorker) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile && (profile as any).role === 'admin') {
        isPlatformAdmin = true;
      }
    }

    if (!isOwnerOrWorker && !isPlatformAdmin) {
      return ApiResponse.error(
        'Forbidden: You are not authorized to submit verification evidence for this application.',
        null,
        403
      );
    }

    // Execute atomic RPC submission
    const { data: verification, error: rpcError } = await supabase.rpc(
      'submit_application_verification',
      {
        p_application_id: applicationId,
        p_screenshot_url: screenshotUrl,
        p_idempotency_key: idempotencyKey || null,
      }
    );

    if (rpcError) {
      return ApiResponse.error(
        `Failed to submit application verification: ${rpcError.message}`,
        rpcError,
        500
      );
    }

    return ApiResponse.success(verification, undefined, { status: 201 });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while submitting verification.', err, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    if (!applicationId || !UUID_REGEX.test(applicationId)) {
      return ApiResponse.error('Invalid application identifier: must be a valid UUID.', null, 400);
    }

    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    // Validate payload
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = ReviewVerificationSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid review payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { status: targetStatus, reviewerNotes, verificationId } = parseResult.data;

    // Fetch application
    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('id, organization_id, deleted_at')
      .eq('id', applicationId)
      .maybeSingle();

    if (appError || !app) {
      return ApiResponse.error('Application not found or unauthorized to access.', appError, 404);
    }

    if (app.deleted_at) {
      return ApiResponse.error('Cannot review verification for an archived or deleted application.', null, 404);
    }

    // Enforce reviewer permissions: Org Admin or Platform Admin
    let isAuthorizedReviewer = false;

    if (app.organization_id) {
      const orgCheck = await AuthGuard.requireOrgAdmin(app.organization_id);
      if (!('errorResponse' in orgCheck)) {
        isAuthorizedReviewer = true;
      }
    }

    if (!isAuthorizedReviewer) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile && (profile as any).role === 'admin') {
        isAuthorizedReviewer = true;
      }
    }

    if (!isAuthorizedReviewer) {
      return ApiResponse.error(
        'Forbidden: Only organization administrators or platform administrators may review verifications.',
        null,
        403
      );
    }

    // Resolve target verification record
    let targetVerification: any = null;

    if (verificationId) {
      const { data: verif, error: verifError } = await supabase
        .from('application_verifications')
        .select('*')
        .eq('id', verificationId)
        .eq('application_id', applicationId)
        .maybeSingle();

      if (verifError || !verif) {
        return ApiResponse.error('Specified verification record not found for this application.', verifError, 404);
      }
      targetVerification = verif;
    } else {
      // Find latest pending verification for this application
      const { data: verif, error: verifError } = await supabase
        .from('application_verifications')
        .select('*')
        .eq('application_id', applicationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (verifError || !verif) {
        return ApiResponse.error('No pending verification found to review for this application.', verifError, 404);
      }
      targetVerification = verif;
    }

    // State machine check: Terminal states cannot transition
    if (isTerminalVerificationStatus(targetVerification.status)) {
      return ApiResponse.error(
        `Terminal state transition prohibited: Verification is already ${targetVerification.status}. Re-verification requires a new submission attempt.`,
        { currentStatus: targetVerification.status },
        409
      );
    }

    // Execute atomic review RPC
    const { data: reviewedVerif, error: reviewError } = await supabase.rpc(
      'review_application_verification',
      {
        p_verification_id: targetVerification.id,
        p_status: targetStatus,
        p_reviewer_notes: reviewerNotes || null,
      }
    );

    if (reviewError) {
      return ApiResponse.error(
        `Failed to review verification: ${reviewError.message}`,
        reviewError,
        500
      );
    }

    return ApiResponse.success(reviewedVerif);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while reviewing verification.', err, 500);
  }
}
