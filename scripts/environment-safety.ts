/**
 * JobPulse 2.0 — Environment Safety Engine (Batch T)
 * 
 * Fail-closed security control to prohibit execution against production database.
 * Strictly verifies environment configuration before any live database tests run.
 */

import * as fs from 'fs';
import * as path from 'path';

export const KNOWN_PRODUCTION_PROJECT_REF = 'rgwutmthzigjmzsmmjnp';
export const KNOWN_NON_PRODUCTION_PROJECT_REF = 'wvyrivmvpcrhwinzmcyy';
export const APPROVED_NON_PRODUCTION_PROJECT_REFS = ['wvyrivmvpcrhwinzmcyy'] as const;
export const APPROVED_LOCAL_TARGETS = ['local-supabase', '127.0.0.1', 'localhost'] as const;

export interface EnvironmentSafetyResult {
  safe: boolean;
  status: 'PERMITTED' | 'BLOCKED';
  isProduction: boolean;
  projectRef: string | null;
  targetUrl: string | null;
  hasCredentials: boolean;
  reason: string;
}

/**
 * Extracts a Supabase project reference from a URL or raw reference string.
 */
export function extractProjectRef(urlOrRef?: string | null): string | null {
  if (!urlOrRef || typeof urlOrRef !== 'string') return null;
  const trimmed = urlOrRef.trim();
  if (!trimmed) return null;

  // Pattern: https://<ref>.supabase.co
  const supabaseUrlMatch = trimmed.match(/^https?:\/\/([a-z0-9_-]+)\.supabase\.co/i);
  if (supabaseUrlMatch && supabaseUrlMatch[1]) {
    return supabaseUrlMatch[1].toLowerCase();
  }

  // Local Supabase instances
  if (trimmed.includes('127.0.0.1') || trimmed.includes('localhost')) {
    return 'local-supabase';
  }

  // Direct alphanumeric project ref (typically 15-30 characters)
  if (/^[a-z0-9]{15,30}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
}

/**
 * Loads test environment variables from test env files if present.
 */
export function loadTestEnvFiles(rootDir: string = process.cwd()): Record<string, string> {
  const env: Record<string, string> = {};
  const paths = [
    path.resolve(rootDir, 'apps/web/.env.test.local'),
    path.resolve(rootDir, 'apps/web/.env.test'),
    path.resolve(rootDir, 'tests/.env.test.local'),
    path.resolve(rootDir, '.env.test.local'),
    path.resolve(rootDir, '.env.test'),
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!env[key]) {
              env[key] = val;
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  return env;
}

/**
 * Evaluates whether the configured environment is safe to execute tests against.
 * Fails closed if the target cannot be determined, is unapproved, or matches production.
 */
export function evaluateEnvironmentSafety(
  explicitEnv?: Record<string, string | undefined>,
  rootDir: string = process.cwd()
): EnvironmentSafetyResult {
  const fileEnv = explicitEnv ? {} : loadTestEnvFiles(rootDir);
  const baseEnv = explicitEnv ? {} : process.env;
  const mergedEnv: Record<string, string | undefined> = {
    ...fileEnv,
    ...baseEnv,
    ...(explicitEnv || {}),
  };

  const candidateKeys = [
    'SUPABASE_TEST_URL',
    'NEXT_PUBLIC_SUPABASE_TEST_URL',
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_TEST_PROJECT_REF',
    'NEXT_PUBLIC_SUPABASE_TEST_PROJECT_REF',
    'SUPABASE_PROJECT_REF',
    'NEXT_PUBLIC_SUPABASE_PROJECT_REF',
  ];

  // Check 1: Direct production reference violation in any candidate variable
  for (const k of candidateKeys) {
    const val = mergedEnv[k];
    if (val && typeof val === 'string') {
      const extracted = extractProjectRef(val);
      if (
        extracted === KNOWN_PRODUCTION_PROJECT_REF ||
        val.toLowerCase().includes(KNOWN_PRODUCTION_PROJECT_REF)
      ) {
        return {
          safe: false,
          status: 'BLOCKED',
          isProduction: true,
          projectRef: KNOWN_PRODUCTION_PROJECT_REF,
          targetUrl: val,
          hasCredentials: Boolean(mergedEnv['SUPABASE_TEST_SERVICE_ROLE_KEY']),
          reason: `SECURITY_GATE_VIOLATION: Production database target detected in ${k} (${KNOWN_PRODUCTION_PROJECT_REF}). Execution strictly prohibited.`,
        };
      }
    }
  }

  // Find candidate target URL
  let targetUrl: string | null = null;
  for (const k of [
    'SUPABASE_TEST_URL',
    'NEXT_PUBLIC_SUPABASE_TEST_URL',
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
  ]) {
    const val = mergedEnv[k];
    if (val && typeof val === 'string' && val.trim()) {
      targetUrl = val.trim();
      break;
    }
  }

  // Find candidate explicit project ref
  let refFromKeys: string | null = null;
  for (const k of [
    'SUPABASE_TEST_PROJECT_REF',
    'NEXT_PUBLIC_SUPABASE_TEST_PROJECT_REF',
    'SUPABASE_PROJECT_REF',
    'NEXT_PUBLIC_SUPABASE_PROJECT_REF',
  ]) {
    const val = mergedEnv[k];
    if (val && typeof val === 'string' && val.trim()) {
      refFromKeys = extractProjectRef(val.trim());
      if (refFromKeys) break;
    }
  }

  let urlRef: string | null = null;
  if (targetUrl) {
    urlRef = extractProjectRef(targetUrl);
    // Check 2: If target URL exists but cannot be parsed, fail closed
    if (!urlRef) {
      return {
        safe: false,
        status: 'BLOCKED',
        isProduction: false,
        projectRef: null,
        targetUrl,
        hasCredentials: Boolean(mergedEnv['SUPABASE_TEST_SERVICE_ROLE_KEY']),
        reason: 'FAIL_CLOSED: Target Supabase URL is malformed or unparseable.',
      };
    }
  }

  // Check 3: If both target URL and explicit ref are provided, they must agree
  if (urlRef && refFromKeys && urlRef !== refFromKeys) {
    return {
      safe: false,
      status: 'BLOCKED',
      isProduction: false,
      projectRef: urlRef,
      targetUrl,
      hasCredentials: Boolean(mergedEnv['SUPABASE_TEST_SERVICE_ROLE_KEY']),
      reason: `FAIL_CLOSED: Project reference mismatch between target URL (${urlRef}) and project ref variable (${refFromKeys}).`,
    };
  }

  const detectedRef = urlRef || refFromKeys;

  const hasCredentials = Boolean(
    mergedEnv['SUPABASE_TEST_SERVICE_ROLE_KEY'] &&
    (mergedEnv['SUPABASE_TEST_ANON_KEY'] || mergedEnv['NEXT_PUBLIC_SUPABASE_TEST_ANON_KEY'])
  );

  // Check 4: Fail closed if target reference cannot be determined from environment
  if (!detectedRef) {
    return {
      safe: false,
      status: 'BLOCKED',
      isProduction: false,
      projectRef: null,
      targetUrl,
      hasCredentials,
      reason: 'FAIL_CLOSED: Target Supabase project reference cannot be determined from environment.',
    };
  }

  // Check 5: Approved isolated non-production target
  if ((APPROVED_NON_PRODUCTION_PROJECT_REFS as readonly string[]).includes(detectedRef)) {
    return {
      safe: true,
      status: 'PERMITTED',
      isProduction: false,
      projectRef: detectedRef,
      targetUrl,
      hasCredentials,
      reason: `Permitted: Target project reference (${detectedRef}) is an approved isolated non-production environment.`,
    };
  }

  // Check 6: Approved local test environment
  if ((APPROVED_LOCAL_TARGETS as readonly string[]).includes(detectedRef)) {
    return {
      safe: true,
      status: 'PERMITTED',
      isProduction: false,
      projectRef: detectedRef,
      targetUrl,
      hasCredentials,
      reason: `Permitted: Target project reference (${detectedRef}) is an approved local development instance.`,
    };
  }

  // Check 7: Unapproved / unknown environment - Fail closed
  return {
    safe: false,
    status: 'BLOCKED',
    isProduction: false,
    projectRef: detectedRef,
    targetUrl,
    hasCredentials,
    reason: `UNAPPROVED_ENVIRONMENT: Target Supabase project reference (${detectedRef}) is not in approved non-production allowlist.`,
  };
}

// CLI execution check
if (process.argv[1] && process.argv[1].endsWith('environment-safety.ts')) {
  const result = evaluateEnvironmentSafety();
  console.log('Environment Safety Audit:');
  console.log(`- Safe: ${result.safe ? 'YES' : 'NO'}`);
  console.log(`- Is Production: ${result.isProduction ? 'YES' : 'NO'}`);
  console.log(`- Project Ref: ${result.projectRef || 'UNKNOWN'}`);
  console.log(`- Reason: ${result.reason}`);

  if (!result.safe) {
    process.exit(1);
  }
}
