import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { UpdateWorkerProfileSchema } from '@jobpulse/validation';

export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
      return ApiResponse.error('Invalid organizationId query parameter: must be a valid UUID.', null, 400);
    }

    // Verify membership
    const memberCheck = await AuthGuard.requireOrgMember(organizationId);
    if ('errorResponse' in memberCheck) {
      return memberCheck.errorResponse;
    }

    const { data: profile, error: queryError } = await supabase
      .from('worker_profiles')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (queryError) {
      return ApiResponse.error('Failed to retrieve worker profile.', queryError, 500);
    }

    return ApiResponse.success(profile || null);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while retrieving worker profile.', err, 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = UpdateWorkerProfileSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid worker profile data: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const {
      organizationId,
      cvUrl,
      resumes,
      skills,
      experienceYears,
      education,
      preferredRoles,
      preferredLocations,
      availability,
      notes,
      metadata,
    } = parseResult.data;

    // Verify caller is a member of the organization
    const memberCheck = await AuthGuard.requireOrgMember(organizationId);
    if ('errorResponse' in memberCheck) {
      return memberCheck.errorResponse;
    }

    const upsertPayload = {
      organization_id: organizationId,
      user_id: user.id,
      cv_url: cvUrl || null,
      resumes: resumes || [],
      skills: skills || [],
      experience_years: experienceYears != null ? experienceYears : null,
      education: education || [],
      preferred_roles: preferredRoles || [],
      preferred_locations: preferredLocations || [],
      availability: availability || 'immediate',
      notes: notes || null,
      metadata: metadata || {},
      updated_at: new Date().toISOString(),
    };

    const { data: updatedProfile, error: upsertError } = await supabase
      .from('worker_profiles')
      .upsert(upsertPayload, { onConflict: 'organization_id, user_id' })
      .select('*')
      .single();

    if (upsertError) {
      return ApiResponse.error('Failed to persist worker profile.', upsertError, 500);
    }

    return ApiResponse.success(updatedProfile);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while updating worker profile.', err, 500);
  }
}
