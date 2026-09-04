import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getAdminWorkers } from '../app/api/admin/workers/route';
import {
  GET as getAdminAssignments,
  POST as dispatchAssignment,
  DELETE as cancelAssignment,
} from '../app/api/admin/assignments/route';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';

describe('Admin Workforce Operations API (Batch K)', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const adminId = 'admin_super';
  const workerId = '22222222-2222-2222-2222-222222222222';
  const jobId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/admin/workers', () => {
    it('returns worker profiles and assignment statistics for the organization', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === 'organization_id' && val === orgId) {
                  return {
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: 'm_admin', organization_id: orgId, user_id: adminId, role: 'admin' },
                        error: null,
                      }),
                    }),
                    then: (resolve: any) => resolve({
                      data: [
                        {
                          id: 'm_worker',
                          user_id: workerId,
                          role: 'worker',
                          created_at: '2026-09-01T00:00:00Z',
                          profiles: { email: 'worker@acme.com', full_name: 'Worker Bob' },
                        },
                      ],
                      error: null,
                    }),
                  };
                }
                return {} as any;
              }),
            };
          }
          if (table === 'worker_profiles') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      user_id: workerId,
                      cv_url: 'https://cv.pdf',
                      skills: ['Python', 'SQL'],
                      experience_years: 4,
                      availability: 'immediate',
                    },
                  ],
                  error: null,
                }),
              }),
            };
          }
          if (table === 'job_assignments') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    { worker_id: workerId, status: 'assigned' },
                    { worker_id: workerId, status: 'completed' },
                  ],
                  error: null,
                }),
              }),
            };
          }
          return {} as any;
        }),
      });

      const req = new NextRequest(`http://localhost/api/admin/workers?organizationId=${orgId}`);
      const response = await getAdminWorkers(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data[0].fullName).toBe('Worker Bob');
      expect(json.data[0].profile.skills).toEqual(['Python', 'SQL']);
      expect(json.data[0].assignmentStats.total).toBe(2);
      expect(json.data[0].assignmentStats.completed).toBe(1);
    });
  });

  describe('POST /api/admin/assignments', () => {
    it('dispatches a new job assignment to a worker in the organization', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
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
                    data: { id: 'm_admin', organization_id: orgId, user_id: adminId, role: 'admin' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'jobs') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: jobId }, error: null }),
                }),
              }),
            };
          }
          if (table === 'job_assignments') {
            return {
              upsert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'assignment_new',
                      organization_id: orgId,
                      job_id: jobId,
                      worker_id: workerId,
                      assigned_by: adminId,
                      status: 'assigned',
                    },
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
          organizationId: orgId,
          jobId,
          workerId,
          notes: 'High priority lead',
        }),
      });

      const response = await dispatchAssignment(req);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('assigned');
    });
  });
});
