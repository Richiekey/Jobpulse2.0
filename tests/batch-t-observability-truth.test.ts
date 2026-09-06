/**
 * JobPulse 2.0 — Batch T: Gate 7 Dedicated Observability & Truthfulness Suite
 * 
 * Reuses authoritative existing telemetry/operational-intelligence RPCs to validate
 * the semantic contracts established by Batch R:
 * 1. URL resolution state (no fabricated direct, null grouped as unresolved)
 * 2. Normalized failure taxonomy (stable machine-readable classes)
 * 3. Temporal versus current workforce metrics (startedInWindow vs inProgress)
 * 4. Verification window versus current backlog (processedInWindow vs pending)
 * 5. Platform versus organization scope (catalog global vs workforce tenant-isolated)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as fs from 'fs';
import { evaluateEnvironmentSafety } from '../scripts/environment-safety';

function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../apps/web/.env.test.local'));
loadEnvFile(path.resolve(__dirname, '../apps/web/.env.test'));
loadEnvFile(path.resolve(__dirname, './.env.test.local'));

const testUrl = process.env['SUPABASE_TEST_URL'] || process.env['NEXT_PUBLIC_SUPABASE_TEST_URL'];
const testAnonKey = process.env['SUPABASE_TEST_ANON_KEY'] || process.env['NEXT_PUBLIC_SUPABASE_TEST_ANON_KEY'];
const testServiceRoleKey = process.env['SUPABASE_TEST_SERVICE_ROLE_KEY'];

describe('Batch T — Gate 7: Observability & Operational Truthfulness Suite', { timeout: 45000 }, () => {
  let adminClient: SupabaseClient;
  let platformAdminClient: SupabaseClient;

  const runId = 't_obs_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const platAdminUserId = crypto.randomUUID();
  const platAdminEmail = `plat-admin-${runId}@jobpulse.test`;
  const testPassword = `PassT!_${runId}`;

  const orgId = crypto.randomUUID();
  const createdUserIds = [platAdminUserId];
  const createdOrgIds = [orgId];
  const createdJobIds: string[] = [];
  const createdSourceRunIds: string[] = [];

  beforeAll(async () => {
    const safety = evaluateEnvironmentSafety();
    if (!safety.safe || safety.isProduction) {
      throw new Error(`[SECURITY_GATE_VIOLATION] Execution halted: ${safety.reason}`);
    }

    if (!testUrl || !testAnonKey || !testServiceRoleKey) {
      throw new Error('[FAIL_CLOSED] Test credentials missing in Gate 7 observability test.');
    }

    adminClient = createClient(testUrl, testServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create platform superadmin
    await adminClient.auth.admin.createUser({
      id: platAdminUserId,
      email: platAdminEmail,
      password: testPassword,
      email_confirm: true,
    });
    await adminClient.from('profiles').upsert({
      id: platAdminUserId,
      role: 'admin',
      email: platAdminEmail,
      full_name: 'Platform Superadmin',
    });

    await adminClient.from('organizations').insert({
      id: orgId,
      name: `Observability Org (${runId})`,
      slug: `obs-org-${runId}`,
    });

    const c = createClient(testUrl, testAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData } = await c.auth.signInWithPassword({
      email: platAdminEmail,
      password: testPassword,
    });

    platformAdminClient = createClient(testUrl, testAnonKey, {
      global: { headers: { Authorization: `Bearer ${authData!.session!.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(async () => {
    try {
      if (createdSourceRunIds.length > 0) {
        await adminClient.from('source_runs').delete().in('id', createdSourceRunIds);
      }
      if (createdJobIds.length > 0) {
        await adminClient.from('jobs').delete().in('id', createdJobIds);
      }
      if (createdOrgIds.length > 0) {
        await adminClient.from('organizations').delete().in('id', createdOrgIds);
      }
      for (const uid of createdUserIds) {
        await adminClient.from('profiles').delete().eq('id', uid);
        await adminClient.auth.admin.deleteUser(uid);
      }
    } catch (e) {
      console.error('[CLEANUP_WARNING] Error during Gate 7 teardown:', e);
    }
  });

  it('1. Semantic Truth: URL resolution state contains zero fabricated direct methods or confidence', async () => {
    const testUnresolvedJobId = crypto.randomUUID();
    createdJobIds.push(testUnresolvedJobId);

    await adminClient.from('jobs').insert({
      id: testUnresolvedJobId,
      title: `Truth Test Job (${runId})`,
      company_name: 'Truth Corp',
      status: 'active',
      source: 'GREENHOUSE',
      apply_url: 'https://example.com/apply/123',
      url_resolution_method: null,
      scraped_at: new Date().toISOString(),
    });

    const { data, error } = await platformAdminClient.rpc('get_operational_intelligence_metrics', {
      p_organization_id: null,
      p_time_range: '24h',
    });

    expect(error).toBeNull();
    const ats = data.dataQuality.atsResolution;

    // NULL url_resolution_method must group under unresolved, never direct
    expect(ats.methods['unresolved']).toBeDefined();
    expect(ats.methods['unresolved']).toBeGreaterThanOrEqual(1);
    expect(ats.methods['direct']).toBeUndefined();
    expect((ats as any).avgConfidence).toBeUndefined();
  });

  it('2. Semantic Truth: Failure taxonomy normalizes raw error strings into machine-readable classes', async () => {
    const testRunId = crypto.randomUUID();
    createdSourceRunIds.push(testRunId);

    await adminClient.from('source_runs').insert({
      id: testRunId,
      source: 'GREENHOUSE',
      status: 'FAILED',
      error_message: 'Request timeout after 30s',
      started_at: new Date().toISOString(),
    });

    const { data, error } = await platformAdminClient.rpc('get_operational_intelligence_metrics', {
      p_organization_id: null,
      p_time_range: '24h',
    });

    expect(error).toBeNull();
    const taxonomy = data.sourceHealth.failureTaxonomy as Array<{ category: string; count: number }>;
    expect(Array.isArray(taxonomy)).toBe(true);

    const categories = taxonomy.map(t => t.category);
    expect(categories).not.toContain('Request timeout after 30s');
    expect(categories).toContain('timeout');
  });

  it('3. Semantic Truth: Disambiguates temporal interval events from active workforce backlog', async () => {
    const { data, error } = await platformAdminClient.rpc('get_operational_intelligence_metrics', {
      p_organization_id: null,
      p_time_range: '24h',
    });

    expect(error).toBeNull();
    expect(data.workforce).toBeDefined();
    expect(typeof data.workforce.velocity.startedInWindow).toBe('number');
    expect(typeof data.workforce.inProgress).toBe('number');
    expect(typeof data.workforce.completionRatePercent).toBe('number');
  });

  it('4. Semantic Truth: Disambiguates windowed verifications from current pending backlog', async () => {
    const { data, error } = await platformAdminClient.rpc('get_operational_intelligence_metrics', {
      p_organization_id: null,
      p_time_range: '24h',
    });

    expect(error).toBeNull();
    expect(data.workforce.verifications).toBeDefined();
    expect(typeof data.workforce.verifications.reviewedInWindow).toBe('number');
    expect(typeof data.workforce.verifications.pendingCurrent).toBe('number');
    expect(typeof data.workforce.verifications.approvalRatePercent).toBe('number');
  });

  it('5. Semantic Truth: Platform scope provides global catalog while organization scope isolates workforce', async () => {
    // Global scope
    const { data: globalData, error: globalErr } = await platformAdminClient.rpc('get_operational_intelligence_metrics', {
      p_organization_id: null,
      p_time_range: '24h',
    });
    expect(globalErr).toBeNull();
    expect(globalData.organizationId).toBeNull();
    expect(globalData.jobs.inventory.totalJobs).toBeGreaterThan(0);

    // Organization scope
    const { data: orgData, error: orgErr } = await platformAdminClient.rpc('get_operational_intelligence_metrics', {
      p_organization_id: orgId,
      p_time_range: '24h',
    });
    expect(orgErr).toBeNull();
    expect(orgData.organizationId).toBe(orgId);
    // Newly created empty org has 0 workforce assignments
    expect(orgData.workforce.roster.totalWorkers).toBe(0);
    expect(orgData.workforce.inProgress).toBe(0);
    // But sees platform job catalog
    expect(orgData.jobs.inventory.totalJobs).toBeGreaterThan(0);
    expect(Math.abs(orgData.jobs.inventory.totalJobs - globalData.jobs.inventory.totalJobs)).toBeLessThanOrEqual(5);
  });
});
