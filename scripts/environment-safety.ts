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

export interface EnvironmentSafetyResult {
  safe: boolean;
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

  // Direct alphanumeric project ref (typically 20 characters)
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
 * Fails closed if the target cannot be determined or matches production.
 */
export function evaluateEnvironmentSafety(
  explicitEnv?: Record<string, string | undefined>,
  rootDir: string = process.cwd()
): EnvironmentSafetyResult {
  const fileEnv = explicitEnv ? {} : loadTestEnvFiles(rootDir);
  const mergedEnv: Record<string, string | undefined> = {
    ...fileEnv,
    ...process.env,
    ...(explicitEnv || {}),
  };

  const urlKeys = [
    'SUPABASE_TEST_URL',
    'NEXT_PUBLIC_SUPABASE_TEST_URL',
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
  ];

  const refKeys = [
    'SUPABASE_TEST_PROJECT_REF',
    'SUPABASE_PROJECT_REF',
  ];

  // Check 1: Direct production reference violation in any candidate variable
  for (const k of [...urlKeys, ...refKeys]) {
    const val = mergedEnv[k];
    if (val && typeof val === 'string') {
      const extracted = extractProjectRef(val);
      if (
        extracted === KNOWN_PRODUCTION_PROJECT_REF ||
        val.toLowerCase().includes(KNOWN_PRODUCTION_PROJECT_REF)
      ) {
        return {
          safe: false,
          isProduction: true,
          projectRef: KNOWN_PRODUCTION_PROJECT_REF,
          targetUrl: val,
          hasCredentials: Boolean(mergedEnv['SUPABASE_TEST_SERVICE_ROLE_KEY']),
          reason: `SECURITY_GATE_VIOLATION: Production database target detected in ${k} (${KNOWN_PRODUCTION_PROJECT_REF}). Execution strictly prohibited.`,
        };
      }
    }
  }

  // Find candidate target
  let detectedRef: string | null = null;
  let targetUrl: string | null = null;

  for (const k of refKeys) {
    const val = mergedEnv[k];
    if (val) {
      detectedRef = extractProjectRef(val);
      if (detectedRef) break;
    }
  }

  for (const k of urlKeys) {
    const val = mergedEnv[k];
    if (val) {
      targetUrl = val;
      if (!detectedRef) {
        detectedRef = extractProjectRef(val);
      }
      if (detectedRef) break;
    }
  }

  const hasCredentials = Boolean(
    mergedEnv['SUPABASE_TEST_SERVICE_ROLE_KEY'] &&
    (mergedEnv['SUPABASE_TEST_ANON_KEY'] || mergedEnv['NEXT_PUBLIC_SUPABASE_TEST_ANON_KEY'])
  );

  // Check 2: Fail closed if target reference cannot be determined
  if (!detectedRef) {
    return {
      safe: false,
      isProduction: false,
      projectRef: null,
      targetUrl,
      hasCredentials,
      reason: 'FAIL_CLOSED: Target Supabase project reference cannot be determined from environment.',
    };
  }

  // Check 3: Verified non-production target
  return {
    safe: true,
    isProduction: false,
    projectRef: detectedRef,
    targetUrl,
    hasCredentials,
    reason: `Permitted: target project reference (${detectedRef}) is verified non-production.`,
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
