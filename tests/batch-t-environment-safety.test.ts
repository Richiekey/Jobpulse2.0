import { describe, it, expect } from 'vitest';
import {
  extractProjectRef,
  evaluateEnvironmentSafety,
  KNOWN_PRODUCTION_PROJECT_REF,
  KNOWN_NON_PRODUCTION_PROJECT_REF,
  APPROVED_NON_PRODUCTION_PROJECT_REFS,
} from '../scripts/environment-safety';

describe('Batch T — Adversarial Environment Safety Engine Tests', () => {
  it('extracts project reference correctly from diverse formats', () => {
    expect(extractProjectRef('https://rgwutmthzigjmzsmmjnp.supabase.co')).toBe('rgwutmthzigjmzsmmjnp');
    expect(extractProjectRef('https://wvyrivmvpcrhwinzmcyy.supabase.co/')).toBe('wvyrivmvpcrhwinzmcyy');
    expect(extractProjectRef('wvyrivmvpcrhwinzmcyy')).toBe('wvyrivmvpcrhwinzmcyy');
    expect(extractProjectRef('http://127.0.0.1:54321')).toBe('local-supabase');
    expect(extractProjectRef('http://localhost:54321')).toBe('local-supabase');
    expect(extractProjectRef(null)).toBeNull();
    expect(extractProjectRef('')).toBeNull();
    expect(extractProjectRef('not-a-valid-url-or-ref!')).toBeNull();
  });

  // Test A — unknown Supabase project
  it('Test A: unknown Supabase project fails closed as BLOCKED with UNAPPROVED_ENVIRONMENT', () => {
    const res = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: 'https://unknown-project.supabase.co',
      SUPABASE_TEST_PROJECT_REF: 'unknown-project',
      SUPABASE_TEST_SERVICE_ROLE_KEY: 'mock-key',
      SUPABASE_TEST_ANON_KEY: 'mock-key',
    }, 'C:/isolate-from-local-env');

    expect(res.safe).toBe(false);
    expect(res.status).toBe('BLOCKED');
    expect(res.isProduction).toBe(false);
    expect(res.projectRef).toBe('unknown-project');
    expect(res.reason).toContain('UNAPPROVED_ENVIRONMENT');
    expect(res.reason).toContain('not in approved non-production allowlist');
  });

  // Test B — arbitrary syntactically valid project ref
  it('Test B: arbitrary syntactically valid project ref fails closed as BLOCKED', () => {
    const arbitraryRef = 'abcdefghijklmnopqrst'; // 20 chars, syntactically valid
    const res = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: `https://${arbitraryRef}.supabase.co`,
      SUPABASE_TEST_PROJECT_REF: arbitraryRef,
    }, 'C:/isolate-from-local-env');

    expect(res.safe).toBe(false);
    expect(res.status).toBe('BLOCKED');
    expect(res.isProduction).toBe(false);
    expect(res.projectRef).toBe(arbitraryRef);
    expect(res.reason).toContain('UNAPPROVED_ENVIRONMENT');
  });

  // Test C — approved non-production
  it('Test C: approved non-production project wvyrivmvpcrhwinzmcyy is PERMITTED', () => {
    const res = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: `https://${KNOWN_NON_PRODUCTION_PROJECT_REF}.supabase.co`,
      SUPABASE_TEST_PROJECT_REF: KNOWN_NON_PRODUCTION_PROJECT_REF,
      SUPABASE_TEST_SERVICE_ROLE_KEY: 'mock-key',
      SUPABASE_TEST_ANON_KEY: 'mock-key',
    }, 'C:/isolate-from-local-env');

    expect(res.safe).toBe(true);
    expect(res.status).toBe('PERMITTED');
    expect(res.isProduction).toBe(false);
    expect(res.projectRef).toBe(KNOWN_NON_PRODUCTION_PROJECT_REF);
    expect(res.reason).toContain('Permitted');
    expect(res.hasCredentials).toBe(true);
  });

  // Test D — production
  it('Test D: production project rgwutmthzigjmzsmmjnp is strictly BLOCKED', () => {
    const res = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: `https://${KNOWN_PRODUCTION_PROJECT_REF}.supabase.co`,
      SUPABASE_TEST_PROJECT_REF: KNOWN_PRODUCTION_PROJECT_REF,
    }, 'C:/isolate-from-local-env');

    expect(res.safe).toBe(false);
    expect(res.status).toBe('BLOCKED');
    expect(res.isProduction).toBe(true);
    expect(res.projectRef).toBe(KNOWN_PRODUCTION_PROJECT_REF);
    expect(res.reason).toContain('SECURITY_GATE_VIOLATION');
    expect(res.reason).toContain('Production database target detected');
  });

  // Test E — production hidden in another candidate environment variable
  it('Test E: production cannot bypass the check by appearing in any candidate environment variable', () => {
    const candidateVars = [
      'SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_TEST_URL',
      'NEXT_PUBLIC_SUPABASE_TEST_URL',
      'SUPABASE_PROJECT_REF',
      'SUPABASE_TEST_PROJECT_REF',
      'NEXT_PUBLIC_SUPABASE_PROJECT_REF',
      'NEXT_PUBLIC_SUPABASE_TEST_PROJECT_REF',
    ];

    for (const varName of candidateVars) {
      // Even if legitimate test vars are also passed, production in varName MUST trigger BLOCKED
      const envObj: Record<string, string> = {
        SUPABASE_TEST_URL: `https://${KNOWN_NON_PRODUCTION_PROJECT_REF}.supabase.co`,
        SUPABASE_TEST_PROJECT_REF: KNOWN_NON_PRODUCTION_PROJECT_REF,
      };

      if (varName.includes('REF')) {
        envObj[varName] = KNOWN_PRODUCTION_PROJECT_REF;
      } else {
        envObj[varName] = `https://${KNOWN_PRODUCTION_PROJECT_REF}.supabase.co`;
      }

      const res = evaluateEnvironmentSafety(envObj, 'C:/isolate-from-local-env');
      expect(res.safe).toBe(false);
      expect(res.status).toBe('BLOCKED');
      expect(res.isProduction).toBe(true);
      expect(res.projectRef).toBe(KNOWN_PRODUCTION_PROJECT_REF);
      expect(res.reason).toContain(varName);
    }
  });

  // Test F — missing / unknown target
  it('Test F: missing/unknown target fails closed as BLOCKED', () => {
    const res = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: '',
      NEXT_PUBLIC_SUPABASE_TEST_URL: '',
      SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      SUPABASE_TEST_PROJECT_REF: '',
      SUPABASE_PROJECT_REF: '',
    }, 'C:/isolate-from-local-env');

    expect(res.safe).toBe(false);
    expect(res.status).toBe('BLOCKED');
    expect(res.isProduction).toBe(false);
    expect(res.projectRef).toBeNull();
    expect(res.reason).toContain('FAIL_CLOSED');
  });

  // Test G — malformed / unparseable target URL
  it('Test G: malformed URL fails closed as BLOCKED', () => {
    const res = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: 'not-a-valid-url-or-ref!',
    }, 'C:/isolate-from-local-env');

    expect(res.safe).toBe(false);
    expect(res.status).toBe('BLOCKED');
    expect(res.isProduction).toBe(false);
    expect(res.projectRef).toBeNull();
    expect(res.reason).toContain('FAIL_CLOSED: Target Supabase URL is malformed or unparseable');
  });

  // Test H — local development instance
  it('Test H: permits approved local development Supabase target', () => {
    const res = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: 'http://127.0.0.1:54321',
      SUPABASE_TEST_PROJECT_REF: 'local-supabase',
      SUPABASE_TEST_SERVICE_ROLE_KEY: 'test-service-key',
      SUPABASE_TEST_ANON_KEY: 'test-anon-key',
    }, 'C:/isolate-from-local-env');

    expect(res.safe).toBe(true);
    expect(res.status).toBe('PERMITTED');
    expect(res.isProduction).toBe(false);
    expect(res.projectRef).toBe('local-supabase');
    expect(res.hasCredentials).toBe(true);
  });

  // Test I — credential completeness reporting
  it('Test I: correctly detects when credentials are provided vs omitted', () => {
    const withoutCreds = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: 'http://127.0.0.1:54321',
      SUPABASE_TEST_PROJECT_REF: 'local-supabase',
      SUPABASE_TEST_SERVICE_ROLE_KEY: '',
      SUPABASE_TEST_ANON_KEY: '',
    }, 'C:/isolate-from-local-env');
    expect(withoutCreds.safe).toBe(true);
    expect(withoutCreds.hasCredentials).toBe(false);

    const withCreds = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: 'http://127.0.0.1:54321',
      SUPABASE_TEST_PROJECT_REF: 'local-supabase',
      SUPABASE_TEST_SERVICE_ROLE_KEY: 'valid-role-key',
      SUPABASE_TEST_ANON_KEY: 'valid-anon-key',
    }, 'C:/isolate-from-local-env');
    expect(withCreds.safe).toBe(true);
    expect(withCreds.hasCredentials).toBe(true);
  });
});
