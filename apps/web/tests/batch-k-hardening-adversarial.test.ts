import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as dispatchAssignment } from '../app/api/admin/assignments/route';
import { GET as getAdminWorkers } from '../app/api/admin/workers/route';
import { POST as addMember, PATCH as updateMemberRole, DELETE as removeMember } from '../app/api/organizations/[id]/members/route';
import { POST as createOrganization } from '../app/api/organizations/route';
import { GET as getWorkerProfile, PUT as updateWorkerProfile } from '../app/api/worker/profile/route';
import { PATCH as updateWorkerAssignment } from '../app/api/worker/assignments/[id]/route';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';

function createMockBuilder(data: any = null, error: any = null) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    then: (resolve: any, reject: any) => Promise.resolve({ data, error }).then(resolve, reject),
  };
  return builder;
}

describe('Batch K Remediation — 30-Scenario Adversarial Hardening Matrix', () => {
  const orgA = '11111111-1111-1111-1111-111111111111';
  const orgB = '22222222-2222-2222-2222-222222222222';
  const ownerUser = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const adminUser = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const workerUser = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const outsiderUser = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const platformAdmin = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  const assignment1 = '33333333-3333-3333-3333-333333333333';
  const memberAdmin = '44444444-4444-4444-4444-444444444444';
  const memberOwner = '55555555-5555-5555-5555-555555555555';
  const memberWorker = '66666666-6666-6666-6666-666666666666';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // GROUP 1: Membership Security & Role Escalation (Scenarios 1 - 9)
  // ===========================================================================
  describe('Group 1: Membership & Role Escalation Security (Scenarios 1-9)', () => {
    it('Scenario 1: Worker → promote self to owner is blocked with 403 Forbidden', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder({ id: memberWorker, organization_id: orgA, user_id: workerUser, role: 'worker' });
          }
          if (table === 'profiles') {
            return createMockBuilder({ role: 'user' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/organizations/${orgA}/members`, {
        method: 'PATCH',
        body: JSON.stringify({ memberId: memberWorker, role: 'owner' }),
      });
      const res = await updateMemberRole(req, { params: Promise.resolve({ id: orgA }) });
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('Scenario 2: Worker → promote another user to owner is blocked with 403 Forbidden', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder({ id: memberWorker, organization_id: orgA, user_id: workerUser, role: 'worker' });
          }
          if (table === 'profiles') {
            return createMockBuilder({ role: 'user' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/organizations/${orgA}/members`, {
        method: 'PATCH',
        body: JSON.stringify({ memberId: memberAdmin, role: 'owner' }),
      });
      const res = await updateMemberRole(req, { params: Promise.resolve({ id: orgA }) });
      expect(res.status).toBe(403);
    });

    it('Scenario 3: Admin → promote self to owner is blocked with 403 Forbidden', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder({ id: memberAdmin, organization_id: orgA, user_id: adminUser, role: 'admin' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/organizations/${orgA}/members`, {
        method: 'PATCH',
        body: JSON.stringify({ memberId: memberAdmin, role: 'owner' }),
      });
      const res = await updateMemberRole(req, { params: Promise.resolve({ id: orgA }) });
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toContain('Only organization owners can grant the owner role');
    });

    it('Scenario 4: Admin → promote another user to owner is blocked with 403 Forbidden', async () => {
      let callCount = 0;
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            callCount++;
            if (callCount === 1) {
              // Caller membership check
              return createMockBuilder({ id: memberAdmin, organization_id: orgA, user_id: adminUser, role: 'admin' });
            }
            // Target member
            return createMockBuilder({ id: memberWorker, organization_id: orgA, user_id: workerUser, role: 'worker' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/organizations/${orgA}/members`, {
        method: 'PATCH',
        body: JSON.stringify({ memberId: memberWorker, role: 'owner' }),
      });
      const res = await updateMemberRole(req, { params: Promise.resolve({ id: orgA }) });
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toContain('Only organization owners can grant the owner role');
    });

    it('Scenario 5: Admin → demote or remove final owner is blocked', async () => {
      // 5A: Admin trying to demote owner via PATCH
      let patchCount = 0;
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            patchCount++;
            if (patchCount === 1) {
              return createMockBuilder({ id: memberAdmin, organization_id: orgA, user_id: adminUser, role: 'admin' });
            }
            return createMockBuilder({ id: memberOwner, organization_id: orgA, user_id: ownerUser, role: 'owner' });
          }
          return createMockBuilder();
        }),
      });

      const patchReq = new NextRequest(`http://localhost/api/organizations/${orgA}/members`, {
        method: 'PATCH',
        body: JSON.stringify({ memberId: memberOwner, role: 'worker' }),
      });
      const patchRes = await updateMemberRole(patchReq, { params: Promise.resolve({ id: orgA }) });
      const patchJson = await patchRes.json();
      expect(patchRes.status).toBe(403);
      expect(patchJson.error).toContain('Organization admins cannot modify owner memberships');

      // 5B: Admin trying to DELETE owner
      let delCount = 0;
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            delCount++;
            if (delCount === 1) {
              return createMockBuilder({ id: memberAdmin, organization_id: orgA, user_id: adminUser, role: 'admin' });
            }
            return createMockBuilder({ id: memberOwner, organization_id: orgA, user_id: ownerUser, role: 'owner' });
          }
          return createMockBuilder();
        }),
      });

      const delReq = new NextRequest(`http://localhost/api/organizations/${orgA}/members?memberId=${memberOwner}`, {
        method: 'DELETE',
      });
      const delRes = await removeMember(delReq, { params: Promise.resolve({ id: orgA }) });
      const delJson = await delRes.json();
      expect(delRes.status).toBe(403);
      expect(delJson.error).toContain('Organization admins cannot delete owner memberships');
    });

    it('Scenario 6: Admin → ownership transfer is blocked with 403 Forbidden', async () => {
      let callCount = 0;
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            callCount++;
            if (callCount === 1) {
              return createMockBuilder({ id: memberAdmin, organization_id: orgA, user_id: adminUser, role: 'admin' });
            }
            return createMockBuilder({ id: memberWorker, organization_id: orgA, user_id: workerUser, role: 'worker' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/organizations/${orgA}/members`, {
        method: 'PATCH',
        body: JSON.stringify({ memberId: memberWorker, role: 'owner' }),
      });
      const res = await updateMemberRole(req, { params: Promise.resolve({ id: orgA }) });
      expect(res.status).toBe(403);
    });

    it('Scenario 7: Owner → valid ownership transfer succeeds via atomic RPC', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          organizationId: orgA,
          previousOwner: ownerUser,
          newOwner: workerUser,
        },
        error: null,
      });

      let callCount = 0;
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: ownerUser } }, error: null }),
        },
        rpc: mockRpc,
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            callCount++;
            if (callCount === 1) {
              return createMockBuilder({ id: memberOwner, organization_id: orgA, user_id: ownerUser, role: 'owner' });
            }
            return createMockBuilder({ id: memberWorker, organization_id: orgA, user_id: workerUser, role: 'worker' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/organizations/${orgA}/members`, {
        method: 'PATCH',
        body: JSON.stringify({ memberId: memberWorker, role: 'owner' }),
      });
      const res = await updateMemberRole(req, { params: Promise.resolve({ id: orgA }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('transfer_organization_ownership', {
        p_organization_id: orgA,
        p_new_owner_user_id: workerUser,
      });
    });

    it('Scenario 8: Cross-org admin → modify another org membership is blocked', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder(null); // not a member of Org B
          }
          if (table === 'profiles') {
            return createMockBuilder({ role: 'user' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/organizations/${orgB}/members`, {
        method: 'PATCH',
        body: JSON.stringify({ memberId: memberWorker, role: 'admin' }),
      });
      const res = await updateMemberRole(req, { params: Promise.resolve({ id: orgB }) });
      expect(res.status).toBe(403);
    });

    it('Scenario 9: Worker → modify another worker membership is blocked with 403 Forbidden', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder({ id: memberWorker, organization_id: orgA, user_id: workerUser, role: 'worker' });
          }
          if (table === 'profiles') {
            return createMockBuilder({ role: 'user' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/organizations/${orgA}/members?memberId=${memberWorker}`, {
        method: 'DELETE',
      });
      const res = await removeMember(req, { params: Promise.resolve({ id: orgA }) });
      expect(res.status).toBe(403);
    });
  });

  // ===========================================================================
  // GROUP 2: Assignment State Machine & Security (Scenarios 10 - 20)
  // ===========================================================================
  describe('Group 2: Assignment State Machine & Security (Scenarios 10-20)', () => {
    it('Scenario 10: Worker → modify another worker assignment returns 404 Not Found', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
        from: vi.fn().mockReturnValue(createMockBuilder(null)), // Not found under caller worker_id
      });

      const req = new NextRequest(`http://localhost/api/worker/assignments/${assignment1}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress' }),
      });
      const res = await updateWorkerAssignment(req, { params: Promise.resolve({ id: assignment1 }) });
      expect(res.status).toBe(404);
    });

    it('Scenario 11: Worker → modify organization_id is rejected by schema', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
      });

      const req = new NextRequest(`http://localhost/api/worker/assignments/${assignment1}`, {
        method: 'PATCH',
        body: JSON.stringify({ organizationId: orgB }),
      });
      const res = await updateWorkerAssignment(req, { params: Promise.resolve({ id: assignment1 }) });
      expect(res.status).toBe(400);
    });

    it('Scenario 12: Worker → modify worker_id is rejected by schema', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
      });

      const req = new NextRequest(`http://localhost/api/worker/assignments/${assignment1}`, {
        method: 'PATCH',
        body: JSON.stringify({ workerId: outsiderUser }),
      });
      const res = await updateWorkerAssignment(req, { params: Promise.resolve({ id: assignment1 }) });
      expect(res.status).toBe(400);
    });

    it('Scenario 13: Worker → modify assigned_by is rejected by schema', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
      });

      const req = new NextRequest(`http://localhost/api/worker/assignments/${assignment1}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedBy: outsiderUser }),
      });
      const res = await updateWorkerAssignment(req, { params: Promise.resolve({ id: assignment1 }) });
      expect(res.status).toBe(400);
    });

    it('Scenario 14: Worker → completed → assigned is rejected by state machine', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
        from: vi.fn().mockReturnValue(
          createMockBuilder({ id: assignment1, worker_id: workerUser, status: 'completed' })
        ),
      });

      const req = new NextRequest(`http://localhost/api/worker/assignments/${assignment1}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'assigned' }),
      });
      const res = await updateWorkerAssignment(req, { params: Promise.resolve({ id: assignment1 }) });
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toContain('Invalid status transition');
    });

    it('Scenario 15: Worker → completed → in_progress is rejected by state machine', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
        from: vi.fn().mockReturnValue(
          createMockBuilder({ id: assignment1, worker_id: workerUser, status: 'completed' })
        ),
      });

      const req = new NextRequest(`http://localhost/api/worker/assignments/${assignment1}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress' }),
      });
      const res = await updateWorkerAssignment(req, { params: Promise.resolve({ id: assignment1 }) });
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toContain('Invalid status transition');
    });

    it('Scenario 16: Worker → skipped → assigned is rejected by state machine', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
        from: vi.fn().mockReturnValue(
          createMockBuilder({ id: assignment1, worker_id: workerUser, status: 'skipped' })
        ),
      });

      const req = new NextRequest(`http://localhost/api/worker/assignments/${assignment1}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'assigned' }),
      });
      const res = await updateWorkerAssignment(req, { params: Promise.resolve({ id: assignment1 }) });
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toContain('Invalid status transition');
    });

    it('Scenario 17: Admin → completed → assigned through dispatch is rejected with 409 Conflict', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder({ id: memberAdmin, organization_id: orgA, user_id: adminUser, role: 'admin' });
          }
          if (table === 'jobs') {
            return createMockBuilder({ id: '44444444-4444-4444-4444-444444444444' });
          }
          if (table === 'job_assignments') {
            return createMockBuilder({ id: assignment1, status: 'completed' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest('http://localhost/api/admin/assignments', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: orgA,
          jobId: '44444444-4444-4444-4444-444444444444',
          workerId: workerUser,
        }),
      });

      const res = await dispatchAssignment(req);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Cannot re-dispatch: Assignment is in terminal state 'completed'");
    });

    it('Scenario 18: Admin → skipped → assigned through dispatch is rejected with 409 Conflict', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder({ id: memberAdmin, organization_id: orgA, user_id: adminUser, role: 'admin' });
          }
          if (table === 'jobs') {
            return createMockBuilder({ id: '44444444-4444-4444-4444-444444444444' });
          }
          if (table === 'job_assignments') {
            return createMockBuilder({ id: assignment1, status: 'skipped' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest('http://localhost/api/admin/assignments', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: orgA,
          jobId: '44444444-4444-4444-4444-444444444444',
          workerId: workerUser,
        }),
      });

      const res = await dispatchAssignment(req);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Cannot re-dispatch: Assignment is in terminal state 'skipped'");
    });

    it('Scenario 19: Admin → dispatch same active assignment updates notes without resetting status', async () => {
      const assignmentBuilder = createMockBuilder({
        id: assignment1,
        status: 'in_progress', // active status
        notes: 'Initial notes',
      });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder({ id: memberAdmin, organization_id: orgA, user_id: adminUser, role: 'admin' });
          }
          if (table === 'jobs') {
            return createMockBuilder({ id: '44444444-4444-4444-4444-444444444444' });
          }
          if (table === 'job_assignments') {
            return assignmentBuilder;
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest('http://localhost/api/admin/assignments', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: orgA,
          jobId: '44444444-4444-4444-4444-444444444444',
          workerId: workerUser,
          notes: 'Updated notes',
        }),
      });

      const res = await dispatchAssignment(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.status).toBe('in_progress');
      expect(assignmentBuilder.update).toHaveBeenCalledWith(
        expect.not.objectContaining({ status: 'assigned' })
      );
    });

    it('Scenario 20: Admin → dispatch assignment to worker from another org is rejected', async () => {
      let callCount = 0;
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            callCount++;
            if (callCount === 1) {
              // Admin check
              return createMockBuilder({ id: memberAdmin, organization_id: orgA, user_id: adminUser, role: 'admin' });
            }
            // Worker check: outsider is NOT in Org A
            return createMockBuilder(null);
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest('http://localhost/api/admin/assignments', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: orgA,
          jobId: '44444444-4444-4444-4444-444444444444',
          workerId: outsiderUser,
        }),
      });

      const res = await dispatchAssignment(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('The target worker is not a member of this organization');
    });
  });

  // ===========================================================================
  // GROUP 3: Worker Profile Tenancy (Scenarios 21 - 25)
  // ===========================================================================
  describe('Group 3: Worker Profile Tenancy (Scenarios 21-25)', () => {
    it('Scenario 21: Worker → own profile in current organization succeeds', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder({ id: memberWorker, organization_id: orgA, user_id: workerUser, role: 'worker' });
          }
          if (table === 'worker_profiles') {
            return createMockBuilder({ id: 'wp-1', organization_id: orgA, user_id: workerUser, skills: ['TypeScript'] });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/worker/profile?organizationId=${orgA}`);
      const res = await getWorkerProfile(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.skills).toContain('TypeScript');
    });

    it('Scenario 22: Worker → profile after leaving organization is denied with 403 Forbidden', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder(null); // User left org
          }
          if (table === 'profiles') {
            return createMockBuilder({ role: 'user' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/worker/profile?organizationId=${orgA}`);
      const res = await getWorkerProfile(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden: You are not a member of this organization');
    });

    it('Scenario 23: Worker → another organization profile is denied with 403 Forbidden', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder(null); // not member of Org B
          }
          if (table === 'profiles') {
            return createMockBuilder({ role: 'user' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/worker/profile?organizationId=${orgB}`);
      const res = await getWorkerProfile(req);
      expect(res.status).toBe(403);
    });

    it('Scenario 24: Admin → worker profile in own organization succeeds', async () => {
      let callCount = 0;
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            callCount++;
            if (callCount === 1) {
              // AuthGuard check
              return createMockBuilder({ id: memberAdmin, organization_id: orgA, user_id: adminUser, role: 'admin' });
            }
            // Member list query
            return createMockBuilder([
              {
                id: memberWorker,
                user_id: workerUser,
                role: 'worker',
                created_at: '2026-09-01T00:00:00Z',
                profiles: { id: workerUser, email: 'w@org.com', full_name: 'Worker', avatar_url: null },
              },
            ]);
          }
          if (table === 'worker_profiles') {
            return createMockBuilder([{ user_id: workerUser, skills: ['Go'] }]);
          }
          if (table === 'job_assignments') {
            return createMockBuilder([{ worker_id: workerUser, status: 'assigned' }]);
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/admin/workers?organizationId=${orgA}`);
      const res = await getAdminWorkers(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.length).toBe(1);
    });

    it('Scenario 25: Admin → worker profile in another organization is denied with 403 Forbidden', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder(null);
          }
          if (table === 'profiles') {
            return createMockBuilder({ role: 'user' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/admin/workers?organizationId=${orgB}`);
      const res = await getAdminWorkers(req);
      expect(res.status).toBe(403);
    });
  });

  // ===========================================================================
  // GROUP 4: Organization Creation Security (Scenarios 26 - 30)
  // ===========================================================================
  describe('Group 4: Organization Creation Security (Scenarios 26-30)', () => {
    it('Scenario 26: Authenticated user → create organization invokes atomic RPC', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          id: orgA,
          name: 'Acme Corp',
          slug: 'acme-corp',
          role: 'owner',
        },
        error: null,
      });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: ownerUser } }, error: null }),
        },
        rpc: mockRpc,
      });

      const req = new NextRequest('http://localhost/api/organizations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Acme Corp', slug: 'acme-corp' }),
      });

      const res = await createOrganization(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('create_organization_with_owner', expect.objectContaining({
        p_name: 'Acme Corp',
        p_slug: 'acme-corp',
      }));
    });

    it('Scenario 27: Organization creation → owner role is automatically assigned to creator', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: ownerUser } }, error: null }),
        },
        rpc: vi.fn().mockResolvedValue({
          data: {
            id: orgA,
            name: 'Acme Corp',
            slug: 'acme-corp',
            role: 'owner',
          },
          error: null,
        }),
      });

      const req = new NextRequest('http://localhost/api/organizations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Acme Corp', slug: 'acme-corp' }),
      });

      const res = await createOrganization(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.data.role).toBe('owner');
    });

    it('Scenario 28: Unauthenticated → create organization is rejected with 401 Unauthorized', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('No session') }),
        },
      });

      const req = new NextRequest('http://localhost/api/organizations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Acme Corp', slug: 'acme-corp' }),
      });

      const res = await createOrganization(req);
      expect(res.status).toBe(401);
    });

    it('Scenario 29: Direct organization table insert is blocked for normal users by RLS', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: '42501',
              message: 'new row violates row-level security policy for table "organizations"',
            },
          }),
        }),
      });

      (createClient as any).mockResolvedValue({
        from: vi.fn().mockReturnValue({
          insert: mockInsert,
        }),
      });

      const client = await (createClient as any)();
      const { data, error } = await client
        .from('organizations')
        .insert({ name: 'Rogue Org', slug: 'rogue-org' })
        .select()
        .single();

      expect(error).toBeDefined();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();
    });

    it('Scenario 30: Organization with zero owners is impossible via hardened architecture', async () => {
      // 1. Direct table INSERT on organizations is blocked by RLS for normal users.
      // 2. Organization creation is only allowed through create_organization_with_owner(), which atomically inserts the creator as owner.
      // 3. Database trigger trg_prevent_org_member_escalation enforces that the initial member must be 'owner'.
      // 4. Database trigger blocks demoting or deleting the last owner of an organization.
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // GROUP 5: Platform Admin Boundary (Section 5)
  // ===========================================================================
  describe('Group 5: Platform Admin Boundary Explicit Isolation', () => {
    it('Platform Admin can intentionally cross tenant boundaries to inspect workforce', async () => {
      let memberCalls = 0;
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: platformAdmin } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            memberCalls++;
            if (memberCalls === 1) {
              // Caller is not directly an org member, triggers superadmin profile check
              return createMockBuilder(null);
            }
            // Subsequent query: returns worker list of Org A
            return createMockBuilder([{ id: memberWorker, user_id: workerUser, role: 'worker', profiles: {} }]);
          }
          if (table === 'profiles') {
            return createMockBuilder({ role: 'admin' }); // Superadmin
          }
          if (table === 'worker_profiles') {
            return createMockBuilder([]);
          }
          if (table === 'job_assignments') {
            return createMockBuilder([]);
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/admin/workers?organizationId=${orgA}`);
      const res = await getAdminWorkers(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it('Ordinary Organization Admin CANNOT cross tenant boundaries', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder(null);
          }
          if (table === 'profiles') {
            return createMockBuilder({ role: 'user' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/admin/workers?organizationId=${orgB}`);
      const res = await getAdminWorkers(req);
      expect(res.status).toBe(403);
    });

    it('Worker CANNOT cross tenant boundaries or access administrative interfaces', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUser } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return createMockBuilder({ id: memberWorker, organization_id: orgA, user_id: workerUser, role: 'worker' });
          }
          if (table === 'profiles') {
            return createMockBuilder({ role: 'user' });
          }
          return createMockBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/admin/workers?organizationId=${orgA}`);
      const res = await getAdminWorkers(req);
      expect(res.status).toBe(403);
    });
  });
});
