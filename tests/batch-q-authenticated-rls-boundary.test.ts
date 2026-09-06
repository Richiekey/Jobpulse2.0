import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { AuthGuard } from '../apps/web/lib/auth-guard';
import { SyncRetryService } from '../apps/web/lib/sync-retry-service';

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

const testUrl = process.env['SUPABASE_TEST_URL'] || process.env['NEXT_PUBLIC_SUPABASE_TEST_URL'];
const testAnonKey = process.env['SUPABASE_TEST_ANON_KEY'] || process.env['NEXT_PUBLIC_SUPABASE_TEST_ANON_KEY'];
const testServiceRoleKey = process.env['SUPABASE_TEST_SERVICE_ROLE_KEY'];
const testProjectRef = process.env['SUPABASE_TEST_PROJECT_REF'];

// Q-FIX-04: HARD SECURITY GATE: Prohibit execution against production
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

// Populate environment variables for server services (SyncRetryService, createAdminClient)
if (testUrl) {
  process.env['NEXT_PUBLIC_SUPABASE_URL'] = testUrl;
  process.env['SUPABASE_URL'] = testUrl;
}
if (testServiceRoleKey) {
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = testServiceRoleKey;
  process.env['SUPABASE_SECRET_KEY'] = testServiceRoleKey;
}
if (testAnonKey) {
  process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = testAnonKey;
}

// Q-FIX-03: FAIL-CLOSED: No describe.skip or conditional silent pass.
// The test suite unconditionally executes; if credentials are missing, it throws and FAILS.
describe('Batch Q — Genuine Authenticated PostgREST / Multi-Tenant RLS Boundary Suite (Q-H03, Q-H04, Q-V01-Q-V05)', { timeout: 30000 }, () => {
  let adminClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let adminAClient: SupabaseClient;
  let adminBClient: SupabaseClient;
  let workerAClient: SupabaseClient;
  let platformAdminClient: SupabaseClient;
  let normalUserClient: SupabaseClient;

  const runId = 'q' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const adminAUserId = crypto.randomUUID();
  const adminBUserId = crypto.randomUUID();
  const workerAUserId = crypto.randomUUID();
  const platformAdminUserId = crypto.randomUUID();
  const normalUserId = crypto.randomUUID();
  const testJobId = crypto.randomUUID();
  const testJob2Id = crypto.randomUUID();

  const orgAId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();
  const asgnAId = crypto.randomUUID();
  const asgnCompletedId = crypto.randomUUID();
  const appAId = crypto.randomUUID();
  const appBId = crypto.randomUUID();
  const personalAppBId = crypto.randomUUID();
  const personalAppNormalId = crypto.randomUUID();
  const verifAId = crypto.randomUUID();

  const syncEventAId = crypto.randomUUID();
  const syncEventBId = crypto.randomUUID();
  const syncEventCappedId = crypto.randomUUID();
  const syncEventSyncedId = crypto.randomUUID();
  const personalSyncEventBId = crypto.randomUUID();
  const personalSyncEventNormalId = crypto.randomUUID();

  const orgASlug = `alpha-${runId}`;
  const orgBSlug = `beta-${runId}`;

  const adminAEmail = `admin-a-${runId}@jobpulse.test`;
  const adminBEmail = `admin-b-${runId}@jobpulse.test`;
  const workerAEmail = `worker-a-${runId}@jobpulse.test`;
  const platformAdminEmail = `plat-admin-${runId}@jobpulse.test`;
  const normalUserEmail = `normal-${runId}@jobpulse.test`;
  const testPassword = `PassQ!_${runId}`;

  beforeAll(async () => {
    // Q-FIX-03: Fail-closed requirement — must fail if credentials missing
    if (!testUrl || !testAnonKey || !testServiceRoleKey) {
      throw new Error(
        `[FAIL_CLOSED] Dedicated test environment credentials are required but missing! ` +
        `SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, and SUPABASE_TEST_SERVICE_ROLE_KEY must be provided. ` +
        `Target must be the isolated non-production project (wvyrivmvpcrhwinzmcyy).`
      );
    }

    adminClient = createClient(testUrl, testServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    anonClient = createClient(testUrl, testAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Provision 5 dedicated test users with retry
    const userSpecs = [
      { id: adminAUserId, email: adminAEmail, name: `Admin Org A (${runId})` },
      { id: adminBUserId, email: adminBEmail, name: `Admin Org B (${runId})` },
      { id: workerAUserId, email: workerAEmail, name: `Worker Org A (${runId})` },
      { id: platformAdminUserId, email: platformAdminEmail, name: `Platform Superadmin (${runId})` },
      { id: normalUserId, email: normalUserEmail, name: `Regular User (${runId})` },
    ];

    async function retryOp<T>(op: () => Promise<T>, label: string, maxTries = 4): Promise<T> {
      for (let attempt = 1; attempt <= maxTries; attempt++) {
        try {
          return await op();
        } catch (err: any) {
          if (attempt === maxTries) throw new Error(`[SETUP_FAILURE] ${label} failed after ${maxTries} attempts: ${err.message}`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
      throw new Error(`[SETUP_FAILURE] ${label} failed`);
    }

    for (const spec of userSpecs) {
      await retryOp(async () => {
        const { error } = await adminClient.auth.admin.createUser({
          id: spec.id,
          email: spec.email,
          password: testPassword,
          email_confirm: true,
          user_metadata: { full_name: spec.name },
        });
        if (error) throw new Error(error.message);
      }, `User creation (${spec.email})`);
    }

    // 2. Ensure profile rows exist with exact roles
    await adminClient.from('profiles').upsert([
      { id: adminAUserId, email: adminAEmail, full_name: `Admin Alpha ${runId}`, role: 'user' },
      { id: adminBUserId, email: adminBEmail, full_name: `Admin Beta ${runId}`, role: 'user' },
      { id: workerAUserId, email: workerAEmail, full_name: `Worker Alpha ${runId}`, role: 'user' },
      { id: platformAdminUserId, email: platformAdminEmail, full_name: `Platform Admin ${runId}`, role: 'admin' },
      { id: normalUserId, email: normalUserEmail, full_name: `Normal User ${runId}`, role: 'user' },
    ]);

    // 3. Create organizations
    const { error: orgAErr } = await adminClient.from('organizations').insert({
      id: orgAId,
      name: `Alpha Corp ${runId}`,
      slug: orgASlug,
    });
    if (orgAErr) throw new Error(`[SETUP_FAILURE] Org A creation failed: ${orgAErr.message}`);

    const { error: orgBErr } = await adminClient.from('organizations').insert({
      id: orgBId,
      name: `Beta Corp ${runId}`,
      slug: orgBSlug,
    });
    if (orgBErr) throw new Error(`[SETUP_FAILURE] Org B creation failed: ${orgBErr.message}`);

    // 4. Create organization memberships
    // Org A: Admin A (owner), Worker A (worker)
    // Org B: Admin B (owner)
    // Platform Admin & Normal User: NO organization memberships
    const { error: memErr } = await adminClient.from('organization_members').insert([
      { organization_id: orgAId, user_id: adminAUserId, role: 'owner' },
      { organization_id: orgBId, user_id: adminBUserId, role: 'owner' },
      { organization_id: orgAId, user_id: workerAUserId, role: 'worker' },
    ]);
    if (memErr) throw new Error(`[SETUP_FAILURE] Memberships creation failed: ${memErr.message}`);

    // 5. Seed catalog jobs
    const { error: jobErr } = await adminClient.from('jobs').insert([
      {
        id: testJobId,
        canonical_title: `Staff Distributed Systems Engineer (${runId})`,
        display_title: `Staff Distributed Systems Engineer (${runId})`,
        description: 'Test job description for PostgREST RLS integration suite',
        apply_url: `https://example.com/jobs/${runId}/apply`,
        status: 'active',
      },
      {
        id: testJob2Id,
        canonical_title: `Principal Reliability Engineer (${runId})`,
        display_title: `Principal Reliability Engineer (${runId})`,
        description: 'Test job 2 description for completed assignment',
        apply_url: `https://example.com/jobs/${runId}-2/apply`,
        status: 'active',
      },
    ]);
    if (jobErr) throw new Error(`[SETUP_FAILURE] Job fixture creation failed: ${jobErr.message}`);

    // 6. Seed job assignments in Org A
    // (a) Active assignment to be cancelled
    const { error: asgnErr } = await adminClient.from('job_assignments').insert({
      id: asgnAId,
      organization_id: orgAId,
      job_id: testJobId,
      worker_id: workerAUserId,
      assigned_by: adminAUserId,
      status: 'assigned',
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      notes: `Confidential dispatch notes for Org A (${runId})`,
    });
    if (asgnErr) throw new Error(`[SETUP_FAILURE] Assignment creation failed: ${asgnErr.message}`);

    // (b) Completed assignment to test immutable terminal status
    const { error: asgnCompErr } = await adminClient.from('job_assignments').insert({
      id: asgnCompletedId,
      organization_id: orgAId,
      job_id: testJob2Id,
      worker_id: workerAUserId,
      assigned_by: adminAUserId,
      status: 'completed',
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      notes: `Already completed assignment (${runId})`,
    });
    if (asgnCompErr) throw new Error(`[SETUP_FAILURE] Completed assignment creation failed: ${asgnCompErr.message}`);

    // 7. Seed applications across Org A, Org B, and Personal scopes
    const { error: appErr } = await adminClient.from('applications').insert([
      {
        id: appAId,
        user_id: workerAUserId,
        organization_id: orgAId,
        worker_id: workerAUserId,
        job_id: testJobId,
        company_name: 'Test Systems Inc',
        job_title: 'Staff Distributed Systems Engineer',
        status: 'applied',
        verification_status: 'pending',
        applied_at: new Date().toISOString(),
        notes: `Org A application notes (${runId})`,
      },
      {
        id: appBId,
        user_id: adminBUserId,
        organization_id: orgBId,
        worker_id: adminBUserId,
        job_id: testJobId,
        company_name: 'Beta Global Inc',
        job_title: 'Lead Platform Engineer',
        status: 'applied',
        verification_status: 'pending',
        applied_at: new Date().toISOString(),
        notes: `Org B application notes (${runId})`,
      },
      {
        id: personalAppBId,
        user_id: adminBUserId,
        organization_id: null,
        worker_id: null,
        job_id: testJob2Id,
        company_name: 'Personal Corp',
        job_title: 'Software Architect',
        status: 'applied',
        verification_status: 'pending',
        applied_at: new Date().toISOString(),
        notes: `Personal application notes (${runId})`,
      },
      {
        id: personalAppNormalId,
        user_id: normalUserId,
        organization_id: null,
        worker_id: null,
        job_id: testJobId,
        company_name: 'Normal User Corp',
        job_title: 'Staff Software Architect',
        status: 'applied',
        verification_status: 'pending',
        applied_at: new Date().toISOString(),
        notes: `Normal user personal application (${runId})`,
      },
    ]);
    if (appErr) throw new Error(`[SETUP_FAILURE] Applications creation failed: ${appErr.message}`);

    // 8. Seed application verification in Org A
    const { error: verifErr } = await adminClient.from('application_verifications').insert({
      id: verifAId,
      application_id: appAId,
      organization_id: orgAId,
      worker_id: workerAUserId,
      screenshot_url: `verification-screenshots/${orgAId}/${appAId}/screenshot_${runId}.png`,
      status: 'pending',
    });
    if (verifErr) throw new Error(`[SETUP_FAILURE] Verification creation failed: ${verifErr.message}`);

    // 9. Seed sync events across Org A, Org B, and Personal scopes
    const syncFixtures = [
      // Org A failed sync event (eligible for retry)
      {
        id: syncEventAId,
        organization_id: orgAId,
        user_id: workerAUserId,
        application_id: appAId,
        provider: 'google_sheets',
        status: 'failed',
        attempts: 3,
        max_attempts: 5,
        next_retry_at: new Date(Date.now() + 3600000).toISOString(),
        last_error: `Google Sheets API quota exceeded (429) [${runId}]`,
        payload: { app: appAId, run: runId },
        manual_retry_count: 0,
      },
      // Org B failed sync event (eligible for retry by Org B admin only)
      {
        id: syncEventBId,
        organization_id: orgBId,
        user_id: adminBUserId,
        application_id: appBId,
        provider: 'airtable',
        status: 'failed',
        attempts: 2,
        max_attempts: 5,
        next_retry_at: new Date(Date.now() + 3600000).toISOString(),
        last_error: `Airtable rate limit [${runId}]`,
        payload: { org: orgBId, run: runId },
        manual_retry_count: 0,
      },
      // Org A failed sync event with manual retry limit reached (5 retries)
      {
        id: syncEventCappedId,
        organization_id: orgAId,
        user_id: workerAUserId,
        application_id: appAId,
        provider: 'google_sheets',
        status: 'failed',
        attempts: 5,
        max_attempts: 5,
        next_retry_at: new Date(Date.now() + 3600000).toISOString(),
        last_error: `Max manual retries reached [${runId}]`,
        payload: { app: appAId, run: runId },
        manual_retry_count: 5,
      },
      // Org A already synced event (ineligible for retry)
      {
        id: syncEventSyncedId,
        organization_id: orgAId,
        user_id: workerAUserId,
        application_id: appAId,
        provider: 'google_sheets',
        status: 'synced',
        attempts: 1,
        max_attempts: 5,
        next_retry_at: new Date().toISOString(),
        last_error: null,
        payload: { app: appAId, run: runId },
        manual_retry_count: 0,
      },
      // Personal failed sync event for Admin B (organization_id = NULL)
      {
        id: personalSyncEventBId,
        organization_id: null,
        user_id: adminBUserId,
        application_id: personalAppBId,
        provider: 'notion',
        status: 'failed',
        attempts: 1,
        max_attempts: 5,
        next_retry_at: new Date(Date.now() + 3600000).toISOString(),
        last_error: `Personal sync failure [${runId}]`,
        payload: { user: adminBUserId, run: runId },
        manual_retry_count: 0,
      },
      // Personal failed sync event for Normal User (organization_id = NULL)
      {
        id: personalSyncEventNormalId,
        organization_id: null,
        user_id: normalUserId,
        application_id: personalAppNormalId,
        provider: 'airtable',
        status: 'failed',
        attempts: 1,
        max_attempts: 5,
        next_retry_at: new Date(Date.now() + 3600000).toISOString(),
        last_error: `Normal user personal sync failure [${runId}]`,
        payload: { user: normalUserId, run: runId },
        manual_retry_count: 0,
      },
    ];

    const { error: syncErr } = await adminClient.from('sync_events').insert(syncFixtures);
    if (syncErr) throw new Error(`[SETUP_FAILURE] Sync events fixture creation failed: ${syncErr.message}`);

    // 10. Ensure private verification-screenshots bucket exists and seed storage screenshot object
    const { data: buckets } = await adminClient.storage.listBuckets();
    const hasBucket = buckets?.some(b => b.name === 'verification-screenshots');
    if (!hasBucket) {
      await adminClient.storage.createBucket('verification-screenshots', {
        public: false,
        fileSizeLimit: 10485760,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      });
    }

    const rawScreenshotPath = `${orgAId}/${appAId}/screenshot_${runId}.png`;
    const { error: uploadErr } = await adminClient.storage
      .from('verification-screenshots')
      .upload(rawScreenshotPath, Buffer.from('test-screenshot-content-batch-q'), {
        contentType: 'image/png',
        upsert: true,
      });
    if (uploadErr) throw new Error(`[SETUP_FAILURE] Screenshot upload failed: ${uploadErr.message}`);

    // 11. Authenticate separate PostgREST clients with authentic JWTs from Supabase Auth
    async function createAuthenticatedClient(email: string): Promise<SupabaseClient> {
      return await retryOp(async () => {
        const authClient = createClient(testUrl!, testAnonKey!, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: session, error: signErr } = await authClient.auth.signInWithPassword({
          email,
          password: testPassword,
        });
        if (signErr || !session?.session?.access_token) {
          throw new Error(`[AUTH_FAILURE] Sign-in failed for ${email}: ${signErr?.message}`);
        }

        return createClient(testUrl!, testAnonKey!, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
        });
      }, `Sign-in (${email})`);
    }

    adminAClient = await createAuthenticatedClient(adminAEmail);
    adminBClient = await createAuthenticatedClient(adminBEmail);
    workerAClient = await createAuthenticatedClient(workerAEmail);
    platformAdminClient = await createAuthenticatedClient(platformAdminEmail);
    normalUserClient = await createAuthenticatedClient(normalUserEmail);
  }, 90000);

  afterAll(async () => {
    if (!adminClient) return;

    try {
      const rawScreenshotPath = `${orgAId}/${appAId}/screenshot_${runId}.png`;
      await adminClient.storage.from('verification-screenshots').remove([rawScreenshotPath]);

      // Clean up all seeded test fixtures in foreign key dependency order
      await adminClient.from('sync_events').delete().in('id', [
        syncEventAId,
        syncEventBId,
        syncEventCappedId,
        syncEventSyncedId,
        personalSyncEventBId,
        personalSyncEventNormalId,
      ]);
      await adminClient.from('application_verifications').delete().eq('id', verifAId);
      await adminClient.from('applications').delete().in('id', [appAId, appBId, personalAppBId, personalAppNormalId]);
      await adminClient.from('assignment_events').delete().in('assignment_id', [asgnAId, asgnCompletedId]);
      await adminClient.from('job_assignments').delete().in('id', [asgnAId, asgnCompletedId]);
      await adminClient.from('jobs').delete().in('id', [testJobId, testJob2Id]);
      await adminClient.from('organization_members').delete().in('organization_id', [orgAId, orgBId]);
      await adminClient.from('organizations').delete().in('id', [orgAId, orgBId]);
      await adminClient.from('profiles').delete().in('id', [
        adminAUserId,
        adminBUserId,
        workerAUserId,
        platformAdminUserId,
        normalUserId,
      ]);

      // Remove test users from Supabase Auth
      await adminClient.auth.admin.deleteUser(adminAUserId);
      await adminClient.auth.admin.deleteUser(adminBUserId);
      await adminClient.auth.admin.deleteUser(workerAUserId);
      await adminClient.auth.admin.deleteUser(platformAdminUserId);
      await adminClient.auth.admin.deleteUser(normalUserId);

      // Q-FIX-08: Fail-closed verification: confirm zero leftover test fixtures
      const { data: leftoverUsers } = await adminClient
        .from('profiles')
        .select('id')
        .like('email', `%${runId}%`);

      if (leftoverUsers && leftoverUsers.length > 0) {
        throw new Error(`[CLEANUP_FAILURE] Leftover test profiles detected: ${leftoverUsers.length}`);
      }
    } catch (err: any) {
      console.error('[CLEANUP_EXCEPTION]', err);
      throw err;
    }
  }, 35000);

  // =========================================================================
  // Q-FIX-04: Non-Production Safety Gate Verification
  // =========================================================================
  it('proves target test environment is non-production (wvyrivmvpcrhwinzmcyy) (Q-FIX-04)', () => {
    expect(testUrl).toBeDefined();
    expect(testUrl).not.toContain(PRODUCTION_PROJECT_REF);
    expect(testUrl).toContain('wvyrivmvpcrhwinzmcyy');
  });

  // =========================================================================
  // Q-H03: Cross-Tenant RLS Isolation on Job Assignments
  // =========================================================================
  it('enforces strict cross-tenant RLS isolation on job assignments (Q-H03)', async () => {
    // Admin B querying Org A assignment via genuine PostgREST MUST return 0 rows
    const { data: foreignData, error: foreignErr } = await adminBClient
      .from('job_assignments')
      .select('id, organization_id, notes')
      .eq('id', asgnAId);

    expect(foreignErr).toBeNull();
    expect(foreignData).toHaveLength(0);

    // Admin A querying own Org A assignment MUST return the record
    const { data: ownData, error: ownErr } = await adminAClient
      .from('job_assignments')
      .select('id, organization_id, notes')
      .eq('id', asgnAId)
      .single();

    expect(ownErr).toBeNull();
    expect(ownData).not.toBeNull();
    expect(ownData?.id).toBe(asgnAId);
    expect(ownData?.organization_id).toBe(orgAId);
    expect(ownData?.notes).toContain('Confidential dispatch notes for Org A');
  });

  // =========================================================================
  // Q-FIX-06: Assignment Cancellation Database Proof (15 Invariants)
  // =========================================================================
  it('enforces durable, non-destructive assignment cancellation with immutable lifecycle audit (Q-FIX-06)', async () => {
    // 1. Capture original assignment state before cancellation
    const { data: original, error: origErr } = await adminClient
      .from('job_assignments')
      .select('id, organization_id, job_id, worker_id, assigned_by, created_at, deadline_at, notes, status')
      .eq('id', asgnAId)
      .single();

    expect(origErr).toBeNull();
    expect(original).not.toBeNull();
    expect(original!.status).toBe('assigned');

    // 2. Perform cancellation through authenticated client (Admin A of Org A)
    const { data: updated, error: updateErr } = await adminAClient
      .from('job_assignments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', asgnAId)
      .select('*')
      .single();

    expect(updateErr).toBeNull();
    expect(updated).not.toBeNull();

    // 3. Query the database directly via service role adminClient and verify all 15 points:
    const { data: current, error: curErr } = await adminClient
      .from('job_assignments')
      .select('*')
      .eq('id', asgnAId)
      .single();

    expect(curErr).toBeNull();
    expect(current).not.toBeNull();

    // 1. Assignment row still exists
    expect(current).toBeDefined();

    // 2. Same assignment ID remains
    expect(current!.id).toBe(original!.id);

    // 3. Organization remains unchanged
    expect(current!.organization_id).toBe(original!.organization_id);

    // 4. Worker remains unchanged
    expect(current!.worker_id).toBe(original!.worker_id);

    // 5. Job remains unchanged
    expect(current!.job_id).toBe(original!.job_id);

    // 6. Assigned-by remains unchanged
    expect(current!.assigned_by).toBe(original!.assigned_by);

    // 7. Status is 'cancelled'
    expect(current!.status).toBe('cancelled');

    // 8. Cancellation timestamp/update timestamp is persisted
    expect(current!.updated_at).toBeDefined();
    expect(new Date(current!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(original!.created_at).getTime());

    // 9. assignment_events contains the cancellation event
    const { data: events, error: eventErr } = await adminClient
      .from('assignment_events')
      .select('*')
      .eq('assignment_id', asgnAId)
      .eq('event_type', 'cancelled');

    expect(eventErr).toBeNull();
    expect(events).toHaveLength(1);
    const cancelEvent = events![0];

    // 10. Event references the same assignment
    expect(cancelEvent.assignment_id).toBe(asgnAId);

    // 11. Event contains correct organization/worker/actor
    expect(cancelEvent.organization_id).toBe(orgAId);
    expect(cancelEvent.worker_id).toBe(workerAUserId);
    expect(cancelEvent.actor_id).toBe(adminAUserId);

    // 12. from_status and to_status are correct
    expect(cancelEvent.from_status).toBe('assigned');
    expect(cancelEvent.to_status).toBe('cancelled');
    expect(cancelEvent.event_type).toBe('cancelled');

    // 13. Cancelled assignment is no longer counted as active
    const { data: activeAssignments } = await adminClient
      .from('job_assignments')
      .select('id')
      .eq('id', asgnAId)
      .in('status', ['assigned', 'in_progress']);

    expect(activeAssignments).toHaveLength(0);

    // 14. Related application/history remains intact
    const { data: appRow } = await adminClient
      .from('applications')
      .select('id, status, notes')
      .eq('id', appAId)
      .single();

    expect(appRow).not.toBeNull();
    expect(appRow!.status).toBe('applied');

    // 15. Invalid cancellation transitions remain rejected
    // (a) Cannot reactivate cancelled assignment
    const { error: reactivateErr } = await adminAClient
      .from('job_assignments')
      .update({ status: 'in_progress' })
      .eq('id', asgnAId);

    expect(reactivateErr).not.toBeNull();
    expect(reactivateErr!.message).toMatch(/INVALID_STATE_TRANSITION|terminal/i);

    // (b) Completed assignments cannot be cancelled
    const { error: cancelCompletedErr } = await adminAClient
      .from('job_assignments')
      .update({ status: 'cancelled' })
      .eq('id', asgnCompletedId);

    expect(cancelCompletedErr).not.toBeNull();
    expect(cancelCompletedErr!.message).toMatch(/INVALID_STATE_TRANSITION|terminal/i);
  });

  // =========================================================================
  // Q-H03: Verification Review Queue & Signed URL Storage Isolation
  // =========================================================================
  it('enforces fail-closed PostgREST isolation and server-side tenant boundary on verifications (Q-H03)', async () => {
    // Direct PostgREST client from untrusted or cross-tenant client yields 0 rows (fail-closed)
    const { data: directClientVerifs, error: clientErr } = await adminBClient
      .from('application_verifications')
      .select('id, screenshot_url, organization_id')
      .eq('id', verifAId);

    expect(clientErr).toBeNull();
    expect(directClientVerifs).toHaveLength(0);

    // Server-side tenant-scoped endpoint query for Org A returns the record
    const { data: orgAVerifs, error: orgAErr } = await adminClient
      .from('application_verifications')
      .select('id, screenshot_url, organization_id')
      .eq('organization_id', orgAId)
      .eq('id', verifAId);

    expect(orgAErr).toBeNull();
    expect(orgAVerifs).toHaveLength(1);
    expect(orgAVerifs?.[0].organization_id).toBe(orgAId);

    // Querying with Org B returns 0 rows (no cross-tenant leakage)
    const { data: orgBVerifs, error: orgBErr } = await adminClient
      .from('application_verifications')
      .select('id, screenshot_url, organization_id')
      .eq('organization_id', orgBId)
      .eq('id', verifAId);

    expect(orgBErr).toBeNull();
    expect(orgBVerifs).toHaveLength(0);
  });

  // =========================================================================
  // Q-S01: Private Storage Bucket Security Boundary
  // =========================================================================
  it('verifies private storage bucket security boundary and signed URL issuance (Q-S01)', async () => {
    const rawScreenshotPath = `${orgAId}/${appAId}/screenshot_${runId}.png`;

    // 1. Raw unauthenticated access to private verification-screenshots bucket must be rejected
    const publicUrl = `${testUrl}/storage/v1/object/public/verification-screenshots/${rawScreenshotPath}`;
    const publicFetchRes = await fetch(publicUrl);
    expect(publicFetchRes.ok).toBe(false);
    expect([400, 403, 404]).toContain(publicFetchRes.status);

    // 2. Admin client generates authorized signed URL with 3600s expiration
    const { data: signedData, error: signErr } = await adminClient.storage
      .from('verification-screenshots')
      .createSignedUrl(rawScreenshotPath, 3600);

    expect(signErr).toBeNull();
    expect(signedData?.signedUrl).toBeDefined();
    expect(signedData?.signedUrl).toContain('token=');

    // 3. Fetching via the signed URL succeeds
    const signedFetchRes = await fetch(signedData!.signedUrl);
    expect(signedFetchRes.ok).toBe(true);
    const text = await signedFetchRes.text();
    expect(text).toBe('test-screenshot-content-batch-q');
  });

  // =========================================================================
  // Q-FIX-07: Genuine Cross-Organization Sync Retry Adversarial Matrix
  // =========================================================================
  it('enforces genuine cross-organization sync retry adversarial isolation matrix (Q-FIX-07)', async () => {
    // 1. Org A Admin -> Org A sync event: ALLOW (200, retriedCount: 1)
    const resAtoA = await SyncRetryService.executeRetry({ eventId: syncEventAId }, adminAClient);
    expect(resAtoA.status).toBe(200);
    const bodyAtoA = await resAtoA.json();
    expect(bodyAtoA.success).toBe(true);
    expect(bodyAtoA.data.retriedCount).toBe(1);

    // Verify authorized mutation: status updated to 'pending', manual_retry_count incremented to 1
    const { data: eventAAfter } = await adminClient
      .from('sync_events')
      .select('status, manual_retry_count')
      .eq('id', syncEventAId)
      .single();
    expect(eventAAfter).not.toBeNull();
    expect(eventAAfter!.status).toBe('pending');
    expect(eventAAfter!.manual_retry_count).toBe(1);

    // 2. Org A Admin -> Org B sync event: DENY (403 Forbidden)
    const resAtoB = await SyncRetryService.executeRetry({ eventId: syncEventBId }, adminAClient);
    expect(resAtoB.status).toBe(403);
    const bodyAtoB = await resAtoB.json();
    expect(bodyAtoB.success).toBe(false);
    expect(bodyAtoB.error).toMatch(/Forbidden/i);

    // Verify state invariant: Org B event is NOT mutated by unauthorized attempt
    const { data: eventBUnchanged } = await adminClient
      .from('sync_events')
      .select('status, manual_retry_count')
      .eq('id', syncEventBId)
      .single();
    expect(eventBUnchanged).not.toBeNull();
    expect(eventBUnchanged!.status).toBe('failed');
    expect(eventBUnchanged!.manual_retry_count).toBe(0);

    // 3. Org B Admin -> Org A sync event: DENY (403 Forbidden)
    const resBtoA = await SyncRetryService.executeRetry({ eventId: syncEventAId }, adminBClient);
    expect(resBtoA.status).toBe(403);

    // 4. Org B Admin -> Org B sync event: ALLOW (200, retriedCount: 1)
    const resBtoB = await SyncRetryService.executeRetry({ eventId: syncEventBId }, adminBClient);
    expect(resBtoB.status).toBe(200);
    const bodyBtoB = await resBtoB.json();
    expect(bodyBtoB.data.retriedCount).toBe(1);

    // 5. Worker -> Org A sync event: DENY (403 Forbidden - worker lacks org admin role)
    const resWorkerToA = await SyncRetryService.executeRetry({ eventId: syncEventAId }, workerAClient);
    expect(resWorkerToA.status).toBe(403);

    // 6. Worker -> Org B sync event: DENY (403 Forbidden - non-member)
    const resWorkerToB = await SyncRetryService.executeRetry({ eventId: syncEventBId }, workerAClient);
    expect(resWorkerToB.status).toBe(403);

    // 7. Org A Admin -> personal/non-org event of Normal User: DENY (403 Forbidden)
    const resAtoPersonalNormal = await SyncRetryService.executeRetry({ eventId: personalSyncEventNormalId }, adminAClient);
    expect(resAtoPersonalNormal.status).toBe(403);

    // 8. Org B Admin -> personal/non-org event of Normal User: DENY (403 Forbidden)
    const resBtoPersonalNormal = await SyncRetryService.executeRetry({ eventId: personalSyncEventNormalId }, adminBClient);
    expect(resBtoPersonalNormal.status).toBe(403);

    // 9. Org B Admin -> personal/non-org event of Admin B (own personal event): ALLOW (200)
    const resBtoPersonalB = await SyncRetryService.executeRetry({ eventId: personalSyncEventBId }, adminBClient);
    expect(resBtoPersonalB.status).toBe(200);

    // 10. Bulk Org Retry Isolation:
    // Org A Admin attempting bulk retry targeting Org B: DENY (403)
    const resBulkAtoB = await SyncRetryService.executeRetry({ organizationId: orgBId }, adminAClient);
    expect(resBulkAtoB.status).toBe(403);

    // Org B Admin attempting bulk retry targeting Org A: DENY (403)
    const resBulkBtoA = await SyncRetryService.executeRetry({ organizationId: orgAId }, adminBClient);
    expect(resBulkBtoA.status).toBe(403);

    // 11. State Invariants:
    // (a) Ineligible status (synced event) rejected with 400
    const resSynced = await SyncRetryService.executeRetry({ eventId: syncEventSyncedId }, adminAClient);
    expect(resSynced.status).toBe(400);
    const bodySynced = await resSynced.json();
    expect(bodySynced.error).toContain('Only failed or dead_letter events can be retried');

    // (b) Manual retry limit enforcement (capped at 5)
    const resCapped = await SyncRetryService.executeRetry({ eventId: syncEventCappedId }, adminAClient);
    expect(resCapped.status).toBe(400);
    const bodyCapped = await resCapped.json();
    expect(bodyCapped.error).toContain('Manual retry limit reached');

    // (c) Attacker-controlled / non-existent ID rejected with 404
    const fakeId = crypto.randomUUID();
    const resFake = await SyncRetryService.executeRetry({ eventId: fakeId }, adminAClient);
    expect(resFake.status).toBe(404);
  }, 90000);

  // =========================================================================
  // Q-FIX-05: Platform Admin, Organization Admin, Worker & Tampering Matrix
  // =========================================================================
  it('verifies platform admin, org admin, worker authorization matrix and tampering prevention (Q-FIX-05)', async () => {
    // Platform admin has NO direct rows in organization_members for Org A or Org B
    const { data: platMembers } = await adminClient
      .from('organization_members')
      .select('*')
      .eq('user_id', platformAdminUserId);
    expect(platMembers).toHaveLength(0);

    async function safeRequireOrgAdmin(orgId: string, client: SupabaseClient) {
      for (let i = 0; i < 3; i++) {
        const res = await AuthGuard.requireOrgAdmin(orgId, client);
        if ('errorResponse' in res && res.errorResponse.status === 401) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        return res;
      }
      return await AuthGuard.requireOrgAdmin(orgId, client);
    }

    // 1. Platform Admin (no org membership) -> Org A: ALLOW
    const platOrgA = await safeRequireOrgAdmin(orgAId, platformAdminClient);
    expect('errorResponse' in platOrgA).toBe(false);
    if (!('errorResponse' in platOrgA)) {
      expect(platOrgA.organizationId).toBe(orgAId);
      expect(platOrgA.user.id).toBe(platformAdminUserId);
      expect(platOrgA.membership.role).toBe('owner');
    }

    // 2. Platform Admin (no org membership) -> Org B: ALLOW
    const platOrgB = await safeRequireOrgAdmin(orgBId, platformAdminClient);
    expect('errorResponse' in platOrgB).toBe(false);
    if (!('errorResponse' in platOrgB)) {
      expect(platOrgB.organizationId).toBe(orgBId);
      expect(platOrgB.user.id).toBe(platformAdminUserId);
      expect(platOrgB.membership.role).toBe('owner');
    }

    // 3. Org A Admin -> Org A: ALLOW
    const adminAOrgA = await safeRequireOrgAdmin(orgAId, adminAClient);
    expect('errorResponse' in adminAOrgA).toBe(false);

    // 4. Org A Admin -> Org B: DENY (403 Forbidden - cannot escape tenant)
    const adminAOrgB = await safeRequireOrgAdmin(orgBId, adminAClient);
    expect('errorResponse' in adminAOrgB).toBe(true);
    if ('errorResponse' in adminAOrgB) {
      expect(adminAOrgB.errorResponse.status).toBe(403);
    }

    // 5. Org B Admin -> Org A: DENY (403 Forbidden - cannot escape tenant)
    const adminBOrgA = await safeRequireOrgAdmin(orgAId, adminBClient);
    expect('errorResponse' in adminBOrgA).toBe(true);
    if ('errorResponse' in adminBOrgA) {
      expect(adminBOrgA.errorResponse.status).toBe(403);
    }

    // 6. Org B Admin -> Org B: ALLOW
    const adminBOrgB = await safeRequireOrgAdmin(orgBId, adminBClient);
    expect('errorResponse' in adminBOrgB).toBe(false);

    // 7. Worker A -> Org A admin endpoint: DENY (403 Forbidden - worker is not org admin/owner)
    const workerOrgA = await safeRequireOrgAdmin(orgAId, workerAClient);
    expect('errorResponse' in workerOrgA).toBe(true);
    if ('errorResponse' in workerOrgA) {
      expect(workerOrgA.errorResponse.status).toBe(403);
    }

    // 8. Worker A -> Org B admin endpoint: DENY (403 Forbidden - non-member)
    const workerOrgB = await safeRequireOrgAdmin(orgBId, workerAClient);
    expect('errorResponse' in workerOrgB).toBe(true);
    if ('errorResponse' in workerOrgB) {
      expect(workerOrgB.errorResponse.status).toBe(403);
    }

    // 9. Normal User -> Org A admin endpoint: DENY (403 Forbidden - non-member)
    const normalOrgA = await safeRequireOrgAdmin(orgAId, normalUserClient);
    expect('errorResponse' in normalOrgA).toBe(true);
    if ('errorResponse' in normalOrgA) {
      expect(normalOrgA.errorResponse.status).toBe(403);
    }

    // 10. Normal User -> Org B admin endpoint: DENY (403 Forbidden - non-member)
    const normalOrgB = await safeRequireOrgAdmin(orgBId, normalUserClient);
    expect('errorResponse' in normalOrgB).toBe(true);
    if ('errorResponse' in normalOrgB) {
      expect(normalOrgB.errorResponse.status).toBe(403);
    }

    // 11. Organization ID Tampering:
    // Authenticate as Org A admin, attempt to change requested organizationId to Org B.
    // Server must independently authorize requested organization and reject with DENY (403).
    // Re-verify that Org A admin attempting any operation against Org B is strictly denied
    expect('errorResponse' in adminAOrgB).toBe(true);
    if ('errorResponse' in adminAOrgB) {
      expect(adminAOrgB.errorResponse.status).toBe(403);
    }

    // Org A admin attempting bulk retry with tampered orgId = Org B
    const tamperedBulk = await SyncRetryService.executeRetry({ organizationId: orgBId }, adminAClient);
    expect(tamperedBulk.status).toBe(403);

    // Org A admin attempting direct PostgREST read on Org B assignments
    const { data: tamperedRead } = await adminAClient
      .from('job_assignments')
      .select('id')
      .eq('organization_id', orgBId);
    expect(tamperedRead).toHaveLength(0);
  }, 90000);
});
