import { describe, it, expect } from 'vitest';
import {
  extractProjectRef,
  evaluateEnvironmentSafety,
  KNOWN_PRODUCTION_PROJECT_REF,
  KNOWN_NON_PRODUCTION_PROJECT_REF,
} from '../scripts/environment-safety';

describe('Batch T — Environment Safety Engine Tests', () => {
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

  it('negative test: strictly rejects production project reference', () => {
    const res1 = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: `https://${KNOWN_PRODUCTION_PROJECT_REF}.supabase.co`,
      SUPABASE_TEST_PROJECT_REF: KNOWN_PRODUCTION_PROJECT_REF,
    });
    expect(res1.safe).toBe(false);
    expect(res1.isProduction).toBe(true);
    expect(res1.projectRef).toBe(KNOWN_PRODUCTION_PROJECT_REF);
    expect(res1.reason).toContain('SECURITY_GATE_VIOLATION');
    expect(res1.reason).toContain('Production database target detected');

    const res2 = evaluateEnvironmentSafety({
      NEXT_PUBLIC_SUPABASE_URL: `https://${KNOWN_PRODUCTION_PROJECT_REF}.supabase.co`,
    });
    expect(res2.safe).toBe(false);
    expect(res2.isProduction).toBe(true);
  });

  it('negative test: fails closed when target environment cannot be determined', () => {
    // Pass empty object and isolate from actual filesystem env
    const res = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: '',
      NEXT_PUBLIC_SUPABASE_TEST_URL: '',
      SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      SUPABASE_TEST_PROJECT_REF: '',
      SUPABASE_PROJECT_REF: '',
    }, 'C:/non-existent-empty-root-dir-safety-test');
    expect(res.safe).toBe(false);
    expect(res.isProduction).toBe(false);
    expect(res.projectRef).toBeNull();
    expect(res.reason).toContain('FAIL_CLOSED');
  });

  it('positive test: permits approved non-production target', () => {
    const res = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: `https://${KNOWN_NON_PRODUCTION_PROJECT_REF}.supabase.co`,
      SUPABASE_TEST_PROJECT_REF: KNOWN_NON_PRODUCTION_PROJECT_REF,
    });
    expect(res.safe).toBe(true);
    expect(res.isProduction).toBe(false);
    expect(res.projectRef).toBe(KNOWN_NON_PRODUCTION_PROJECT_REF);
    expect(res.reason).toContain('Permitted');
  });

  it('positive test: permits local development supabase target', () => {
    const res = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: 'http://127.0.0.1:54321',
      SUPABASE_TEST_PROJECT_REF: 'local-supabase',
      SUPABASE_TEST_SERVICE_ROLE_KEY: 'test-service-key',
      SUPABASE_TEST_ANON_KEY: 'test-anon-key',
    });
    expect(res.safe).toBe(true);
    expect(res.isProduction).toBe(false);
    expect(res.projectRef).toBe('local-supabase');
    expect(res.hasCredentials).toBe(true);
  });

  it('negative test: correctly reports missing credentials when omitted', () => {
    const res = evaluateEnvironmentSafety({
      SUPABASE_TEST_URL: 'http://127.0.0.1:54321',
      SUPABASE_TEST_PROJECT_REF: 'local-supabase',
      SUPABASE_TEST_SERVICE_ROLE_KEY: '',
      SUPABASE_TEST_ANON_KEY: '',
    });
    expect(res.safe).toBe(true);
    expect(res.hasCredentials).toBe(false);
  });
});
