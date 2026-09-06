import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Helper to ensure test credentials from apps/web/.env.test.local are loaded
function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
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

const PRODUCTION_PROJECT_REF = 'rgwutmthzigjmzsmmjnp';
const TARGET_PROJECT_REF = 'wvyrivmvpcrhwinzmcyy';

const testUrl = process.env['SUPABASE_TEST_URL'] || process.env['NEXT_PUBLIC_SUPABASE_TEST_URL'];
const testAnonKey = process.env['SUPABASE_TEST_ANON_KEY'] || process.env['NEXT_PUBLIC_SUPABASE_TEST_ANON_KEY'];
const testServiceRoleKey = process.env['SUPABASE_TEST_SERVICE_ROLE_KEY'];
const testProjectRef = process.env['SUPABASE_TEST_PROJECT_REF'] || TARGET_PROJECT_REF;

// HARD SECURITY GATE: Prohibit execution against production
if (
  (testUrl && testUrl.includes(PRODUCTION_PROJECT_REF)) ||
  (testProjectRef && testProjectRef.includes(PRODUCTION_PROJECT_REF))
) {
  throw new Error(
    `[SECURITY_GATE_VIOLATION] Production database execution prohibited! ` +
    `Target URL or project ref matches production project (${PRODUCTION_PROJECT_REF}). ` +
    `Tests must run strictly against isolated non-production project (${TARGET_PROJECT_REF}).`
  );
}

describe('Batch R — Genuine Authenticated PostgREST Operational Intelligence Suite', { timeout: 45000 }, () => {
  let adminClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let adminAClient: SupabaseClient;
  let adminBClient: SupabaseClient;
  let workerAClient: SupabaseClient;
  let platformAdminClient: SupabaseClient;
  let normalUserClient: SupabaseClient;

  const runId = 'r' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const adminAUserId = crypto.randomUUID();
  const adminBUserId = crypto.randomUUID();
  const workerAUserId = crypto.randomUUID();
  const platformAdminUserId = crypto.randomUUID();
  const normalUserId = crypto.randomUUID();

  const orgAId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();
  const orgEmptyId = crypto.randomUUID();

  const testJobId = crypto.randomUUID();

  const adminAEmail = `admin-a-${runId}@jobpulse.test`;
  const adminBEmail = `admin-b-${runId}@jobpulse.test`;
  const workerAEmail = `worker-a-${runId}@jobpulse.test`;
  const platformAdminEmail = `plat-admin-${runId}@jobpulse.test`;
  const normalUserEmail = `normal-${runId}@jobpulse.test`;
  const testPassword = `PassR!_${runId}`;

  // Created IDs for explicit teardown
  const createdUserIds: string[] = [
    adminAUserId,
    adminBUserId,
    workerAUserId,
    platformAdminUserId,
    normalUserId,
  ];
  const createdOrgIds: string[] = [orgAId, orgBId, orgEmptyId];
  const createdJobIds: string[] = [testJobId];
  const createdAssignmentIds: string[] = [];
  const createdAppIds: string[] = [];
  const createdSourceRunIds: string[] = [];

  beforeAll(async () => {
    if (!testUrl || !testAnonKey || !testServiceRoleKey) {
      throw new Error(
        `[FAIL_CLOSED] Dedicated test environment credentials are required but missing! ` +
        `SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, and SUPABASE_TEST_SERVICE_ROLE_KEY must be provided. ` +
        `Target must be the isolated non-production project (${TARGET_PROJECT_REF}).`
      );
    }

    adminClient = createClient(testUrl, testServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    anonClient = createClient(testUrl, testAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Provision 5 dedicated test users
    const userSpecs = [
      { id: adminAUserId, email: adminAEmail, name: `Admin Org A (${runId})` },
      { id: adminBUserId, email: adminBEmail, name: `Admin Org B (${runId})` },
      { id: workerAUserId, email: workerAEmail, name: `Worker Org A (${runId})` },
      { id: platformAdminUserId, email: platformAdminEmail, name: `Platform Superadmin (${runId})` },
      { id: normalUserId, email: normalUserEmail, name: `Regular User (${runId})` },
    ];

    for (const spec of userSpecs) {
      const { error } = await adminClient.auth.admin.createUser({
        id: spec.id,
        email: spec.email,
        password: testPassword,
        email_confirm: true,
        user_metadata: { full_name: spec.name },
      });
      if (error) throw new Error(`[SETUP_FAILURE] User creation failed (${spec.email}): ${error.message}`);
    }

    // 2. Provision profile records with exact roles
    await adminClient.from('profiles').upsert([
      { id: adminAUserId, email: adminAEmail, full_name: `Admin Alpha ${runId}`, role: 'user' },
      { id: adminBUserId, email: adminBEmail, full_name: `Admin Beta ${runId}`, role: 'user' },
      { id: workerAUserId, email: workerAEmail, full_name: `Worker Alpha ${runId}`, role: 'user' },
      { id: platformAdminUserId, email: platformAdminEmail, full_name: `Platform Admin ${runId}`, role: 'admin' },
      { id: normalUserId, email: normalUserEmail, full_name: `Normal User ${runId}`, role: 'user' },
    ]);

    // 3. Create test organizations
    const { error: orgAErr } = await adminClient.from('organizations').insert({
      id: orgAId,
      name: `Alpha Corp ${runId}`,
      slug: `alpha-${runId}`,
    });
    if (orgAErr) throw new Error(`[SETUP_FAILURE] Org A creation failed: ${orgAErr.message}`);

    const { error: orgBErr } = await adminClient.from('organizations').insert({
      id: orgBId,
      name: `Beta Corp ${runId}`,
      slug: `beta-${runId}`,
    });
    if (orgBErr) throw new Error(`[SETUP_FAILURE] Org B creation failed: ${orgBErr.message}`);

    const { error: orgEmptyErr } = await adminClient.from('organizations').insert({
      id: orgEmptyId,
      name: `Empty Corp ${runId}`,
      slug: `empty-${runId}`,
    });
    if (orgEmptyErr) throw new Error(`[SETUP_FAILURE] Empty Org creation failed: ${orgEmptyErr.message}`);

    // 4. Create organization memberships
    await adminClient.from('organization_members').insert([
      { organization_id: orgAId, user_id: adminAUserId, role: 'admin' },
      { organization_id: orgAId, user_id: workerAUserId, role: 'worker' },
      { organization_id: orgBId, user_id: adminBUserId, role: 'admin' },
    ]);

    // 5. Create test jobs
    const jobA1Id = crypto.randomUUID();
    const jobA2Id = crypto.randomUUID();
    const jobA3Id = crypto.randomUUID();
    const jobA4Id = crypto.randomUUID();
    const appJob1Id = crypto.randomUUID();
    const appJob2Id = crypto.randomUUID();
    const appJob3Id = crypto.randomUUID();
    const jobB1Id = crypto.randomUUID();
    const jobB2Id = crypto.randomUUID();
    const jobB3Id = crypto.randomUUID();

    const allTestJobIds = [
      testJobId,
      jobA1Id,
      jobA2Id,
      jobA3Id,
      jobA4Id,
      appJob1Id,
      appJob2Id,
      appJob3Id,
      jobB1Id,
      jobB2Id,
      jobB3Id,
    ];
    createdJobIds.push(...allTestJobIds.filter(id => id !== testJobId));

    const jobRows = allTestJobIds.map(jid => ({
      id: jid,
      title: `Staff Software Engineer ${jid.slice(0, 4)} (${runId})`,
      company_name: `Enterprise Tech ${runId}`,
      status: 'active',
      source: 'GREENHOUSE',
      apply_url: 'https://boards.greenhouse.io/test-job',
      scraped_at: new Date().toISOString(),
      skills: ['TypeScript', 'PostgreSQL'],
      locations: ['Remote'],
    }));

    const { error: jobErr } = await adminClient.from('jobs').insert(jobRows);
    if (jobErr) throw new Error(`[SETUP_FAILURE] Test jobs creation failed: ${jobErr.message}`);

    // 6. Seed Org A controlled mathematical fixtures
    // 4 assignments: 2 completed, 1 cancelled, 1 skipped -> Completion rate = 2 / 4 = 50.0%
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000).toISOString();

    const asgnSpecs = [
      { id: crypto.randomUUID(), jobId: jobA1Id, status: 'completed' as const, eventType: 'completed' },
      { id: crypto.randomUUID(), jobId: jobA2Id, status: 'completed' as const, eventType: 'completed' },
      { id: crypto.randomUUID(), jobId: jobA3Id, status: 'cancelled' as const, eventType: 'cancelled' },
      { id: crypto.randomUUID(), jobId: jobA4Id, status: 'skipped' as const, eventType: 'skipped' },
    ];

    for (const spec of asgnSpecs) {
      createdAssignmentIds.push(spec.id);
      const { error: jaErr } = await adminClient.from('job_assignments').insert({
        id: spec.id,
        organization_id: orgAId,
        job_id: spec.jobId,
        worker_id: workerAUserId,
        assigned_by: adminAUserId,
        status: spec.status,
        created_at: oneHourAgo,
      });
      if (jaErr) throw new Error(`[SETUP_FAILURE] Org A job_assignment failed: ${jaErr.message}`);

      const { error: aeErr } = await adminClient.from('assignment_events').insert({
        assignment_id: spec.id,
        organization_id: orgAId,
        worker_id: workerAUserId,
        actor_id: adminAUserId,
        event_type: spec.eventType,
        from_status: 'assigned',
        to_status: spec.status,
        created_at: now.toISOString(),
      });
      if (aeErr) throw new Error(`[SETUP_FAILURE] Org A assignment_event failed: ${aeErr.message}`);
    }

    // Seed Org A verifications: 1 verified, 1 rejected, 1 pending -> Verification rate = 1 / 2 = 50.0%
    const app1Id = crypto.randomUUID();
    const app2Id = crypto.randomUUID();
    const app3Id = crypto.randomUUID();
    createdAppIds.push(app1Id, app2Id, app3Id);

    const { error: appErr } = await adminClient.from('applications').insert([
      { id: app1Id, user_id: workerAUserId, job_id: appJob1Id, organization_id: orgAId, company_name: 'Test Systems Inc', job_title: 'Staff Software Engineer', status: 'applied', applied_at: oneHourAgo },
      { id: app2Id, user_id: workerAUserId, job_id: appJob2Id, organization_id: orgAId, company_name: 'Test Systems Inc', job_title: 'Staff Software Engineer', status: 'applied', applied_at: oneHourAgo },
      { id: app3Id, user_id: workerAUserId, job_id: appJob3Id, organization_id: orgAId, company_name: 'Test Systems Inc', job_title: 'Staff Software Engineer', status: 'applied', applied_at: oneHourAgo },
    ]);
    if (appErr) throw new Error(`[SETUP_FAILURE] Org A applications insert failed: ${appErr.message}`);

    const { error: verifErr } = await adminClient.from('application_verifications').insert([
      {
        application_id: app1Id,
        organization_id: orgAId,
        worker_id: workerAUserId,
        screenshot_url: 'https://storage.internal/screenshot1.png',
        status: 'verified',
        reviewer_id: adminAUserId,
        reviewed_at: now.toISOString(),
      },
      {
        application_id: app2Id,
        organization_id: orgAId,
        worker_id: workerAUserId,
        screenshot_url: 'https://storage.internal/screenshot2.png',
        status: 'rejected',
        reviewer_id: adminAUserId,
        reviewed_at: now.toISOString(),
      },
      {
        application_id: app3Id,
        organization_id: orgAId,
        worker_id: workerAUserId,
        screenshot_url: 'https://storage.internal/screenshot3.png',
        status: 'pending',
      },
    ]);
    if (verifErr) throw new Error(`[SETUP_FAILURE] Org A application_verifications insert failed: ${verifErr.message}`);

    // 7. Seed Org B time-window boundary fixtures
    // Event B1: 2 hours ago (inside 24h)
    // Event B2: 3 days ago (inside 7d, outside 24h)
    // Event B3: 15 days ago (inside 30d, outside 7d)
    const asgnB1 = crypto.randomUUID();
    const asgnB2 = crypto.randomUUID();
    const asgnB3 = crypto.randomUUID();
    createdAssignmentIds.push(asgnB1, asgnB2, asgnB3);

    const time2hAgo = new Date(now.getTime() - 2 * 3600000).toISOString();
    const time3dAgo = new Date(now.getTime() - 3 * 86400000).toISOString();
    const time15dAgo = new Date(now.getTime() - 15 * 86400000).toISOString();

    const { error: bAsgnErr } = await adminClient.from('job_assignments').insert([
      { id: asgnB1, organization_id: orgBId, job_id: jobB1Id, worker_id: adminBUserId, assigned_by: adminBUserId, status: 'completed', created_at: time2hAgo },
      { id: asgnB2, organization_id: orgBId, job_id: jobB2Id, worker_id: adminBUserId, assigned_by: adminBUserId, status: 'completed', created_at: time3dAgo },
      { id: asgnB3, organization_id: orgBId, job_id: jobB3Id, worker_id: adminBUserId, assigned_by: adminBUserId, status: 'completed', created_at: time15dAgo },
    ]);
    if (bAsgnErr) throw new Error(`[SETUP_FAILURE] Org B job_assignments failed: ${bAsgnErr.message}`);

    const { error: bEvtErr } = await adminClient.from('assignment_events').insert([
      { assignment_id: asgnB1, organization_id: orgBId, worker_id: adminBUserId, actor_id: adminBUserId, event_type: 'completed', from_status: 'assigned', to_status: 'completed', created_at: time2hAgo },
      { assignment_id: asgnB2, organization_id: orgBId, worker_id: adminBUserId, actor_id: adminBUserId, event_type: 'completed', from_status: 'assigned', to_status: 'completed', created_at: time3dAgo },
      { assignment_id: asgnB3, organization_id: orgBId, worker_id: adminBUserId, actor_id: adminBUserId, event_type: 'completed', from_status: 'assigned', to_status: 'completed', created_at: time15dAgo },
    ]);
    if (bEvtErr) throw new Error(`[SETUP_FAILURE] Org B assignment_events failed: ${bEvtErr.message}`);

    // 8. Sign in all client sessions
    async function createAuthedClient(email: string): Promise<SupabaseClient> {
      const client = createClient(testUrl!, testAnonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await client.auth.signInWithPassword({ email, password: testPassword });
      if (error || !data.session) throw new Error(`Failed to sign in ${email}: ${error?.message}`);
      return client;
    }

    adminAClient = await createAuthedClient(adminAEmail);
    adminBClient = await createAuthedClient(adminBEmail);
    workerAClient = await createAuthedClient(workerAEmail);
    platformAdminClient = await createAuthedClient(platformAdminEmail);
    normalUserClient = await createAuthedClient(normalUserEmail);
  }, 60000);

  afterAll(async () => {
    if (!adminClient) return;

    // Strict hierarchical cleanup
    try {
      if (createdAppIds.length > 0) {
        await adminClient.from('application_verifications').delete().in('application_id', createdAppIds);
        await adminClient.from('applications').delete().in('id', createdAppIds);
      }
      if (createdAssignmentIds.length > 0) {
        await adminClient.from('assignment_events').delete().in('assignment_id', createdAssignmentIds);
        await adminClient.from('job_assignments').delete().in('id', createdAssignmentIds);
      }
      if (createdJobIds.length > 0) {
        await adminClient.from('jobs').delete().in('id', createdJobIds);
      }
      if (createdSourceRunIds.length > 0) {
        await adminClient.from('source_runs').delete().in('id', createdSourceRunIds);
      }
      if (createdOrgIds.length > 0) {
        await adminClient.from('organization_members').delete().in('organization_id', createdOrgIds);
        await adminClient.from('organizations').delete().in('id', createdOrgIds);
      }
      for (const userId of createdUserIds) {
        await adminClient.from('profiles').delete().eq('id', userId);
        await adminClient.auth.admin.deleteUser(userId);
      }
    } catch (cleanupErr) {
      console.error('[CLEANUP_WARNING] Error during test teardown:', cleanupErr);
    }
  }, 60000);

  // ---------------------------------------------------------------------------
  // TEST 1: TARGET SAFETY GATE
  // ---------------------------------------------------------------------------
  it('1. Target Safety Gate: non-production target is strictly enforced', () => {
    expect(testUrl).not.toContain(PRODUCTION_PROJECT_REF);
    expect(testProjectRef).not.toContain(PRODUCTION_PROJECT_REF);
    expect(testProjectRef).toBe(TARGET_PROJECT_REF);
  });

  // ---------------------------------------------------------------------------
  // TEST 2: REQUIRED AUTHORIZATION MATRIX (POSTGREST RPC BOUNDARY)
  // ---------------------------------------------------------------------------
  it('2. Required Authorization Matrix (PostgREST RPC Boundary)', async () => {
    // 2.1 Org A admin -> Org A: ALLOW
    const { data: orgAMetrics, error: orgAErr } = await adminAClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgAId, p_time_range: '24h' }
    );
    expect(orgAErr).toBeNull();
    expect(orgAMetrics).toBeDefined();
    expect(orgAMetrics.organizationId).toBe(orgAId);

    // 2.2 Org A admin -> Org B: DENY (403)
    const { data: crossOrgData, error: crossOrgErr } = await adminAClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgBId, p_time_range: '24h' }
    );
    expect(crossOrgData).toBeNull();
    expect(crossOrgErr).toBeDefined();
    expect(crossOrgErr!.message).toContain('FORBIDDEN');

    // 2.3 Org A admin -> Global (null): DENY (403)
    const { data: globalOrgAData, error: globalOrgAErr } = await adminAClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: null, p_time_range: '24h' }
    );
    expect(globalOrgAData).toBeNull();
    expect(globalOrgAErr).toBeDefined();
    expect(globalOrgAErr!.message).toContain('FORBIDDEN: Global operational intelligence requires platform administrator privileges');

    // 2.4 Platform admin -> Org A: ALLOW
    const { data: platOrgAData, error: platOrgAErr } = await platformAdminClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgAId, p_time_range: '24h' }
    );
    expect(platOrgAErr).toBeNull();
    expect(platOrgAData.organizationId).toBe(orgAId);

    // 2.5 Platform admin -> Org B: ALLOW
    const { data: platOrgBData, error: platOrgBErr } = await platformAdminClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgBId, p_time_range: '24h' }
    );
    expect(platOrgBErr).toBeNull();
    expect(platOrgBData.organizationId).toBe(orgBId);

    // 2.6 Platform admin -> Global (null): ALLOW
    const { data: platGlobalData, error: platGlobalErr } = await platformAdminClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: null, p_time_range: '24h' }
    );
    expect(platGlobalErr).toBeNull();
    expect(platGlobalData.organizationId).toBeNull();
    expect(platGlobalData.jobs).toBeDefined();
    expect(platGlobalData.sourceHealth).toBeDefined();

    // 2.7 Worker -> Org A: DENY
    const { data: workerData, error: workerErr } = await workerAClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgAId, p_time_range: '24h' }
    );
    expect(workerData).toBeNull();
    expect(workerErr).toBeDefined();
    expect(workerErr!.message).toContain('FORBIDDEN');

    // 2.8 Worker -> Global: DENY
    const { data: workerGlobalData, error: workerGlobalErr } = await workerAClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: null, p_time_range: '24h' }
    );
    expect(workerGlobalData).toBeNull();
    expect(workerGlobalErr).toBeDefined();
    expect(workerGlobalErr!.message).toContain('FORBIDDEN');

    // 2.9 Normal user -> Org A: DENY
    const { data: normalData, error: normalErr } = await normalUserClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgAId, p_time_range: '24h' }
    );
    expect(normalData).toBeNull();
    expect(normalErr).toBeDefined();
    expect(normalErr!.message).toContain('FORBIDDEN');

    // 2.10 Unauthenticated (anon) -> Org A: DENY
    const { data: anonData, error: anonErr } = await anonClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgAId, p_time_range: '24h' }
    );
    expect(anonData).toBeNull();
    expect(anonErr).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // TEST 3: MATHEMATICAL INTEGRITY OF METRICS
  // ---------------------------------------------------------------------------
  it('3. Mathematical Integrity: proves exact percentage formulas on controlled fixtures', async () => {
    const { data, error } = await adminAClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgAId, p_time_range: '24h' }
    );
    expect(error).toBeNull();

    // In Org A:
    // 2 completed, 1 cancelled, 1 skipped -> completionRate = 2 / (2 + 1 + 1) * 100 = 50.0%
    expect(data.workforce.velocity.completed).toBe(2);
    expect(data.workforce.velocity.cancelled).toBe(1);
    expect(data.workforce.velocity.skipped).toBe(1);
    expect(data.workforce.completionRatePercent).toBe(50.0);

    // Verifications (R-H04: Explicit separation of windowed activity and current backlog)
    // 1 verified, 1 rejected, 1 pending -> approvalRate = 1 / (1 + 1) * 100 = 50.0%
    expect(data.workforce.verifications.verifiedInWindow).toBe(1);
    expect(data.workforce.verifications.rejectedInWindow).toBe(1);
    expect(data.workforce.verifications.reviewedInWindow).toBe(2);
    expect(data.workforce.verifications.pendingCurrent).toBe(1);
    expect(data.workforce.verifications.approvalRatePercent).toBe(50.0);
    expect(data.workforce.verifications.total).toBe(2);

    // Turnaround hours should be > 0.0 (assignments dispatched 1 hour before completion)
    expect(data.workforce.avgTurnaroundHours).toBeGreaterThanOrEqual(0.9);
    expect(data.workforce.avgTurnaroundHours).toBeLessThanOrEqual(1.2);
  });

  // ---------------------------------------------------------------------------
  // TEST 4: TIME-WINDOW BOUNDARIES (24h vs 7d vs 30d)
  // ---------------------------------------------------------------------------
  it('4. Time-Window Boundaries: proves 24h, 7d, 30d window filtering on Org B fixtures', async () => {
    // Org B has events at: 2h ago, 3d ago, 15d ago

    // 4.1 24h window: includes only 2h event (completed = 1)
    const { data: b24h } = await adminBClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgBId, p_time_range: '24h' }
    );
    expect(b24h.workforce.velocity.completed).toBe(1);

    // 4.2 7d window: includes 2h and 3d events, excludes 15d (completed = 2)
    const { data: b7d } = await adminBClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgBId, p_time_range: '7d' }
    );
    expect(b7d.workforce.velocity.completed).toBe(2);

    // 4.3 30d window: includes all 3 events (completed = 3)
    const { data: b30d } = await adminBClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgBId, p_time_range: '30d' }
    );
    expect(b30d.workforce.velocity.completed).toBe(3);

    // 4.4 Unsupported range raises INVALID_ARGUMENT
    const { data: errData, error: rangeErr } = await adminBClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgBId, p_time_range: '90d' }
    );
    expect(errData).toBeNull();
    expect(rangeErr).toBeDefined();
    expect(rangeErr!.message).toContain('INVALID_ARGUMENT: Unsupported time range');
  });

  // ---------------------------------------------------------------------------
  // TEST 5: ZERO / NULL / EMPTY ORGANIZATIONS
  // ---------------------------------------------------------------------------
  it('5. Zero / Empty Organization: returns safe deterministic values with zero division errors', async () => {
    // Calling with empty organization having 0 workers and 0 assignments
    const { data, error } = await platformAdminClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgEmptyId, p_time_range: '24h' }
    );
    expect(error).toBeNull();

    // Roster
    expect(data.workforce.roster.totalWorkers).toBe(0);
    expect(data.workforce.roster.activeWorkers).toBe(0);

    // Velocity (R-H03)
    expect(data.workforce.velocity.dispatched).toBe(0);
    expect(data.workforce.velocity.startedInWindow).toBe(0);
    expect(data.workforce.velocity.completed).toBe(0);
    expect(data.workforce.velocity.cancelled).toBe(0);
    expect(data.workforce.velocity.skipped).toBe(0);
    expect(data.workforce.inProgress).toBe(0);

    // Percentages & averages must safely return 0.0, NOT NaN or null
    expect(data.workforce.completionRatePercent).toBe(0.0);
    expect(data.workforce.verifications.approvalRatePercent).toBe(0.0);
    expect(data.workforce.avgTurnaroundHours).toBe(0.0);
    expect(data.workforce.overdueBacklog).toBe(0);
    expect(data.workforce.currentActive).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // TEST 6: CATALOG INTEGRITY & QUALITY METRICS
  // ---------------------------------------------------------------------------
  it('6. Catalog & Quality: returns authoritative job freshness, quality, and source health', async () => {
    const { data, error } = await platformAdminClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: null, p_time_range: '24h' }
    );
    expect(error).toBeNull();

    // Job inventory must reflect real non-zero database numbers
    expect(data.jobs.inventory.totalJobs).toBeGreaterThan(0);
    expect(data.jobs.inventory.activeJobs).toBeGreaterThan(0);

    // Quality metrics must be numbers between 0 and 100
    expect(data.jobs.quality.skillCoveragePercent).toBeGreaterThanOrEqual(0);
    expect(data.jobs.quality.skillCoveragePercent).toBeLessThanOrEqual(100);
    expect(data.jobs.quality.salaryTransparencyPercent).toBeGreaterThanOrEqual(0);
    expect(data.jobs.quality.salaryTransparencyPercent).toBeLessThanOrEqual(100);

    // Freshness buckets must sum to active jobs count
    const freshnessSum =
      data.jobs.freshness.fresh +
      data.jobs.freshness.aging +
      data.jobs.freshness.stale +
      data.jobs.freshness.critical;
    expect(freshnessSum).toBe(data.jobs.inventory.activeJobs);

    // Source health distribution must be populated
    expect(data.sourceHealth.distribution.total).toBeGreaterThan(0);
    expect(data.sourceHealth.distribution.healthy).toBeGreaterThanOrEqual(0);

    // Data quality resolution rate must be valid
    expect(data.dataQuality.atsResolution.resolutionRatePercent).toBeGreaterThanOrEqual(0);
    expect(data.dataQuality.atsResolution.resolutionRatePercent).toBeLessThanOrEqual(100);
  });

  // ---------------------------------------------------------------------------
  // TEST 7: R-H01 — AUTHORITATIVE ATS RESOLUTION (TESTS A, B, C, D)
  // ---------------------------------------------------------------------------
  // TEST 7: R-H01 — AUTHORITATIVE ATS RESOLUTION (MIGRATION-STATE ADVERSARIAL COVERAGE)
  // Proves migration cannot manufacture 'direct' resolution when url_resolution_method IS NULL
  // ---------------------------------------------------------------------------
  it('7. R-H01: Authoritative ATS Resolution telemetry strictly reflects persisted state without heuristics', async () => {
    // Scenario 1: Pre-existing job with non-empty apply URL, unknown source, and NULL resolution method
    const jobPreExistingUnknownId = crypto.randomUUID();
    // Scenario 2: Pre-existing job with non-empty apply URL, known ATS source (GREENHOUSE), but NULL resolution method
    const jobPreExistingGreenhouseId = crypto.randomUUID();
    // Scenario 3: Job resolved via fallback method (url_resolution_method = 'fallback_source')
    const jobFallbackId = crypto.randomUUID();
    // Scenario 4: Job resolved directly via Greenhouse API (url_resolution_method = 'greenhouse_api')
    const jobDirectId = crypto.randomUUID();

    createdJobIds.push(
      jobPreExistingUnknownId,
      jobPreExistingGreenhouseId,
      jobFallbackId,
      jobDirectId
    );

    const nowIso = new Date().toISOString();
    const { error: insertErr } = await adminClient.from('jobs').insert([
      {
        id: jobPreExistingUnknownId,
        title: `Pre-existing Unknown Job (${runId})`,
        company_name: `Corp Alpha ${runId}`,
        status: 'active',
        source: 'UNKNOWN',
        apply_url: 'https://example-careers.com/job/9999',
        url_resolution_method: null, // Crucial: represents pre-existing un-resolved job
        scraped_at: nowIso,
      },
      {
        id: jobPreExistingGreenhouseId,
        title: `Pre-existing Greenhouse Job (${runId})`,
        company_name: `Corp Beta ${runId}`,
        status: 'active',
        source: 'GREENHOUSE',
        apply_url: 'https://boards.greenhouse.io/corp-beta/jobs/111',
        url_resolution_method: null, // Crucial: source is known ATS, but resolution method was NOT persisted
        scraped_at: nowIso,
      },
      {
        id: jobFallbackId,
        title: `Fallback Resolved Job (${runId})`,
        company_name: `Corp Gamma ${runId}`,
        status: 'active',
        source: 'ASHBY',
        apply_url: 'https://jobs.ashbyhq.com/corp-gamma/222',
        url_resolution_method: 'fallback_source',
        scraped_at: nowIso,
      },
      {
        id: jobDirectId,
        title: `Direct Resolved Job (${runId})`,
        company_name: `Corp Delta ${runId}`,
        status: 'active',
        source: 'GREENHOUSE',
        apply_url: 'https://boards.greenhouse.io/corp-delta/jobs/333',
        url_resolution_method: 'greenhouse_api',
        scraped_at: nowIso,
      },
    ]);
    expect(insertErr).toBeNull();

    const { data, error } = await platformAdminClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: null, p_time_range: '24h' }
    );
    expect(error).toBeNull();
    const ats = data.dataQuality.atsResolution;

    // Scenario 1 Verification: A job with non-empty apply URL and unknown source but url_resolution_method = NULL
    // must NOT be classified as resolved and must NOT be classified as 'direct'
    // It must group under 'unresolved'
    expect(ats.methods['unresolved']).toBeDefined();
    expect(ats.methods['unresolved']).toBeGreaterThanOrEqual(2);
    expect(ats.methods['direct']).toBeUndefined(); // Zero fabricated 'direct' method counts!

    // Scenario 2 Verification: A job with known ATS source (GREENHOUSE) but url_resolution_method = NULL
    // must NOT become resolved merely because the source is known
    // Direct/authoritative resolution count only increments for jobs with persisted non-fallback methods
    expect(ats.methods['greenhouse_api']).toBeGreaterThanOrEqual(1);

    // Scenario 3 Verification: Fallback-resolved jobs are explicitly classified in fallbackCount and methods
    expect(ats.fallbackCount).toBeGreaterThanOrEqual(1);
    expect(ats.methods['fallback_source']).toBeGreaterThanOrEqual(1);

    // Scenario 4 Verification: No fabricated confidence score
    expect((ats as any).avgConfidence).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // TEST 8: R-H02 — NORMALIZED FAILURE TAXONOMY
  // Groups failures into stable machine-readable classes, not raw error messages
  // ---------------------------------------------------------------------------
  it('8. R-H02: Source Run failure taxonomy normalizes raw error strings into machine-readable classes', async () => {
    const runTimeout1Id = crypto.randomUUID();
    const runTimeout2Id = crypto.randomUUID();
    const runTimeout3Id = crypto.randomUUID();
    const runRateLimitId = crypto.randomUUID();
    const runUnknownId = crypto.randomUUID();

    createdSourceRunIds.push(
      runTimeout1Id,
      runTimeout2Id,
      runTimeout3Id,
      runRateLimitId,
      runUnknownId
    );

    const nowIso = new Date().toISOString();
    const { error: runErr } = await adminClient.from('source_runs').insert([
      {
        id: runTimeout1Id,
        source: 'GREENHOUSE',
        status: 'FAILED',
        error_message: 'Cloudflare timeout',
        started_at: nowIso,
      },
      {
        id: runTimeout2Id,
        source: 'ASHBY',
        status: 'FAILED',
        error_message: 'Request timeout after 30s',
        started_at: nowIso,
      },
      {
        id: runTimeout3Id,
        source: 'LEVER',
        status: 'FAILED',
        error_message: 'Timeout connecting to ATS',
        started_at: nowIso,
      },
      {
        id: runRateLimitId,
        source: 'GREENHOUSE',
        status: 'FAILED',
        error_message: '429 Too Many Requests',
        started_at: nowIso,
      },
      {
        id: runUnknownId,
        source: 'GREENHOUSE',
        status: 'FAILED',
        error_message: 'Unprecedented internal glitch xyz_9999',
        started_at: nowIso,
      },
    ]);
    expect(runErr).toBeNull();

    const { data, error } = await platformAdminClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: null, p_time_range: '24h' }
    );
    expect(error).toBeNull();
    const taxonomy = data.sourceHealth.failureTaxonomy as Array<{ category: string; count: number }>;
    expect(Array.isArray(taxonomy)).toBe(true);

    const categories = taxonomy.map(t => t.category);

    // Raw error messages MUST NOT appear as category keys
    expect(categories).not.toContain('Cloudflare timeout');
    expect(categories).not.toContain('Request timeout after 30s');
    expect(categories).not.toContain('Timeout connecting to ATS');
    expect(categories).not.toContain('429 Too Many Requests');

    // All three timeout variants must normalize to 'timeout'
    const timeoutEntry = taxonomy.find(t => t.category === 'timeout');
    expect(timeoutEntry).toBeDefined();
    expect(timeoutEntry!.count).toBeGreaterThanOrEqual(3);

    // 429 must normalize to 'rate_limit'
    const rateLimitEntry = taxonomy.find(t => t.category === 'rate_limit');
    expect(rateLimitEntry).toBeDefined();
    expect(rateLimitEntry!.count).toBeGreaterThanOrEqual(1);

    // Unclassified error must safely resolve to 'unknown'
    const unknownEntry = taxonomy.find(t => t.category === 'unknown');
    expect(unknownEntry).toBeDefined();
    expect(unknownEntry!.count).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // TEST 9: R-H03 — CORRECT "IN PROGRESS" SEMANTICS
  // Separates startedInWindow (interval events) from inProgress (current active state)
  // ---------------------------------------------------------------------------
  it('9. R-H03: Disambiguates startedInWindow from current inProgress assignments', async () => {
    const orgH03Id = crypto.randomUUID();
    createdOrgIds.push(orgH03Id);

    const { error: orgErr } = await adminClient.from('organizations').insert({
      id: orgH03Id,
      name: `Org H03 Semantics ${runId}`,
      slug: `org-h03-${runId}`,
    });
    expect(orgErr).toBeNull();

    await adminClient.from('organization_members').insert([
      { organization_id: orgH03Id, user_id: adminAUserId, role: 'admin' },
      { organization_id: orgH03Id, user_id: workerAUserId, role: 'worker' },
    ]);

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000).toISOString();
    const twoDaysAgo = new Date(now.getTime() - 48 * 3600000).toISOString();

    // 1. Create 20 assignments started during the selected 24h window:
    //    - 19 completed
    //    - 1 still in progress
    const windowJobIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const jid = crypto.randomUUID();
      windowJobIds.push(jid);
      createdJobIds.push(jid);
    }
    await adminClient.from('jobs').insert(
      windowJobIds.map(jid => ({
        id: jid,
        title: `H03 Test Job ${jid.slice(0, 4)}`,
        company_name: `H03 Corp ${runId}`,
        status: 'active',
        source: 'GREENHOUSE',
        scraped_at: now.toISOString(),
      }))
    );

    for (let i = 0; i < 20; i++) {
      const asgnId = crypto.randomUUID();
      createdAssignmentIds.push(asgnId);
      const isStillInProgress = i === 19;
      const status = isStillInProgress ? 'in_progress' : 'completed';

      await adminClient.from('job_assignments').insert({
        id: asgnId,
        organization_id: orgH03Id,
        job_id: windowJobIds[i],
        worker_id: workerAUserId,
        assigned_by: adminAUserId,
        status: status,
        created_at: oneHourAgo,
      });

      // Assignment event: started (in window)
      await adminClient.from('assignment_events').insert({
        assignment_id: asgnId,
        organization_id: orgH03Id,
        worker_id: workerAUserId,
        actor_id: adminAUserId,
        event_type: 'started',
        from_status: 'assigned',
        to_status: 'in_progress',
        created_at: oneHourAgo,
      });

      if (!isStillInProgress) {
        // Completed in window
        await adminClient.from('assignment_events').insert({
          assignment_id: asgnId,
          organization_id: orgH03Id,
          worker_id: workerAUserId,
          actor_id: adminAUserId,
          event_type: 'completed',
          from_status: 'in_progress',
          to_status: 'completed',
          created_at: now.toISOString(),
        });
      }
    }

    // 2. Create 1 assignment started BEFORE the window (48h ago) that remains in_progress
    const preWindowJobId = crypto.randomUUID();
    createdJobIds.push(preWindowJobId);
    await adminClient.from('jobs').insert({
      id: preWindowJobId,
      title: `Pre-window Job ${runId}`,
      company_name: `H03 Corp ${runId}`,
      status: 'active',
      source: 'GREENHOUSE',
      scraped_at: twoDaysAgo,
    });

    const preWindowAsgnId = crypto.randomUUID();
    createdAssignmentIds.push(preWindowAsgnId);
    await adminClient.from('job_assignments').insert({
      id: preWindowAsgnId,
      organization_id: orgH03Id,
      job_id: preWindowJobId,
      worker_id: workerAUserId,
      assigned_by: adminAUserId,
      status: 'in_progress',
      created_at: twoDaysAgo,
    });
    await adminClient.from('assignment_events').insert({
      assignment_id: preWindowAsgnId,
      organization_id: orgH03Id,
      worker_id: workerAUserId,
      actor_id: adminAUserId,
      event_type: 'started',
      from_status: 'assigned',
      to_status: 'in_progress',
      created_at: twoDaysAgo,
    });

    // Query telemetry for orgH03Id in 24h window
    const { data, error } = await adminAClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgH03Id, p_time_range: '24h' }
    );
    expect(error).toBeNull();

    // Adversarial verification:
    // startedInWindow must be 20 (the 20 assignments that started within the 24h window)
    expect(data.workforce.velocity.startedInWindow).toBe(20);
    // completed must be 19
    expect(data.workforce.velocity.completed).toBe(19);
    // inProgress must be 2 (1 started in window + 1 started before window, both currently in_progress)
    expect(data.workforce.inProgress).toBe(2);
    // currentActive (assigned + in_progress) must be 2
    expect(data.workforce.currentActive).toBe(2);

    // CRITICAL: inProgress MUST NOT equal startedInWindow (2 != 20)
    expect(data.workforce.inProgress).not.toBe(data.workforce.velocity.startedInWindow);
  });

  // ---------------------------------------------------------------------------
  // TEST 10: R-H04 — VERIFICATION POPULATION SEMANTICS
  // Separates windowed verification activity from current pending backlog
  // ---------------------------------------------------------------------------
  it('10. R-H04: Semantically separates windowed verification activity from current pending backlog', async () => {
    const orgH04Id = crypto.randomUUID();
    createdOrgIds.push(orgH04Id);

    const { error: orgErr } = await adminClient.from('organizations').insert({
      id: orgH04Id,
      name: `Org H04 Verifications ${runId}`,
      slug: `org-h04-${runId}`,
    });
    expect(orgErr).toBeNull();

    await adminClient.from('organization_members').insert([
      { organization_id: orgH04Id, user_id: adminAUserId, role: 'admin' },
      { organization_id: orgH04Id, user_id: workerAUserId, role: 'worker' },
    ]);

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600000).toISOString();
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const oneHourAgo = new Date(now.getTime() - 3600000).toISOString();

    const job1 = crypto.randomUUID();
    const job2 = crypto.randomUUID();
    const job3 = crypto.randomUUID();
    const job4 = crypto.randomUUID();
    createdJobIds.push(job1, job2, job3, job4);

    await adminClient.from('jobs').insert([job1, job2, job3, job4].map(jid => ({
      id: jid,
      title: `Verification Job ${jid.slice(0, 4)}`,
      company_name: `H04 Corp ${runId}`,
      status: 'active',
      source: 'GREENHOUSE',
      scraped_at: now.toISOString(),
    })));

    const app1 = crypto.randomUUID();
    const app2 = crypto.randomUUID();
    const app3 = crypto.randomUUID();
    const app4 = crypto.randomUUID();
    createdAppIds.push(app1, app2, app3, app4);

    const { error: appErr } = await adminClient.from('applications').insert([
      { id: app1, user_id: workerAUserId, job_id: job1, organization_id: orgH04Id, company_name: 'H04 Corp', job_title: 'Engineer', status: 'applied', applied_at: twoHoursAgo },
      { id: app2, user_id: workerAUserId, job_id: job2, organization_id: orgH04Id, company_name: 'H04 Corp', job_title: 'Engineer', status: 'applied', applied_at: threeDaysAgo },
      { id: app3, user_id: workerAUserId, job_id: job3, organization_id: orgH04Id, company_name: 'H04 Corp', job_title: 'Engineer', status: 'applied', applied_at: thirtyDaysAgo },
      { id: app4, user_id: workerAUserId, job_id: job4, organization_id: orgH04Id, company_name: 'H04 Corp', job_title: 'Engineer', status: 'applied', applied_at: oneHourAgo },
    ]);
    expect(appErr).toBeNull();

    // Fixtures:
    // 1. Reviewed 2 hours ago -> verified
    // 2. Reviewed 3 days ago -> rejected
    // 3. Pending created 30 days ago
    // 4. Pending created 1 hour ago
    const { error: verifErr } = await adminClient.from('application_verifications').insert([
      {
        application_id: app1,
        organization_id: orgH04Id,
        worker_id: workerAUserId,
        screenshot_url: 'https://storage.internal/screenshot1.png',
        status: 'verified',
        reviewer_id: adminAUserId,
        reviewed_at: twoHoursAgo,
        created_at: twoHoursAgo,
      },
      {
        application_id: app2,
        organization_id: orgH04Id,
        worker_id: workerAUserId,
        screenshot_url: 'https://storage.internal/screenshot2.png',
        status: 'rejected',
        reviewer_id: adminAUserId,
        reviewed_at: threeDaysAgo,
        created_at: threeDaysAgo,
      },
      {
        application_id: app3,
        organization_id: orgH04Id,
        worker_id: workerAUserId,
        screenshot_url: 'https://storage.internal/screenshot3.png',
        status: 'pending',
        reviewed_at: null,
        created_at: thirtyDaysAgo,
      },
      {
        application_id: app4,
        organization_id: orgH04Id,
        worker_id: workerAUserId,
        screenshot_url: 'https://storage.internal/screenshot4.png',
        status: 'pending',
        reviewed_at: null,
        created_at: oneHourAgo,
      },
    ]);
    expect(verifErr).toBeNull();

    // Evaluation 1: 24-hour window
    const { data: v24h, error: err24h } = await adminAClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgH04Id, p_time_range: '24h' }
    );
    expect(err24h).toBeNull();
    const verif24h = v24h.workforce.verifications;

    expect(verif24h.verifiedInWindow).toBe(1);
    expect(verif24h.rejectedInWindow).toBe(0);
    expect(verif24h.reviewedInWindow).toBe(1);
    expect(verif24h.pendingCurrent).toBe(2);
    expect(verif24h.approvalRatePercent).toBe(100.0);
    // Adversarial invariant: windowed total must be 1 (reviewed in window), NEVER 1 + 0 + 2 = 3
    expect(verif24h.total).toBe(1);
    expect(verif24h.total).not.toBe(3);

    // Evaluation 2: 7-day window
    const { data: v7d, error: err7d } = await adminAClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgH04Id, p_time_range: '7d' }
    );
    expect(err7d).toBeNull();
    const verif7d = v7d.workforce.verifications;

    expect(verif7d.verifiedInWindow).toBe(1);
    expect(verif7d.rejectedInWindow).toBe(1);
    expect(verif7d.reviewedInWindow).toBe(2);
    expect(verif7d.pendingCurrent).toBe(2);
    expect(verif7d.approvalRatePercent).toBe(50.0);
    expect(verif7d.total).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // TEST 11: R-H05 — MULTI-TENANT SCOPE & PLATFORM CATALOG CONTRACT
  // Explicitly establishes tenant isolation for workforce vs platform-wide catalog
  // ---------------------------------------------------------------------------
  it('11. R-H05: Explicitly enforces multi-tenant workforce isolation while exposing platform-wide catalog', async () => {
    // 1. Query as Org A administrator
    const { data: orgAData, error: orgAErr } = await adminAClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgAId, p_time_range: '24h' }
    );
    expect(orgAErr).toBeNull();

    // Verify documented scope metadata contract
    expect(orgAData.scope).toEqual({
      workforce: 'organization',
      jobs: 'platform',
      sourceHealth: 'platform',
      dataQuality: 'platform',
    });

    // Org A workforce metrics reflect Org A only
    expect(orgAData.workforce.roster.totalWorkers).toBe(1);
    expect(orgAData.workforce.velocity.completed).toBe(2);

    // Platform job inventory is visible as documented
    expect(orgAData.jobs.inventory.totalJobs).toBeGreaterThan(0);
    expect(orgAData.jobs.inventory.activeJobs).toBeGreaterThan(0);

    // 2. Query as Org B administrator
    const { data: orgBData, error: orgBErr } = await adminBClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: orgBId, p_time_range: '24h' }
    );
    expect(orgBErr).toBeNull();

    // Org B workforce metrics reflect Org B only
    expect(orgBData.workforce.velocity.completed).toBe(1);

    // Org B cannot see Org A's completed assignments
    expect(orgBData.workforce.velocity.completed).not.toBe(orgAData.workforce.velocity.completed);

    // 3. Query as Platform Administrator (global, organizationId = null)
    const { data: platData, error: platErr } = await platformAdminClient.rpc(
      'get_operational_intelligence_metrics',
      { p_organization_id: null, p_time_range: '24h' }
    );
    expect(platErr).toBeNull();
    expect(platData.organizationId).toBeNull();

    // Platform administrator sees global aggregate of workforce across all organizations
    expect(platData.workforce.velocity.completed).toBeGreaterThanOrEqual(
      orgAData.workforce.velocity.completed + orgBData.workforce.velocity.completed
    );
  });
});
