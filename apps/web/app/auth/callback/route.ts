import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * Validates that a redirect target is a safe, internal relative path.
 * Rejects absolute URLs, protocol-relative URLs (//...), javascript/data/blob
 * schemes, and any value containing an external hostname.
 * Falls back to '/' for unsafe values.
 */
export function sanitizeSafeRedirectPath(raw: string | null): string {
  const fallback = '/';
  if (!raw) return fallback;

  // Trim whitespace (handles encoded whitespace evasion)
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  // Must start with exactly one '/' — reject protocol-relative '//...'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback;

  // Reject dangerous schemes like javascript:, data:, blob: (case-insensitive)
  // Also catches url-encoded variants via decodeURIComponent
  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed).toLowerCase();
  } catch {
    // Malformed URI encoding — reject
    return fallback;
  }

  const dangerousSchemes = ['javascript:', 'data:', 'blob:', 'vbscript:', 'file:'];
  for (const scheme of dangerousSchemes) {
    if (decoded.includes(scheme)) return fallback;
  }

  // Reject backslash (browser quirk: `/\evil.com` → `//evil.com` in some UAs)
  if (trimmed.includes('\\')) return fallback;

  // Reject any '@' character (user-info syntax: `//user@evil.com`)
  if (trimmed.includes('@')) return fallback;

  return trimmed;
}

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
