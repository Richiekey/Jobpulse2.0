import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';

const PRODUCTION_PROJECT_REF = 'rgwutmthzigjmzsmmjnp';
const testProjectRef = process.env.SUPABASE_TEST_PROJECT_REF;
const testMgmtToken = process.env.SUPABASE_TEST_MGMT_TOKEN || process.env.SUPABASE_MGMT_TOKEN;

// HARD SECURITY GATE: Never allow integration tests to silently or explicitly execute against production
if (testProjectRef && (testProjectRef === PRODUCTION_PROJECT_REF || testProjectRef.includes(PRODUCTION_PROJECT_REF))) {
  throw new Error(
    `[SECURITY_GATE_VIOLATION] Production database execution prohibited! ` +
    `SUPABASE_TEST_PROJECT_REF cannot target production ('${PRODUCTION_PROJECT_REF}'). ` +
    `A dedicated, isolated non-production test project is required.`
  );
}

const isDedicatedTestConfigured = Boolean(
  testProjectRef && 
  testMgmtToken && 
  testProjectRef !== PRODUCTION_PROJECT_REF && 
  !testProjectRef.includes(PRODUCTION_PROJECT_REF)
);

async function executeSql<T = any>(query: string): Promise<T> {
  if (!isDedicatedTestConfigured) {
    throw new Error('Integration test database credentials not configured');
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${testProjectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${testMgmtToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`PostgreSQL query failed (${res.status}): ${errText}`);
  }
  return res.json();
}

describe.runIf(isDedicatedTestConfigured)(
  'Batch P — Genuine PostgreSQL Multi-Tenant Integration Suite (P-H03)',
  () => {
    const runId = crypto.randomUUID().slice(0, 8);
    const workerUserId = crypto.randomUUID();
    const orgBAdminId = crypto.randomUUID();
    const testJobId = crypto.randomUUID();

    const orgAId = crypto.randomUUID();
    const orgBId = crypto.randomUUID();
    const appAId = crypto.randomUUID();
    const asgnBId = crypto.randomUUID();

    const initialNotes = `Org A Confidential Note (${runId}): Candidate requested $180k`;
    const initialAppliedAt = '2026-09-01T10:00:00.000Z';
    const initialStatus = 'applied';
    const initialVerificationStatus = 'verified';
    const initialSyncStatus = 'synced';

    beforeAll(async () => {
      // Setup dedicated isolated test entities in the dedicated test database
      await executeSql(`
        -- 1. Insert dedicated test users
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES 
          ('${workerUserId}', 'test-worker-${runId}@jobpulse.test', '{"name": "Test Worker ${runId}"}'::jsonb),
          ('${orgBAdminId}', 'test-admin-${runId}@jobpulse.test', '{"name": "Test Admin ${runId}"}'::jsonb)
        ON CONFLICT (id) DO NOTHING;

        -- 2. Insert dedicated test job
        INSERT INTO public.jobs (
          id,
          canonical_title,
          display_title,
          description,
          apply_url,
          status
        ) VALUES (
          '${testJobId}',
          'Test Staff Security Engineer (${runId})',
          'Test Staff Security Engineer (${runId})',
          'Job description for integration testing',
          'https://test.example.com/apply/${runId}',
          'active'
        );

        -- 3. Setup Organizations and Memberships
        INSERT INTO public.organizations (id, name, slug)
        VALUES 
          ('${orgAId}', 'Integration Org Alpha ${runId}', 'int-org-alpha-${runId}'),
          ('${orgBId}', 'Integration Org Beta ${runId}', 'int-org-beta-${runId}');

        -- Org A: Worker W is owner
        INSERT INTO public.organization_members (organization_id, user_id, role)
        VALUES ('${orgAId}', '${workerUserId}', 'owner');

        -- Org B: Admin is owner (first member)
        INSERT INTO public.organization_members (organization_id, user_id, role)
        VALUES ('${orgBId}', '${orgBAdminId}', 'owner');

        -- Org B: Worker W is legitimate worker member
        INSERT INTO public.organization_members (organization_id, user_id, role)
        VALUES ('${orgBId}', '${workerUserId}', 'worker');

        -- 4. Create Application A in Org A
        INSERT INTO public.applications (
          id,
          user_id,
          job_id,
          company_name,
          job_title,
          status,
          notes,
          organization_id,
          worker_id,
          applied_at,
          verification_status,
          sync_status
        ) VALUES (
          '${appAId}',
          '${workerUserId}',
          '${testJobId}',
          'Test Tech Corp',
          'Test Staff Security Engineer (${runId})',
          '${initialStatus}'::public.application_status_enum,
          '${initialNotes}',
          '${orgAId}',
          '${workerUserId}',
          '${initialAppliedAt}'::timestamptz,
          '${initialVerificationStatus}'::public.verification_status_enum,
          '${initialSyncStatus}'::public.sync_status_enum
        );

        -- 5. Create Assignment B in Org B
        INSERT INTO public.job_assignments (
          id,
          organization_id,
          job_id,
          worker_id,
          status,
          assigned_by
        ) VALUES (
          '${asgnBId}',
          '${orgBId}',
          '${testJobId}',
          '${workerUserId}',
          'in_progress',
          '${orgBAdminId}'
        );
      `);
    }, 30000);

    afterAll(async () => {
      // 1. Authoritative teardown using exact IDs — must NEVER swallow errors
      const cleanupResult = await executeSql<any[]>(`
        SELECT public.cleanup_test_fixtures_by_ids(ARRAY['${orgAId}'::uuid, '${orgBId}'::uuid]) AS result;
      `);
      if (!cleanupResult || cleanupResult.length === 0 || !cleanupResult[0].result?.success) {
        throw new Error(`[TEARDOWN_FAILURE] cleanup_test_fixtures_by_ids did not return success`);
      }

      // 2. Delete test catalog job
      await executeSql(`DELETE FROM public.jobs WHERE id = '${testJobId}';`);

      // 3. Delete auth test users
      await executeSql(`DELETE FROM auth.users WHERE id IN ('${workerUserId}', '${orgBAdminId}');`);

      // 4. Independently verify zero test fixtures remain
      const [remaining] = await executeSql<any[]>(`
        SELECT count(*) as count 
        FROM public.organizations 
        WHERE id IN ('${orgAId}', '${orgBId}');
      `);
      expect(parseInt(remaining.count, 10)).toBe(0);
    });

    it('verifies exact database state BEFORE RPC execution', async () => {
      const [state] = await executeSql<any[]>(`
        SELECT
          (SELECT row_to_json(p) FROM (
            SELECT id, organization_id, user_id, job_id, status::text, notes, applied_at, verification_status::text, sync_status::text 
            FROM public.applications 
            WHERE id = '${appAId}'
          ) p) as application,
          (SELECT row_to_json(a) FROM (
            SELECT id, organization_id, worker_id, job_id, status 
            FROM public.job_assignments 
            WHERE id = '${asgnBId}'
          ) a) as assignment,
          (SELECT count(*) FROM public.application_events WHERE application_id = '${appAId}') as app_events_count,
          (SELECT count(*) FROM public.assignment_events WHERE assignment_id = '${asgnBId}' AND event_type = 'completed') as asgn_completed_events_count,
          (SELECT count(*) FROM public.assignment_events WHERE assignment_id = '${asgnBId}') as asgn_total_events_count,
          (SELECT count(*) FROM public.sync_events WHERE application_id = '${appAId}') as sync_events_count;
      `);

      // Application A State Before RPC
      expect(state.application).not.toBeNull();
      expect(state.application.id).toBe(appAId);
      expect(state.application.organization_id).toBe(orgAId);
      expect(state.application.user_id).toBe(workerUserId);
      expect(state.application.job_id).toBe(testJobId);
      expect(state.application.status).toBe('applied');
      expect(state.application.notes).toBe(initialNotes);
      expect(state.application.verification_status).toBe('verified');
      expect(state.application.sync_status).toBe('synced');

      // Assignment B State Before RPC
      expect(state.assignment).not.toBeNull();
      expect(state.assignment.id).toBe(asgnBId);
      expect(state.assignment.organization_id).toBe(orgBId);
      expect(state.assignment.worker_id).toBe(workerUserId);
      expect(state.assignment.job_id).toBe(testJobId);
      expect(state.assignment.status).toBe('in_progress');

      // Baseline Event Counts:
      expect(parseInt(state.app_events_count, 10)).toBe(1);
      expect(parseInt(state.asgn_completed_events_count, 10)).toBe(0);
      expect(parseInt(state.asgn_total_events_count, 10)).toBe(1);
      expect(parseInt(state.sync_events_count, 10)).toBe(0);
    }, 30000);

    it('executes genuine PostgreSQL complete_assignment_with_application RPC without mocking', async () => {
      const rpcResult = await executeSql<any[]>(`
        WITH auth_ctx AS (
          SELECT set_config('request.jwt.claim.sub', '${workerUserId}', true),
                 set_config('request.jwt.claim.role', 'authenticated', true)
        )
        SELECT public.complete_assignment_with_application(
          '${asgnBId}'::uuid,
          'Org B Execution: Completed by Worker W with no cross-org leak'::text,
          'Test Tech Corp'::text,
          'Test Staff Security Engineer'::text
        ) AS result
        FROM auth_ctx;
      `);

      expect(rpcResult).toHaveLength(1);
      const data = rpcResult[0].result;

      // 1. RPC Response boundary assertions
      expect(data).toBeDefined();
      expect(data.assignment).toBeDefined();
      expect(data.assignment.id).toBe(asgnBId);
      expect(data.assignment.status).toBe('completed');
      expect(data.assignment.organization_id).toBe(orgBId);

      // Critical Tenancy Verification: Application is suppressed to prevent foreign leakage
      expect(data.application).toBeNull();
      expect(data.cross_organization_application).toBe(true);

      // Ensure foreign notes or sensitive details are completely absent
      expect(JSON.stringify(data)).not.toContain(initialNotes);
      expect(JSON.stringify(data)).not.toContain(orgAId);
    }, 30000);

    it('verifies exact database state AFTER RPC execution across all entities', async () => {
      const [state] = await executeSql<any[]>(`
        SELECT
          (SELECT row_to_json(a) FROM (
            SELECT id, organization_id, worker_id, job_id, status 
            FROM public.job_assignments 
            WHERE id = '${asgnBId}'
          ) a) as assignment,
          (SELECT row_to_json(p) FROM (
            SELECT id, organization_id, user_id, job_id, status::text, notes, applied_at, verification_status::text, sync_status::text 
            FROM public.applications 
            WHERE id = '${appAId}'
          ) p) as application,
          (SELECT count(*) FROM public.applications WHERE user_id = '${workerUserId}' AND job_id = '${testJobId}') as user_job_app_count,
          (SELECT count(*) FROM public.application_events WHERE application_id = '${appAId}') as app_events_count,
          (SELECT count(*) FROM public.sync_events WHERE application_id = '${appAId}' AND organization_id = '${orgBId}') as sync_events_count,
          (SELECT row_to_json(e) FROM (
            SELECT id, assignment_id, organization_id, actor_id, event_type 
            FROM public.assignment_events 
            WHERE assignment_id = '${asgnBId}' AND event_type = 'completed' 
            LIMIT 1
          ) e) as asgn_completed_event;
      `);

      // 1. Assignment B in Database: Completed and belongs to Org B
      expect(state.assignment).not.toBeNull();
      expect(state.assignment.status).toBe('completed');
      expect(state.assignment.organization_id).toBe(orgBId);
      expect(state.assignment.worker_id).toBe(workerUserId);

      // 2. Application A in Database: 100% Unmutated, belongs to Org A
      expect(state.application).not.toBeNull();
      expect(state.application.id).toBe(appAId);
      expect(state.application.organization_id).toBe(orgAId);
      expect(state.application.user_id).toBe(workerUserId);
      expect(state.application.job_id).toBe(testJobId);
      expect(state.application.status).toBe(initialStatus);
      expect(state.application.notes).toBe(initialNotes); // MUST NOT be overwritten by Org B notes!
      expect(new Date(state.application.applied_at).toISOString()).toBe(initialAppliedAt);
      expect(state.application.verification_status).toBe(initialVerificationStatus);
      expect(state.application.sync_status).toBe(initialSyncStatus);

      // 3. Global Uniqueness Invariant: Exactly 1 application row exists for (user_id, job_id)
      expect(parseInt(state.user_job_app_count, 10)).toBe(1);

      // 4. Application Events Isolation: Exactly 0 new events created on Org A Application (count remains 1)
      expect(parseInt(state.app_events_count, 10)).toBe(1);

      // 5. Sync Events Isolation: 0 foreign sync events enqueued for Org A Application under Org B
      expect(parseInt(state.sync_events_count, 10)).toBe(0);

      // 6. Assignment Events Provenance: Completed event recorded under Org B with actor Worker W
      expect(state.asgn_completed_event).not.toBeNull();
      expect(state.asgn_completed_event.organization_id).toBe(orgBId);
      expect(state.asgn_completed_event.assignment_id).toBe(asgnBId);
      expect(state.asgn_completed_event.actor_id).toBe(workerUserId);
      expect(state.asgn_completed_event.event_type).toBe('completed');
    }, 30000);

    it('proves idempotent re-invocation preserves identical tenancy invariants', async () => {
      const retryResult = await executeSql<any[]>(`
        WITH auth_ctx AS (
          SELECT set_config('request.jwt.claim.sub', '${workerUserId}', true),
                 set_config('request.jwt.claim.role', 'authenticated', true)
        )
        SELECT public.complete_assignment_with_application(
          '${asgnBId}'::uuid,
          'Idempotent retry note'::text
        ) AS result
        FROM auth_ctx;
      `);

      expect(retryResult).toHaveLength(1);
      const data = retryResult[0].result;

      expect(data.idempotent).toBe(true);
      expect(data.assignment.id).toBe(asgnBId);
      expect(data.assignment.status).toBe('completed');
      expect(data.application).toBeNull();
      expect(data.cross_organization_application).toBe(true);

      // Verify Application A remains strictly unmutated after retry
      const [appCheck] = await executeSql<any[]>(`
        SELECT notes FROM public.applications WHERE id = '${appAId}';
      `);
      expect(appCheck.notes).toBe(initialNotes);

      // Verify still exactly 1 application
      const [dupCheck] = await executeSql<{ count: string }[]>(`
        SELECT count(*) as count 
        FROM public.applications 
        WHERE user_id = '${workerUserId}' AND job_id = '${testJobId}';
      `);
      expect(parseInt(dupCheck.count, 10)).toBe(1);
    }, 30000);
  }
);
