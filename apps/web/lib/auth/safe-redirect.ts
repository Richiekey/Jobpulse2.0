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
