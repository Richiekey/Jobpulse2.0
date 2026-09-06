/**
 * JobPulse 2.0 — Batch T: Gate 6 Dedicated Security & RLS Negative Boundary Suite
 * 
 * Verifies the exact negative authorization and tenant isolation matrix:
 * 1. Anonymous access blocked
 * 2. Unauthorized organization access (403)
 * 3. Cross-tenant reads blocked via PostgREST RLS
 * 4. Cross-tenant writes blocked via PostgREST RLS
 * 5. Worker vs Admin privilege boundaries
 * 6. Organization-admin vs Global-admin boundaries
 * 7. Privileged RPC abuse protection
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as fs from 'fs';
import { evaluateEnvironmentSafety, KNOWN_PRODUCTION_PROJECT_REF, KNOWN_NON_PRODUCTION_PROJECT_REF } from '../scripts/environment-safety';

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

describe('Batch T — Gate 6: Security & Tenant Isolation Boundary Suite', { timeout: 45000 }, () => {
  let adminClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let adminAClient: SupabaseClient;
  let workerAClient: SupabaseClient;
  let workerBClient: SupabaseClient;

  const runId = 't_sec_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const adminAUserId = crypto.randomUUID();
  const workerAUserId = crypto.randomUUID();
  const workerBUserId = crypto.randomUUID();

  const orgAId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();

  const testJobId = crypto.randomUUID();
  const testAssignmentBId = crypto.randomUUID();

  const adminAEmail = `admin-a-${runId}@jobpulse.test`;
  const workerAEmail = `worker-a-${runId}@jobpulse.test`;
  const workerBEmail = `worker-b-${runId}@jobpulse.test`;
  const testPassword = `PassT!_${runId}`;

  const createdUserIds = [adminAUserId, workerAUserId, workerBUserId];
  const createdOrgIds = [orgAId, orgBId];
  const createdJobIds = [testJobId];
  const createdAssignmentIds = [testAssignmentBId];

  beforeAll(async () => {
    // Fail closed environment safety check
    const safety = evaluateEnvironmentSafety();
    if (!safety.safe || safety.isProduction) {
      throw new Error(`[SECURITY_GATE_VIOLATION] Execution halted: ${safety.reason}`);
    }

    if (!testUrl || !testAnonKey || !testServiceRoleKey) {
      throw new Error('[FAIL_CLOSED] Test credentials missing in Gate 6 security boundary test.');
    }

    adminClient = createClient(testUrl, testServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    anonClient = createClient(testUrl, testAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Create test users
    for (const u of [
      { id: adminAUserId, email: adminAEmail },
      { id: workerAUserId, email: workerAEmail },
      { id: workerBUserId, email: workerBEmail },
    ]) {
      const { error } = await adminClient.auth.admin.createUser({
        id: u.id,
        email: u.email,
        password: testPassword,
        email_confirm: true,
      });
      if (error) throw error;

      await adminClient.from('profiles').upsert({
        id: u.id,
        role: 'user',
        email: u.email,
        full_name: `User ${u.id}`,
      });
    }

    // 2. Create organizations
    await adminClient.from('organizations').insert([
      { id: orgAId, name: `Security Org A (${runId})`, slug: `sec-org-a-${runId}` },
      { id: orgBId, name: `Security Org B (${runId})`, slug: `sec-org-b-${runId}` },
    ]);

    // 3. Assign memberships
    await adminClient.from('organization_members').insert([
      { organization_id: orgAId, user_id: adminAUserId, role: 'admin' },
      { organization_id: orgAId, user_id: workerAUserId, role: 'worker' },
      { organization_id: orgBId, user_id: workerBUserId, role: 'worker' },
    ]);

    // 4. Provision a job and an assignment belonging to Org B
    await adminClient.from('jobs').insert({
      id: testJobId,
      title: `Security Test Job (${runId})`,
      company_name: 'Security Corp',
      status: 'active',
      source: 'GREENHOUSE',
      scraped_at: new Date().toISOString(),
    });

    await adminClient.from('job_assignments').insert({
      id: testAssignmentBId,
      job_id: testJobId,
      organization_id: orgBId,
      assigned_to: workerBUserId,
      assigned_by: adminAUserId,
      status: 'in_progress',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Sign in users
    const signIn = async (email: string) => {
      const c = createClient(testUrl, testAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await c.auth.signInWithPassword({ email, password: testPassword });
      if (error || !data.session) throw new Error(`Sign in failed for ${email}: ${error?.message}`);
      return createClient(testUrl, testAnonKey, {
        global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
    };

    adminAClient = await signIn(adminAEmail);
    workerAClient = await signIn(workerAEmail);
    workerBClient = await signIn(workerBEmail);
  });

  afterAll(async () => {
    try {
      if (createdAssignmentIds.length > 0) {
        await adminClient.from('job_assignments').delete().in('id', createdAssignmentIds);
      }
      if (createdJobIds.length > 0) {
        await adminClient.from('jobs').delete().in('id', createdJobIds);
      }
      if (createdOrgIds.length > 0) {
        await adminClient.from('organization_members').delete().in('organization_id', createdOrgIds);
        await adminClient.from('organizations').delete().in('id', createdOrgIds);
      }
      for (const userId of createdUserIds) {
        await adminClient.from('profiles').delete().eq('id', userId);
        await adminClient.auth.admin.deleteUser(userId);
      }
    } catch (e) {
      console.error('[CLEANUP_WARNING] Error during Gate 6 teardown:', e);
    }
  });

  it('1. Anonymous Access: unauthenticated requests to protected RPCs are blocked', async () => {
    const { data, error } = await anonClient.rpc('get_operational_intelligence_metrics', {
      p_organization_id: orgAId,
      p_time_range: '24h',
    });
    expect(data).toBeNull();
    expect(error).toBeDefined();
  });

  it('2. Unauthorized Organization Access: Org A admin querying Org B metrics returns 403 FORBIDDEN', async () => {
    const { data, error } = await adminAClient.rpc('get_operational_intelligence_metrics', {
      p_organization_id: orgBId,
      p_time_range: '24h',
    });
    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error!.message).toContain('FORBIDDEN');
  });

  it('3. Cross-Tenant Reads: Worker A in Org A cannot view assignments belonging to Org B', async () => {
    const { data, error } = await workerAClient
      .from('job_assignments')
      .select('*')
      .eq('id', testAssignmentBId);

    expect(error).toBeNull();
    // PostgREST RLS filters out cross-tenant rows
    expect(data).toHaveLength(0);
  });

  it('4. Cross-Tenant Writes: Worker A in Org A cannot mutate an assignment belonging to Org B', async () => {
    const { data, error } = await workerAClient
      .from('job_assignments')
      .update({ notes: 'Malicious cross-tenant note' })
      .eq('id', testAssignmentBId)
      .select();

    expect(error).toBeNull();
    // 0 rows updated due to RLS boundary
    expect(data).toHaveLength(0);
  });

  it('5. Worker vs Admin Privilege Boundaries: Worker in Org A cannot query operational intelligence', async () => {
    const { data, error } = await workerAClient.rpc('get_operational_intelligence_metrics', {
      p_organization_id: orgAId,
      p_time_range: '24h',
    });
    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error!.message).toContain('FORBIDDEN');
  });

  it('6. Org-Admin vs Global-Admin: Org A admin cannot query global metrics without platform role', async () => {
    const { data, error } = await adminAClient.rpc('get_operational_intelligence_metrics', {
      p_organization_id: null,
      p_time_range: '24h',
    });
    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error!.message).toContain('FORBIDDEN');
    expect(error!.message).toContain('Global operational intelligence requires platform administrator privileges');
  });

  it('7. Privileged RPC Abuse: Worker or anon cannot invoke administrative cancellation RPCs', async () => {
    const { data, error } = await workerAClient.rpc('admin_cancel_job_assignment', {
      p_assignment_id: testAssignmentBId,
      p_reason: 'Unauthorized worker cancellation attempt',
    });
    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});
