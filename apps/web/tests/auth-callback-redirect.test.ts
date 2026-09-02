import { describe, it, expect } from 'vitest';
import { sanitizeSafeRedirectPath } from '../lib/auth/safe-redirect';

/**
 * Open-Redirect Prevention Regression Tests
 *
 * Validates that the auth callback's `next` parameter sanitizer
 * only allows safe internal relative paths and rejects all known
 * open-redirect attack vectors.
 */
describe('Auth Callback Open-Redirect Prevention', () => {
  // -----------------------------------------------------------------------
  // SAFE INTERNAL PATHS — should pass through unchanged
  // -----------------------------------------------------------------------
  describe('allows safe internal relative paths', () => {
    it('accepts root path /', () => {
      expect(sanitizeSafeRedirectPath('/')).toBe('/');
    });

    it('accepts simple internal path /dashboard', () => {
      expect(sanitizeSafeRedirectPath('/dashboard')).toBe('/dashboard');
    });

    it('accepts nested path /admin/metrics', () => {
      expect(sanitizeSafeRedirectPath('/admin/metrics')).toBe('/admin/metrics');
    });

    it('accepts path with query string /jobs?q=react', () => {
      expect(sanitizeSafeRedirectPath('/jobs?q=react')).toBe('/jobs?q=react');
    });

    it('accepts path with hash /settings#notifications', () => {
      expect(sanitizeSafeRedirectPath('/settings#notifications')).toBe('/settings#notifications');
    });
  });

  // -----------------------------------------------------------------------
  // NULL / EMPTY — should fall back to /
  // -----------------------------------------------------------------------
  describe('falls back to / for null or empty values', () => {
    it('returns / for null', () => {
      expect(sanitizeSafeRedirectPath(null)).toBe('/');
    });

    it('returns / for empty string', () => {
      expect(sanitizeSafeRedirectPath('')).toBe('/');
    });

    it('returns / for whitespace-only string', () => {
      expect(sanitizeSafeRedirectPath('   ')).toBe('/');
    });
  });

  // -----------------------------------------------------------------------
  // ABSOLUTE URLs — must be rejected
  // -----------------------------------------------------------------------
  describe('rejects absolute URLs', () => {
    it('rejects https://evil.com', () => {
      expect(sanitizeSafeRedirectPath('https://evil.com')).toBe('/');
    });

    it('rejects http://evil.com/phish', () => {
      expect(sanitizeSafeRedirectPath('http://evil.com/phish')).toBe('/');
    });

    it('rejects ftp://evil.com', () => {
      expect(sanitizeSafeRedirectPath('ftp://evil.com')).toBe('/');
    });
  });

  // -----------------------------------------------------------------------
  // PROTOCOL-RELATIVE URLs — must be rejected
  // -----------------------------------------------------------------------
  describe('rejects protocol-relative URLs', () => {
    it('rejects //evil.com', () => {
      expect(sanitizeSafeRedirectPath('//evil.com')).toBe('/');
    });

    it('rejects //evil.com/path', () => {
      expect(sanitizeSafeRedirectPath('//evil.com/path')).toBe('/');
    });

    it('rejects ///evil.com', () => {
      expect(sanitizeSafeRedirectPath('///evil.com')).toBe('/');
    });
  });

  // -----------------------------------------------------------------------
  // DANGEROUS SCHEMES — must be rejected
  // -----------------------------------------------------------------------
  describe('rejects dangerous schemes', () => {
    it('rejects javascript: scheme', () => {
      expect(sanitizeSafeRedirectPath('/javascript:alert(1)')).toBe('/');
    });

    it('rejects data: scheme', () => {
      expect(sanitizeSafeRedirectPath('/data:text/html,<script>alert(1)</script>')).toBe('/');
    });

    it('rejects blob: scheme', () => {
      expect(sanitizeSafeRedirectPath('/blob:http://evil.com')).toBe('/');
    });

    it('rejects vbscript: scheme', () => {
      expect(sanitizeSafeRedirectPath('/vbscript:msgbox')).toBe('/');
    });

    it('rejects file: scheme', () => {
      expect(sanitizeSafeRedirectPath('/file:///etc/passwd')).toBe('/');
    });

    it('rejects URL-encoded javascript scheme', () => {
      expect(sanitizeSafeRedirectPath('/%6Aavascript:alert(1)')).toBe('/');
    });
  });

  // -----------------------------------------------------------------------
  // BACKSLASH EVASION — must be rejected
  // -----------------------------------------------------------------------
  describe('rejects backslash evasion attacks', () => {
    it('rejects /\\evil.com', () => {
      expect(sanitizeSafeRedirectPath('/\\evil.com')).toBe('/');
    });

    it('rejects /\\\\evil.com', () => {
      expect(sanitizeSafeRedirectPath('/\\\\evil.com')).toBe('/');
    });
  });

  // -----------------------------------------------------------------------
  // USER-INFO SYNTAX EVASION — must be rejected
  // -----------------------------------------------------------------------
  describe('rejects user-info @ syntax attacks', () => {
    it('rejects /foo@evil.com', () => {
      expect(sanitizeSafeRedirectPath('/foo@evil.com')).toBe('/');
    });
  });

  // -----------------------------------------------------------------------
  // NO LEADING SLASH — must be rejected
  // -----------------------------------------------------------------------
  describe('rejects paths without leading slash', () => {
    it('rejects relative path dashboard', () => {
      expect(sanitizeSafeRedirectPath('dashboard')).toBe('/');
    });

    it('rejects evil.com (no scheme, no slash)', () => {
      expect(sanitizeSafeRedirectPath('evil.com')).toBe('/');
    });
  });
});
