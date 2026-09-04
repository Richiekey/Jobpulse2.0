import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as dispatchAssignment } from '../app/api/admin/assignments/route';
import { GET as getAdminWorkers } from '../app/api/admin/workers/route';
import { PATCH as updateMemberRole } from '../app/api/organizations/[id]/members/route';
import { PATCH as updateWorkerAssignment } from '../app/api/worker/assignments/[id]/route';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';

describe('Workforce Multi-Tenant Security & Isolation (Batch K Adversarial Gate)', () => {
  const orgA = '11111111-1111-1111-1111-111111111111';
  const orgB = '22222222-2222-2222-2222-222222222222';
  const workerUser = '22222222-2222-2222-2222-222222222222';
  const otherWorkerAssignmentId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Adversarial Scenario 1: Worker attempts to dispatch job assignments', () => {
    it('rejects worker attempting to call admin assignment dispatch with 403 Forbidden', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUser } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'm1', organization_id: orgA, user_id: workerUser, role: 'worker' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
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

      const response = await dispatchAssignment(req);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });
  });

  describe('Adversarial Scenario 2: Worker attempts to elevate role to owner/admin', () => {
    it('rejects worker attempting to modify organization membership with 403 Forbidden', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUser } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'm1', organization_id: orgA, user_id: workerUser, role: 'worker' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        }),
      });

      const req = new NextRequest(`http://localhost/api/organizations/${orgA}/members`, {
        method: 'PATCH',
        body: JSON.stringify({
          memberId: '55555555-5555-5555-5555-555555555555',
          role: 'owner',
        }),
      });

      const response = await updateMemberRole(req, { params: Promise.resolve({ id: orgA }) });
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });
  });

  describe('Adversarial Scenario 3: Cross-tenant unauthorized access', () => {
    it('blocks user from accessing worker roster in an organization they do not belong to', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUser } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { role: 'user' }, error: null }),
              }),
            };
          }
          return {} as any;
        }),
      });

      const req = new NextRequest(`http://localhost/api/admin/workers?organizationId=${orgB}`);
      const response = await getAdminWorkers(req);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });
  });

  describe('Adversarial Scenario 4: Mutating other workers assignments', () => {
    it('rejects worker attempting to mutate another workers assignment record with 404 Not Found', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUser } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // Not found for this worker
            }),
          }),
        }),
      });

      const req = new NextRequest(`http://localhost/api/worker/assignments/${otherWorkerAssignmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress' }),
      });

      const response = await updateWorkerAssignment(req, {
        params: Promise.resolve({ id: otherWorkerAssignmentId }),
      });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });
  });
});
