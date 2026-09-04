import { createClient } from './supabase/server';
import { ApiResponse } from './api-response';
import type { User } from '@supabase/supabase-js';

export interface AuthenticatedContext {
  user: User;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

export interface AdminContext extends AuthenticatedContext {
  profile: {
    id: string;
    role: string;
    email: string;
  };
}

export interface OrgMemberContext extends AuthenticatedContext {
  organizationId: string;
  membership: {
    id: string;
    organizationId: string;
    userId: string;
    role: 'owner' | 'admin' | 'worker';
  };
}

export interface OrgAdminContext extends OrgMemberContext {
  membership: {
    id: string;
    organizationId: string;
    userId: string;
    role: 'owner' | 'admin';
  };
}

export class AuthGuard {
  /**
   * Enforces that the request has an active, authenticated Supabase user session.
   * Returns AuthenticatedContext or a 401 NextResponse.
   */
  public static async requireAuthenticatedUser(): Promise<
    AuthenticatedContext | { errorResponse: ReturnType<typeof ApiResponse.error> }
  > {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        errorResponse: ApiResponse.error('Unauthorized: Authentication is required.', authError, 401),
      };
    }

    return { user, supabase };
  }

  /**
   * Enforces that the request is authenticated AND possesses verified 'admin' privileges.
   * Returns AdminContext or a 401/403 NextResponse.
   */
  public static async requireAdmin(): Promise<
    AdminContext | { errorResponse: ReturnType<typeof ApiResponse.error> }
  > {
    const authResult = await this.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult;
    }

    const { user, supabase } = authResult;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || (profile as any).role !== 'admin') {
      return {
        errorResponse: ApiResponse.error(
          'Forbidden: You do not have administrator permissions to access this endpoint.',
          profileError || { userId: user.id, role: (profile as any)?.role },
          403
        ),
      };
    }

    return {
      user,
      supabase,
      profile: profile as AdminContext['profile'],
    };
  }

  /**
   * Enforces that the authenticated user is an active member (owner, admin, or worker)
   * of the specified organization, or possesses global system admin status.
   * Returns OrgMemberContext or a 401/403/404 NextResponse.
   */
  public static async requireOrgMember(organizationId: string): Promise<
    OrgMemberContext | { errorResponse: ReturnType<typeof ApiResponse.error> }
  > {
    if (!organizationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
      return {
        errorResponse: ApiResponse.error('Invalid organization identifier: must be a valid UUID.', null, 400),
      };
    }

    const authResult = await this.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult;
    }

    const { user, supabase } = authResult;

    // Check membership in the specified organization
    const { data: member, error: memberError } = await supabase
      .from('organization_members')
      .select('id, organization_id, user_id, role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (member) {
      return {
        user,
        supabase,
        organizationId,
        membership: {
          id: member.id,
          organizationId: member.organization_id,
          userId: member.user_id,
          role: member.role as 'owner' | 'admin' | 'worker',
        },
      };
    }

    // Check if user is platform super-admin (delegated bypass)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile && (profile as any).role === 'admin') {
      return {
        user,
        supabase,
        organizationId,
        membership: {
          id: `superadmin_${user.id}`,
          organizationId,
          userId: user.id,
          role: 'owner',
        },
      };
    }

    return {
      errorResponse: ApiResponse.error(
        'Forbidden: You are not a member of this organization.',
        memberError || { userId: user.id, organizationId },
        403
      ),
    };
  }

  /**
   * Enforces that the authenticated user is an 'owner' or 'admin' of the specified organization,
   * or possesses global system admin status.
   * Returns OrgAdminContext or a 401/403 NextResponse.
   */
  public static async requireOrgAdmin(organizationId: string): Promise<
    OrgAdminContext | { errorResponse: ReturnType<typeof ApiResponse.error> }
  > {
    const memberResult = await this.requireOrgMember(organizationId);
    if ('errorResponse' in memberResult) {
      return memberResult;
    }

    const { user, supabase, membership } = memberResult;

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return {
        errorResponse: ApiResponse.error(
          'Forbidden: You do not have organization administrator permissions to perform this action.',
          { userId: user.id, organizationId, role: membership.role },
          403
        ),
      };
    }

    return {
      user,
      supabase,
      organizationId,
      membership: membership as OrgAdminContext['membership'],
    };
  }
}
