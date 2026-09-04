import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { GoogleOAuthService } from '@/lib/google-oauth';
import { signOAuthState } from '@jobpulse/domain';
import { ConnectGoogleOAuthQuerySchema } from '@jobpulse/validation';

export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user } = authResult;
    const { searchParams } = new URL(request.url);

    const queryParse = ConnectGoogleOAuthQuerySchema.safeParse({
      organizationId: searchParams.get('organizationId') || undefined,
      redirectTarget: searchParams.get('redirectTarget') || undefined,
    });

    if (!queryParse.success) {
      return ApiResponse.error(
        'Invalid connect parameters',
        queryParse.error.flatten(),
        400
      );
    }

    const { organizationId, redirectTarget } = queryParse.data;

    // If an organization context is requested, enforce that caller is an Org Admin
    if (organizationId) {
      const orgAdminResult = await AuthGuard.requireOrgAdmin(organizationId);
      if ('errorResponse' in orgAdminResult) {
        return orgAdminResult.errorResponse;
      }
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const signedState = signOAuthState({
      userId: user.id,
      organizationId: organizationId || null,
      timestamp: Date.now(),
      nonce,
      redirectTarget: redirectTarget || undefined,
    });

    const authUrl = GoogleOAuthService.buildAuthorizationUrl(signedState);

    const cookieStore = await cookies();
    cookieStore.set('jobpulse_google_oauth_state', signedState, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60, // 15 minutes
    });

    const wantsJson =
      searchParams.get('json') === 'true' ||
      request.headers.get('accept')?.includes('application/json');

    if (wantsJson) {
      return ApiResponse.success({
        authorizationUrl: authUrl,
        state: signedState,
      });
    }

    return NextResponse.redirect(authUrl);
  } catch (error: unknown) {
    return ApiResponse.error('Failed to initiate Google OAuth flow', error, 500);
  }
}
