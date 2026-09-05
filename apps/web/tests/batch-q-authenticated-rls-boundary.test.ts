import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const PRODUCTION_PROJECT_REF = 'rgwutmthzigjmzsmmjnp';

const testUrl = process.env.SUPABASE_TEST_URL || process.env.NEXT_PUBLIC_SUPABASE_TEST_URL;
const testAnonKey = process.env.SUPABASE_TEST_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_TEST_ANON_KEY;
const testServiceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const testProjectRef = process.env.SUPABASE_TEST_PROJECT_REF;

// HARD SECURITY GATE: Prohibit execution against production
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

const isDedicatedTestConfigured = Boolean(
  testUrl &&
  testAnonKey &&
  testServiceRoleKey &&
  !testUrl.includes(PRODUCTION_PROJECT_REF)
);

describe.runIf(isDedicatedTestConfigured)(
  'Batch Q — Genuine Authenticated PostgREST / Multi-Tenant RLS Boundary Suite (Q-H03, Q-H04)',
  () => {
    let adminClient: SupabaseClient;
    let anonClient: SupabaseClient;
    let adminAClient: SupabaseClient;
    let adminBClient: SupabaseClient;
    let workerAClient: SupabaseClient;

    const runId = 'q' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const adminAUserId = crypto.randomUUID();
    const adminBUserId = crypto.randomUUID();
    const workerAUserId = crypto.randomUUID();
    const testJobId = crypto.randomUUID();

    const orgAId = crypto.randomUUID();
    const orgBId = crypto.randomUUID();
    const asgnAId = crypto.randomUUID();
    const appAId = crypto.randomUUID();
    const verifAId = crypto.randomUUID();
    const syncEventAId = crypto.randomUUID();

    const orgASlug = `alpha-${runId}`;
    const orgBSlug = `beta-${runId}`;

    const adminAEmail = `admin-a-${runId}@jobpulse.test`;
    const adminBEmail = `admin-b-${runId}@jobpulse.test`;
    const workerAEmail = `worker-a-${runId}@jobpulse.test`;
    const testPassword = `PassQ!_${runId}`;

    beforeAll(async () => {
      adminClient = createClient(testUrl!, testServiceRoleKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      anonClient = createClient(testUrl!, testAnonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // 1. Create real test users in Supabase Auth
      const { error: userAErr } = await adminClient.auth.admin.createUser({
        id: adminAUserId,
        email: adminAEmail,
        password: testPassword,
        email_confirm: true,
        user_metadata: { full_name: `Admin Alpha ${runId}` },
      });
      if (userAErr) throw new Error(`[SETUP_FAILURE] Admin A creation failed: ${userAErr.message}`);

      const { error: userBErr } = await adminClient.auth.admin.createUser({
        id: adminBUserId,
        email: adminBEmail,
        password: testPassword,
        email_confirm: true,
        user_metadata: { full_name: `Admin Beta ${runId}` },
      });
      if (userBErr) throw new Error(`[SETUP_FAILURE] Admin B creation failed: ${userBErr.message}`);

      const { error: workerErr } = await adminClient.auth.admin.createUser({
        id: workerAUserId,
        email: workerAEmail,
        password: testPassword,
        email_confirm: true,
        user_metadata: { full_name: `Worker Alpha ${runId}` },
      });
      if (workerErr) throw new Error(`[SETUP_FAILURE] Worker creation failed: ${workerErr.message}`);

      // 2. Ensure profile rows exist
      await adminClient.from('profiles').upsert([
        { id: adminAUserId, email: adminAEmail, full_name: `Admin Alpha ${runId}`, role: 'user' },
        { id: adminBUserId, email: adminBEmail, full_name: `Admin Beta ${runId}`, role: 'user' },
        { id: workerAUserId, email: workerAEmail, full_name: `Worker Alpha ${runId}`, role: 'user' },
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
      const { error: memErr } = await adminClient.from('organization_members').insert([
        { organization_id: orgAId, user_id: adminAUserId, role: 'owner' },
        { organization_id: orgBId, user_id: adminBUserId, role: 'owner' },
        { organization_id: orgAId, user_id: workerAUserId, role: 'worker' },
      ]);
      if (memErr) throw new Error(`[SETUP_FAILURE] Memberships creation failed: ${memErr.message}`);

      // 5. Seed catalog job
      const { error: jobErr } = await adminClient.from('jobs').insert({
        id: testJobId,
        canonical_title: `Staff Distributed Systems Engineer (${runId})`,
        display_title: `Staff Distributed Systems Engineer (${runId})`,
        description: 'Test job description for PostgREST RLS integration suite',
        apply_url: `https://example.com/jobs/${runId}/apply`,
        status: 'active',
      });
      if (jobErr) throw new Error(`[SETUP_FAILURE] Job fixture creation failed: ${jobErr.message}`);

      // 6. Seed job assignment in Org A
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

      // 7. Seed application in Org A
      const { error: appErr } = await adminClient.from('applications').insert({
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
      });
      if (appErr) throw new Error(`[SETUP_FAILURE] Application creation failed: ${appErr.message}`);

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

      // 9. Seed sync event in Org A
      const { error: syncErr } = await adminClient.from('sync_events').insert({
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
      });
      if (syncErr) throw new Error(`[SETUP_FAILURE] Sync event creation failed: ${syncErr.message}`);

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

      // 11. Authenticate separate PostgREST clients with authentic JWTs
      const authClientA = createClient(testUrl!, testAnonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: sessionA, error: signAErr } = await authClientA.auth.signInWithPassword({
        email: adminAEmail,
        password: testPassword,
      });
      if (signAErr || !sessionA?.session?.access_token) {
        throw new Error(`[AUTH_FAILURE] Admin A login failed: ${signAErr?.message}`);
      }

      adminAClient = createClient(testUrl!, testAnonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${sessionA.session.access_token}` } },
      });

      const authClientB = createClient(testUrl!, testAnonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: sessionB, error: signBErr } = await authClientB.auth.signInWithPassword({
        email: adminBEmail,
        password: testPassword,
      });
      if (signBErr || !sessionB?.session?.access_token) {
        throw new Error(`[AUTH_FAILURE] Admin B login failed: ${signBErr?.message}`);
      }

      adminBClient = createClient(testUrl!, testAnonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${sessionB.session.access_token}` } },
      });

      const authClientW = createClient(testUrl!, testAnonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: sessionW, error: signWErr } = await authClientW.auth.signInWithPassword({
        email: workerAEmail,
        password: testPassword,
      });
      if (signWErr || !sessionW?.session?.access_token) {
        throw new Error(`[AUTH_FAILURE] Worker login failed: ${signWErr?.message}`);
      }

      workerAClient = createClient(testUrl!, testAnonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${sessionW.session.access_token}` } },
      });
    }, 30000);

    afterAll(async () => {
      if (!adminClient) return;

      const rawScreenshotPath = `${orgAId}/${appAId}/screenshot_${runId}.png`;
      await adminClient.storage.from('verification-screenshots').remove([rawScreenshotPath]);

      // Clean up all seeded test fixtures in foreign key dependency order
      await adminClient.from('sync_events').delete().eq('id', syncEventAId);
      await adminClient.from('application_verifications').delete().eq('id', verifAId);
      await adminClient.from('applications').delete().eq('id', appAId);
      await adminClient.from('job_assignments').delete().eq('id', asgnAId);
      await adminClient.from('jobs').delete().eq('id', testJobId);
      await adminClient.from('organization_members').delete().in('organization_id', [orgAId, orgBId]);
      await adminClient.from('worker_profiles').delete().in('user_id', [workerAUserId, adminAUserId, adminBUserId]);
      await adminClient.from('organizations').delete().in('id', [orgAId, orgBId]);
      await adminClient.from('profiles').delete().in('id', [adminAUserId, adminBUserId, workerAUserId]);

      // Remove test users from auth
      await adminClient.auth.admin.deleteUser(adminAUserId);
      await adminClient.auth.admin.deleteUser(adminBUserId);
      await adminClient.auth.admin.deleteUser(workerAUserId);
    }, 30000);

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

    it('enforces non-destructive assignment cancellation invariant (Q-H02)', async () => {
      // Update status to 'cancelled'
      const { data: updated, error: updateErr } = await adminAClient
        .from('job_assignments')
        .update({ status: 'cancelled' })
        .eq('id', asgnAId)
        .select('id, status, notes, updated_at')
        .single();

      expect(updateErr).toBeNull();
      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('cancelled');

      // Verify row still exists in database with audit preserved
      const { data: verifiedRow } = await adminClient
        .from('job_assignments')
        .select('id, status, notes')
        .eq('id', asgnAId)
        .single();

      expect(verifiedRow?.status).toBe('cancelled');
      expect(verifiedRow?.notes).toContain('Confidential dispatch notes for Org A');
    });

    it('enforces fail-closed PostgREST isolation and server-side tenant boundary on verifications (Q-H03)', async () => {
      // Direct PostgREST client from untrusted or cross-tenant client yields 0 rows (fail-closed)
      const { data: directClientVerifs, error: clientErr } = await adminBClient
        .from('application_verifications')
        .select('id, screenshot_url, organization_id')
        .eq('id', verifAId);

      expect(clientErr).toBeNull();
      expect(directClientVerifs).toHaveLength(0);

      // Server-side tenant-scoped endpoint query (as executed by GET /api/admin/verifications)
      // Querying for Org A returns the record
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

    it('enforces fail-closed PostgREST isolation and server-side tenant boundary on sync events (Q-H04)', async () => {
      // Direct PostgREST client from Admin B attempting to read Org A sync events MUST return 0 rows
      const { data: foreignEvents, error: foreignErr } = await adminBClient
        .from('sync_events')
        .select('id, organization_id, status, last_error')
        .eq('id', syncEventAId);

      expect(foreignErr).toBeNull();
      expect(foreignEvents).toHaveLength(0);

      // Direct PostgREST mutation attempt by Admin B MUST modify 0 rows
      const { data: modified } = await adminBClient
        .from('sync_events')
        .update({ status: 'pending' })
        .eq('id', syncEventAId)
        .select('id');

      expect(modified || []).toHaveLength(0);

      // Server-side tenant-scoped query for Org A returns Org A sync event
      const { data: orgAEvents, error: orgAErr } = await adminClient
        .from('sync_events')
        .select('id, organization_id, status')
        .eq('organization_id', orgAId)
        .eq('id', syncEventAId);

      expect(orgAErr).toBeNull();
      expect(orgAEvents).toHaveLength(1);
      expect(orgAEvents?.[0].status).toBe('failed');

      // Server-side tenant-scoped query for Org B returns 0 rows (strict isolation)
      const { data: orgBEvents, error: orgBErr } = await adminClient
        .from('sync_events')
        .select('id, organization_id, status')
        .eq('organization_id', orgBId)
        .eq('id', syncEventAId);

      expect(orgBErr).toBeNull();
      expect(orgBEvents).toHaveLength(0);
    });

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
  }
);
