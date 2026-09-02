import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { sanitizeSafeRedirectPath } from '@/lib/auth/safe-redirect';

/**
 * GET /auth/callback
 *
 * Handles the Supabase auth code exchange after email confirmation
 * or OAuth redirects. Exchanges the code for a session and redirects
 * to the requested page (or /).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeSafeRedirectPath(searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] || '',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  return response;
}
