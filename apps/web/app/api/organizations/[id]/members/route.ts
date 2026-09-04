import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { AddOrganizationMemberSchema, UpdateOrganizationMemberSchema } from '@jobpulse/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params;
    const authResult = await AuthGuard.requireOrgMember(organizationId);
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase } = authResult;

    const { data: members, error: queryError } = await supabase
      .from('organization_members')
      .select('id, organization_id, user_id, role, created_at, profiles (email, full_name, avatar_url)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });

    if (queryError) {
      return ApiResponse.error('Failed to retrieve organization members.', queryError, 500);
    }

    const formatted = (members || []).map((m: any) => ({
      id: m.id,
      organizationId: m.organization_id,
      userId: m.user_id,
      role: m.role,
      joinedAt: m.created_at,
      email: m.profiles?.email || null,
      fullName: m.profiles?.full_name || null,
      avatarUrl: m.profiles?.avatar_url || null,
    }));

    return ApiResponse.success(formatted);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while listing organization members.', err, 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params;
    const authResult = await AuthGuard.requireOrgAdmin(organizationId);
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase } = authResult;
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = AddOrganizationMemberSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid member payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { userId: targetUserId, email, role } = parseResult.data;
    const { membership: callerMembership } = authResult;

    // Only owners can create owner memberships
    if (role === 'owner' && callerMembership.role !== 'owner') {
      return ApiResponse.error('Only organization owners can create owner memberships.', null, 403);
    }

    let resolvedUserId = targetUserId;

    // Resolve userId by email if not provided directly
    if (!resolvedUserId && email) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      if (!profile) {
        return ApiResponse.error(
          `User with email ${email} was not found. The user must sign up before being added to an organization.`,
          null,
          404
        );
      }
      resolvedUserId = profile.id;
    }

    if (!resolvedUserId) {
      return ApiResponse.error('Unable to resolve user identifier.', null, 400);
    }

    const { data: newMember, error: insertError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: organizationId,
        user_id: resolvedUserId,
        role,
      })
      .select('*')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return ApiResponse.error('User is already a member of this organization.', insertError, 409);
      }
      return ApiResponse.error('Failed to add organization member.', insertError, 500);
    }

    return ApiResponse.success(newMember, undefined, { status: 201 });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while adding organization member.', err, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params;
    const authResult = await AuthGuard.requireOrgAdmin(organizationId);
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase, membership: callerMembership } = authResult;
    const rawBody = await request.json().catch(() => ({}));

    const memberId = rawBody.memberId;
    if (!memberId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId)) {
      return ApiResponse.error('Invalid memberId: must be a valid UUID.', null, 400);
    }

    const parseResult = UpdateOrganizationMemberSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid role payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { role } = parseResult.data;

    // Fetch target member
    const { data: targetMember } = await supabase
      .from('organization_members')
      .select('id, user_id, role')
      .eq('id', memberId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!targetMember) {
      return ApiResponse.error('Member not found in this organization.', null, 404);
    }

    // 1. Only owners can promote anyone to owner
    if (role === 'owner' && callerMembership.role !== 'owner') {
      return ApiResponse.error('Only organization owners can grant the owner role.', null, 403);
    }

    // 2. Admins cannot demote or alter an owner
    if (targetMember.role === 'owner' && callerMembership.role !== 'owner') {
      return ApiResponse.error('Organization admins cannot modify owner memberships.', null, 403);
    }

    // 3. Ownership transfer: atomic ownership transfer RPC
    if (role === 'owner') {
      const { data: transferResult, error: transferError } = await supabase.rpc(
        'transfer_organization_ownership' as any,
        {
          p_organization_id: organizationId,
          p_new_owner_user_id: targetMember.user_id,
        }
      );

      if (transferError) {
        return ApiResponse.error(transferError.message || 'Failed to transfer ownership.', transferError, 400);
      }

      return ApiResponse.success(transferResult);
    }

    // 4. Prevent demoting the sole owner
    if (targetMember.role === 'owner') {
      const { count } = await supabase
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('role', 'owner');

      if ((count ?? 0) <= 1) {
        return ApiResponse.error('Cannot demote the sole owner of the organization.', null, 400);
      }
    }

    const { data: updatedMember, error: updateError } = await supabase
      .from('organization_members')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', memberId)
      .eq('organization_id', organizationId)
      .select('*')
      .single();

    if (updateError || !updatedMember) {
      return ApiResponse.error('Member not found in this organization or update failed.', updateError, 404);
    }

    return ApiResponse.success(updatedMember);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while updating member role.', err, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params;
    const authResult = await AuthGuard.requireOrgAdmin(organizationId);
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase, membership: callerMembership } = authResult;
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');

    if (!memberId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId)) {
      return ApiResponse.error('Invalid memberId query parameter: must be a valid UUID.', null, 400);
    }

    const { data: targetMember } = await supabase
      .from('organization_members')
      .select('id, user_id, role')
      .eq('id', memberId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!targetMember) {
      return ApiResponse.error('Member not found in this organization.', null, 404);
    }

    // Admins cannot delete an owner
    if (targetMember.role === 'owner' && callerMembership.role !== 'owner') {
      return ApiResponse.error('Organization admins cannot delete owner memberships.', null, 403);
    }

    // Protect against removing the sole owner of the organization
    if (targetMember.role === 'owner') {
      const { count } = await supabase
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('role', 'owner');

      if ((count ?? 0) <= 1) {
        return ApiResponse.error('Cannot remove the sole owner of the organization.', null, 400);
      }
    }

    const { error: deleteError } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', memberId)
      .eq('organization_id', organizationId);

    if (deleteError) {
      return ApiResponse.error('Failed to remove member from organization.', deleteError, 500);
    }

    return ApiResponse.success({ removed: true, memberId });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while removing member.', err, 500);
  }
}
