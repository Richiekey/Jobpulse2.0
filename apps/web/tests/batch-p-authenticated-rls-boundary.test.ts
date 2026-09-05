import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const PRODUCTION_PROJECT_REF = 'rgwutmthzigjmzsmmjnp';

const testUrl = process.env.SUPABASE_TEST_URL || process.env.NEXT_PUBLIC_SUPABASE_TEST_URL;
const testAnonKey = process.env.SUPABASE_TEST_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_TEST_ANON_KEY;
const testServiceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const testProjectRef = process.env.SUPABASE_TEST_PROJECT_REF;

// HARD SECURITY GATE: Never allow integration tests to target production
if (
  (testUrl && testUrl.includes(PRODUCTION_PROJECT_REF)) ||
  (testProjectRef && testProjectRef.includes(PRODUCTION_PROJECT_REF))
) {
  throw new Error(
    `[SECURITY_GATE_VIOLATION] Production database execution prohibited! ` +
    `Dedicated test project cannot target production ('${PRODUCTION_PROJECT_REF}'). ` +
    `An isolated, non-production test project is required.`
  );
}

// Fail closed: without explicit dedicated test credentials, suite skips with clear diagnostic
const isDedicatedTestConfigured = Boolean(
  testUrl &&
  testAnonKey &&
  testServiceRoleKey &&
  !testUrl.includes(PRODUCTION_PROJECT_REF)
);

describe.runIf(isDedicatedTestConfigured)(
  'Batch P — Genuine Authenticated PostgREST / RLS Tenancy Boundary Integration Suite',
  () => {
    let adminClient: SupabaseClient;
    let anonClient: SupabaseClient;
    let workerClient: SupabaseClient;
    let adminBClient: SupabaseClient;

    const runId = 'r' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const workerUserId = crypto.randomUUID();
    const adminBUserId = crypto.randomUUID();
    const testJobId = crypto.randomUUID();

    const orgAId = crypto.randomUUID();
    const orgBId = crypto.randomUUID();
    const appAId = crypto.randomUUID();
    const asgnBId = crypto.randomUUID();

    const orgASlug = `test-org-alpha-${runId}`;
    const orgBSlug = `test-org-beta-${runId}`;

    const initialNotes = `Org A Confidential Note (${runId}): Candidate requested $180k`;
    const initialAppliedAt = '2026-09-01T10:00:00.000Z';
    const workerEmail = `worker-${runId}@jobpulse.test`;
    const adminEmail = `admin-${runId}@jobpulse.test`;
    const testPassword = `TestPass!_${runId}`;

    beforeAll(async () => {
      adminClient = createClient(testUrl!, testServiceRoleKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      anonClient = createClient(testUrl!, testAnonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // 1. Create real authenticated test users via Supabase Admin Auth
      const { error: userAErr } = await adminClient.auth.admin.createUser({
        id: workerUserId,
        email: workerEmail,
        password: testPassword,
        email_confirm: true,
        user_metadata: { full_name: `Worker ${runId}` },
      });
      if (userAErr) throw new Error(`[SETUP_FAILURE] Worker A user creation failed: ${userAErr.message}`);

      const { error: userBErr } = await adminClient.auth.admin.createUser({
        id: adminBUserId,
        email: adminEmail,
        password: testPassword,
        email_confirm: true,
        user_metadata: { full_name: `Admin B ${runId}` },
      });
      if (userBErr) throw new Error(`[SETUP_FAILURE] Admin B user creation failed: ${userBErr.message}`);

      // 2. Sign in to obtain genuine session JWTs
      const { data: sessionA, error: signInAErr } = await anonClient.auth.signInWithPassword({
        email: workerEmail,
        password: testPassword,
      });
      if (signInAErr || !sessionA?.session?.access_token) {
        throw new Error(`[SETUP_FAILURE] Worker A sign-in failed: ${signInAErr?.message}`);
      }

      const { data: sessionB, error: signInBErr } = await anonClient.auth.signInWithPassword({
        email: adminEmail,
        password: testPassword,
      });
      if (signInBErr || !sessionB?.session?.access_token) {
        throw new Error(`[SETUP_FAILURE] Admin B sign-in failed: ${signInBErr?.message}`);
      }

      // 3. Create authenticated clients with genuine user JWTs
      workerClient = createClient(testUrl!, testAnonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${sessionA.session.access_token}` } },
      });

      adminBClient = createClient(testUrl!, testAnonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${sessionB.session.access_token}` } },
      });

      // 4. Provision test job
      const { error: jobErr } = await adminClient.from('jobs').insert({
        id: testJobId,
        canonical_title: `Staff Security Engineer (${runId})`,
        display_title: `Staff Security Engineer (${runId})`,
        description: 'Test job description for PostgREST RLS integration suite',
        apply_url: `https://test.example.com/apply/${runId}`,
        status: 'active',
      });
      if (jobErr) throw new Error(`[SETUP_FAILURE] Test job insertion failed: ${jobErr.message}`);

      // 5. Provision test organizations
      const { error: orgsErr } = await adminClient.from('organizations').insert([
        { id: orgAId, name: `Integration Org Alpha ${runId}`, slug: orgASlug },
        { id: orgBId, name: `Integration Org Beta ${runId}`, slug: orgBSlug },
      ]);
      if (orgsErr) throw new Error(`[SETUP_FAILURE] Organizations insertion failed: ${orgsErr.message}`);

      // 6. Provision organization members
      // Org A: Worker A is owner
      // Org B: Admin B is owner, Worker A is worker member
      const { error: membersErr } = await adminClient.from('organization_members').insert([
        { organization_id: orgAId, user_id: workerUserId, role: 'owner' },
        { organization_id: orgBId, user_id: adminBUserId, role: 'owner' },
        { organization_id: orgBId, user_id: workerUserId, role: 'worker' },
      ]);
      if (membersErr) throw new Error(`[SETUP_FAILURE] Memberships insertion failed: ${membersErr.message}`);

      // 7. Provision Application A in Org A
      const { error: appErr } = await adminClient.from('applications').insert({
        id: appAId,
        user_id: workerUserId,
        job_id: testJobId,
        company_name: 'Test Tech Corp',
        job_title: `Staff Security Engineer (${runId})`,
        status: 'applied',
        notes: initialNotes,
        organization_id: orgAId,
        worker_id: workerUserId,
        applied_at: initialAppliedAt,
        verification_status: 'verified',
        sync_status: 'synced',
      });
      if (appErr) throw new Error(`[SETUP_FAILURE] Application insertion failed: ${appErr.message}`);

      // 8. Provision Job Assignment B in Org B for Worker A
      const { error: asgnErr } = await adminClient.from('job_assignments').insert({
        id: asgnBId,
        organization_id: orgBId,
        job_id: testJobId,
        worker_id: workerUserId,
        status: 'in_progress',
        assigned_by: adminBUserId,
      });
      if (asgnErr) throw new Error(`[SETUP_FAILURE] Assignment insertion failed: ${asgnErr.message}`);
    }, 45000);

    afterAll(async () => {
      // Clean teardown targeting exact fixture IDs — must NEVER swallow errors
      const { data: cleanupReport, error: cleanupErr } = await adminClient.rpc(
        'cleanup_test_fixtures_by_ids',
        { p_target_org_ids: [orgAId, orgBId] }
      );
      if (cleanupErr) {
        throw new Error(`[TEARDOWN_FAILURE] cleanup_test_fixtures_by_ids failed: ${cleanupErr.message}`);
      }

      const { error: delJobErr } = await adminClient.from('jobs').delete().eq('id', testJobId);
      if (delJobErr) {
        throw new Error(`[TEARDOWN_FAILURE] Job deletion failed: ${delJobErr.message}`);
      }

      const { error: delUserAErr } = await adminClient.auth.admin.deleteUser(workerUserId);
      if (delUserAErr) {
        throw new Error(`[TEARDOWN_FAILURE] Worker A user deletion failed: ${delUserAErr.message}`);
      }

      const { error: delUserBErr } = await adminClient.auth.admin.deleteUser(adminBUserId);
      if (delUserBErr) {
        throw new Error(`[TEARDOWN_FAILURE] Admin B user deletion failed: ${delUserBErr.message}`);
      }

      // Independently verify zero test fixtures remain
      const { data: remainingOrgs, error: verifyErr } = await adminClient
        .from('organizations')
        .select('id')
        .in('id', [orgAId, orgBId]);
      if (verifyErr) {
        throw new Error(`[TEARDOWN_VERIFY_FAILURE] Verification query failed: ${verifyErr.message}`);
      }
      expect(remainingOrgs).toHaveLength(0);
    });

    describe('1. Unauthenticated PostgREST Access Rejection', () => {
      it('blocks unauthenticated access to job assignments via PostgREST RLS', async () => {
        const { data, error } = await anonClient
          .from('job_assignments')
          .select('*')
          .eq('id', asgnBId);

        // Anon role cannot see any private assignments
        expect(data).toHaveLength(0);
      });

      it('blocks unauthenticated execution of complete_assignment_with_application RPC', async () => {
        const { data, error } = await anonClient.rpc('complete_assignment_with_application', {
          p_assignment_id: asgnBId,
          p_notes: 'Unauthorized attempt',
        });

        expect(error).not.toBeNull();
        expect(error?.message).toMatch(/permission denied|not authorized|violates/i);
      });
    });

    describe('2. Worker Isolation & RLS Boundary', () => {
      it('blocks Admin B from executing completion on an assignment assigned to Worker A', async () => {
        const { data, error } = await adminBClient.rpc('complete_assignment_with_application', {
          p_assignment_id: asgnBId,
          p_notes: 'Impersonation attempt by Admin B',
        });

        expect(error).not.toBeNull();
        expect(error?.message).toContain('FORBIDDEN');
      });
    });

    describe('3. Cross-Tenant Organization Boundary', () => {
      it('blocks Admin B from querying Org A applications via PostgREST RLS', async () => {
        const { data, error } = await adminBClient
          .from('applications')
          .select('*')
          .eq('id', appAId);

        // RLS prevents Admin B from seeing applications belonging to Org A
        expect(data).toHaveLength(0);
      });

      it('blocks Admin B from modifying Org A applications via PostgREST UPDATE', async () => {
        const { data, error } = await adminBClient
          .from('applications')
          .update({ notes: 'Hostile update by foreign admin' })
          .eq('id', appAId)
          .select();

        expect(data).toHaveLength(0);
      });
    });

    describe('4. Cross-Organization Application Isolation & Completion', () => {
      it('executes RPC as authenticated Worker A and guarantees zero foreign data leakage', async () => {
        const { data, error } = await workerClient.rpc('complete_assignment_with_application', {
          p_assignment_id: asgnBId,
          p_notes: 'Org B Execution: Completed by Worker A with strict tenancy boundary',
          p_company_name: 'Test Tech Corp',
          p_job_title: 'Staff Security Engineer',
        });

        expect(error).toBeNull();
        expect(data).toBeDefined();

        // Assignment in Org B is completed
        expect(data.assignment.id).toBe(asgnBId);
        expect(data.assignment.status).toBe('completed');
        expect(data.assignment.organization_id).toBe(orgBId);

        // Application from Org A is strictly suppressed
        expect(data.application).toBeNull();
        expect(data.cross_organization_application).toBe(true);

        // Sensitive Org A notes and Org A ID must not appear in response
        expect(JSON.stringify(data)).not.toContain(initialNotes);
        expect(JSON.stringify(data)).not.toContain(orgAId);
      });

      it('verifies Application A in Org A remains 100% unmutated after Org B completion', async () => {
        const { data, error } = await workerClient
          .from('applications')
          .select('*')
          .eq('id', appAId)
          .single();

        expect(error).toBeNull();
        expect(data.id).toBe(appAId);
        expect(data.organization_id).toBe(orgAId);
        expect(data.notes).toBe(initialNotes); // MUST NOT be overwritten by Org B notes
        expect(data.status).toBe('applied');
      });

      it('verifies 0 foreign application events were created under Org B', async () => {
        const { data, error } = await adminClient
          .from('application_events')
          .select('*')
          .eq('application_id', appAId)
          .eq('organization_id', orgBId);

        expect(error).toBeNull();
        expect(data).toHaveLength(0);
      });
    });
  }
);
