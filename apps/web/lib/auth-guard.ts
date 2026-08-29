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
}
