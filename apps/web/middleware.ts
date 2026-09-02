import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Global authentication middleware.
 *
 * Responsibilities:
 * 1. Refresh expired Supabase sessions on every request (required by @supabase/ssr)
 * 2. Redirect unauthenticated page requests to /login
 * 3. Return 401 JSON for unauthenticated API requests
 * 4. Exempt public paths: /login, /auth/callback, /api/health, /api/ready
 *
 * This middleware enforces AuthN only — RBAC (admin checks) is enforced
 * at the route level via AuthGuard.requireAdmin().
 */

const PUBLIC_PATHS = new Set(['/login', '/auth/callback']);
const PUBLIC_API_PATHS = new Set(['/api/health', '/api/ready']);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_API_PATHS.has(pathname);
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] || '',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Always call getUser() to refresh the session token.
  // Do NOT use getSession() — it reads from storage without validation.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Allow public paths through unconditionally
  if (isPublicPath(pathname)) {
    // If authenticated user visits /login, redirect to home
    if (pathname === '/login' && user) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Unauthenticated request handling
  if (!user) {
    if (isApiRoute(pathname)) {
      // API routes: return 401 JSON
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Authentication is required.',
          requestId: `req_mw_${Date.now().toString(36)}`,
        },
        { status: 401 }
      );
    }

    // Page routes: redirect to /login
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - Static assets (svg, png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
