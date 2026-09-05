import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getAdminWorkers } from '../app/api/admin/workers/route';
import {
  GET as getAdminAssignments,
  POST as dispatchAssignment,
  DELETE as cancelAssignment,
} from '../app/api/admin/assignments/route';
import {
  GET as getVerificationsQueue,
} from '../app/api/admin/verifications/route';
import {
  PATCH as reviewVerification,
} from '../app/api/applications/[id]/verify/route';
import {
  GET as getSyncStatus,
} from '../app/api/sync/status/route';
import {
  POST as retrySync,
} from '../app/api/sync/retry/route';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('../lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';
import { createAdminClient } from '../lib/supabase/admin';

describe('Batch Q — Employer & Admin Command Center Integration Suite', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const otherOrgId = '99999999-9999-9999-9999-999999999999';
  const adminId = 'admin_user_01';
  const superAdminId = 'super_admin_user_01';
  const workerId = '22222222-2222-2222-2222-222222222222';
  const jobId = '33333333-3333-3333-3333-333333333333';
  const appId = '44444444-4444-4444-4444-444444444444';
  const verifId = '55555555-5555-5555-5555-555555555555';
  const eventId = '66666666-6666-6666-6666-666666666666';

  const createQueryBuilder = (data: any = null) => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
      then: (resolve: any) => resolve({ data, error: null }),
    };
    return builder;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Pillar 1: Workforce Management Integration', () => {
    it('retrieves worker roster with assignments workload stats and profile details', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return createQueryBuilder({ id: adminId, role: 'user' });
          }
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
                    then: (resolve: any) =>
                      resolve({
                        data: [
                          {
                            id: 'm_worker',
                            user_id: workerId,
                            role: 'worker',
                            created_at: '2026-09-01T00:00:00Z',
                            profiles: {
                              email: 'worker@acme.com',
                              full_name: 'Jane Worker',
                              avatar_url: 'https://avatar.png',
                            },
                          },
                        ],
                        error: null,
                      }),
                  };
                }
                return createQueryBuilder();
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
                      skills: ['React', 'TypeScript', 'Node.js'],
                      experience_years: 5,
                      availability: 'immediate',
                      notes: 'Prefers remote roles',
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
                    { worker_id: workerId, status: 'in_progress' },
                    { worker_id: workerId, status: 'completed' },
                  ],
                  error: null,
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/admin/workers?organizationId=${orgId}`);
      const res = await getAdminWorkers(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);

      const worker = json.data[0];
      expect(worker.fullName).toBe('Jane Worker');
      expect(worker.profile.skills).toEqual(['React', 'TypeScript', 'Node.js']);
      expect(worker.profile.availability).toBe('immediate');
      expect(worker.assignmentStats.total).toBe(3);
      expect(worker.assignmentStats.assigned).toBe(1);
      expect(worker.assignmentStats.in_progress).toBe(1);
      expect(worker.assignmentStats.completed).toBe(1);
    });

    it('allows platform superadmin to access workforce roster without direct organization membership (Q-H01)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: superAdminId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return createQueryBuilder({ id: superAdminId, role: 'admin' });
          }
          if (table === 'organization_members') {
            const b: any = {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              then: (resolve: any) =>
                resolve({
                  data: [
                    {
                      id: 'm_worker',
                      user_id: workerId,
                      role: 'worker',
                      created_at: '2026-09-01T00:00:00Z',
                      profiles: {
                        email: 'worker@acme.com',
                        full_name: 'Jane Worker',
                        avatar_url: null,
                      },
                    },
                  ],
                  error: null,
                }),
            };
            return b;
          }
          if (table === 'worker_profiles') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            };
          }
          if (table === 'job_assignments') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/admin/workers?organizationId=${orgId}`);
      const res = await getAdminWorkers(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
    });

    it('rejects worker trying to access admin workers endpoint with 403 Forbidden', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return createQueryBuilder({ id: workerId, role: 'user' });
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'm_worker', organization_id: orgId, user_id: workerId, role: 'worker' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/admin/workers?organizationId=${orgId}`);
      const res = await getAdminWorkers(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toContain('Forbidden');
    });
  });

  describe('Pillar 2: Job Assignment Dispatcher Integration', () => {
    it('dispatches a new assignment with deadline and operational notes', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return createQueryBuilder({ id: adminId, role: 'user' });
          }
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
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'asgn_new_123',
                      organization_id: orgId,
                      job_id: jobId,
                      worker_id: workerId,
                      assigned_by: adminId,
                      status: 'assigned',
                      deadline_at: '2026-09-10T18:00:00.000Z',
                      notes: 'High priority lead for Stripe backend',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
      });

      const req = new NextRequest('http://localhost/api/admin/assignments', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: orgId,
          jobId,
          workerId,
          deadlineAt: '2026-09-10T18:00:00.000Z',
          notes: 'High priority lead for Stripe backend',
        }),
      });

      const res = await dispatchAssignment(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('assigned');
      expect(json.data.notes).toBe('High priority lead for Stripe backend');
    });

    it('cancels an active assignment non-destructively via status update to cancelled (Q-H02)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return createQueryBuilder({ id: adminId, role: 'user' });
          }
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
          if (table === 'job_assignments') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: 'asgn_new_123',
                        status: 'assigned',
                        organization_id: orgId,
                        worker_id: workerId,
                        job_id: jobId,
                        notes: 'Initial dispatch notes',
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: {
                          id: 'asgn_new_123',
                          status: 'cancelled',
                          organization_id: orgId,
                          worker_id: workerId,
                          job_id: jobId,
                          notes: 'Initial dispatch notes',
                          updated_at: '2026-09-05T12:00:00Z',
                        },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
      });

      const req = new NextRequest(
        `http://localhost/api/admin/assignments?assignmentId=asgn_new_123&organizationId=${orgId}`
      );
      const res = await cancelAssignment(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.cancelled).toBe(true);
      expect(json.data.assignment.status).toBe('cancelled');
      expect(json.data.assignment.id).toBe('asgn_new_123');
    });

    it('rejects cancelling an assignment that has reached completed terminal state (Q-H02)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return createQueryBuilder({ id: adminId, role: 'user' });
          }
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
          if (table === 'job_assignments') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: 'asgn_completed',
                        status: 'completed',
                        organization_id: orgId,
                        worker_id: workerId,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
      });

      const req = new NextRequest(
        `http://localhost/api/admin/assignments?assignmentId=asgn_completed&organizationId=${orgId}`
      );
      const res = await cancelAssignment(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('Cannot cancel a completed assignment');
    });

    it('safely rejects repeated cancellation with already cancelled error (Q-H02 idempotent guard)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return createQueryBuilder({ id: adminId, role: 'user' });
          }
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
          if (table === 'job_assignments') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: 'asgn_cancelled',
                        status: 'cancelled',
                        organization_id: orgId,
                        worker_id: workerId,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
      });

      const req = new NextRequest(
        `http://localhost/api/admin/assignments?assignmentId=asgn_cancelled&organizationId=${orgId}`
      );
      const res = await cancelAssignment(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('Assignment is already cancelled');
    });
  });

  describe('Pillar 3: Verification Review Queue Integration', () => {
    it('approves a pending verification submission via atomic RPC', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          id: verifId,
          application_id: appId,
          status: 'verified',
          reviewer_id: adminId,
          reviewed_at: '2026-09-02T13:00:00Z',
        },
        error: null,
      });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return createQueryBuilder({ id: adminId, role: 'user' });
          }
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: appId, organization_id: orgId, deleted_at: null },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { role: 'admin' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'application_verifications') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: verifId, application_id: appId, status: 'pending' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
        rpc: mockRpc,
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'verified',
          verificationId: verifId,
        }),
      });

      const res = await reviewVerification(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('verified');
      expect(mockRpc).toHaveBeenCalledWith('review_application_verification', {
        p_verification_id: verifId,
        p_status: 'verified',
        p_reviewer_notes: null,
      });
    });

    it('rejects a pending verification submission with reviewer notes', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          id: verifId,
          application_id: appId,
          status: 'rejected',
          reviewer_notes: 'Screenshot does not show confirmation email header',
          reviewer_id: adminId,
          reviewed_at: '2026-09-02T13:00:00Z',
        },
        error: null,
      });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return createQueryBuilder({ id: adminId, role: 'user' });
          }
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: appId, organization_id: orgId, deleted_at: null },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { role: 'admin' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'application_verifications') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: verifId, application_id: appId, status: 'pending' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
        rpc: mockRpc,
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'rejected',
          verificationId: verifId,
          reviewerNotes: 'Screenshot does not show confirmation email header',
        }),
      });

      const res = await reviewVerification(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('rejected');
      expect(mockRpc).toHaveBeenCalledWith('review_application_verification', {
        p_verification_id: verifId,
        p_status: 'rejected',
        p_reviewer_notes: 'Screenshot does not show confirmation email header',
      });
    });
  });

  describe('Pillar 4: Sync Engine Monitoring & Retry Controls', () => {
    it('retrieves sync engine status counts and recent events for the organization', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return createQueryBuilder({ id: adminId, role: 'user' });
          }
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
          if (table === 'sync_events') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: eventId,
                          user_id: workerId,
                          organization_id: orgId,
                          application_id: appId,
                          provider: 'google_sheets',
                          status: 'failed',
                          attempt_count: 3,
                          max_attempts: 5,
                          last_error: 'Google Sheets API quota exceeded (429)',
                          created_at: '2026-09-02T10:00:00Z',
                          updated_at: '2026-09-02T10:05:00Z',
                        },
                        {
                          id: 'evt_synced_2',
                          user_id: workerId,
                          organization_id: orgId,
                          application_id: appId,
                          provider: 'google_sheets',
                          status: 'synced',
                          attempt_count: 1,
                          max_attempts: 5,
                          last_error: null,
                          created_at: '2026-09-02T09:00:00Z',
                          updated_at: '2026-09-02T09:01:00Z',
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
      });

      const req = new NextRequest(`http://localhost/api/sync/status?organizationId=${orgId}`);
      const res = await getSyncStatus(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.counts.failed).toBe(1);
      expect(json.data.counts.synced).toBe(1);
      expect(json.data.recentEvents).toHaveLength(2);
      expect(json.data.recentEvents[0].lastError).toBe('Google Sheets API quota exceeded (429)');
    });

    it('triggers manual retry of a failed sync event by re-enqueueing into pending status', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [{ id: eventId }],
              error: null,
            }),
          }),
        }),
      });

      const mockOrgMembers = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null,
            }),
          }),
        }),
      };

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return createQueryBuilder({ id: adminId, role: 'user' });
          }
          if (table === 'organization_members') {
            return mockOrgMembers;
          }
          return createQueryBuilder();
        }),
      });

      (createAdminClient as any).mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'sync_events') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: eventId,
                      organization_id: orgId,
                      user_id: workerId,
                      status: 'failed',
                      manual_retry_count: 0,
                    },
                    error: null,
                  }),
                }),
              }),
              update: mockUpdate,
            };
          }
          if (table === 'organization_members') {
            return mockOrgMembers;
          }
          return createQueryBuilder();
        }),
      });

      const req = new NextRequest('http://localhost/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId }),
      });

      const res = await retrySync(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.retriedCount).toBe(1);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('rejects manual retry on non-retryable sync event status (Q-H04)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return createQueryBuilder({ id: adminId, role: 'user' });
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
      });

      (createAdminClient as any).mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'sync_events') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: eventId,
                      organization_id: orgId,
                      user_id: workerId,
                      status: 'synced', // non-retryable
                      manual_retry_count: 0,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
      });

      const req = new NextRequest('http://localhost/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId }),
      });

      const res = await retrySync(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain("Cannot retry sync event with status 'synced'");
    });

    it('rejects manual retry when manual replay limit (5) has been reached (Q-H04)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return createQueryBuilder({ id: adminId, role: 'user' });
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
      });

      (createAdminClient as any).mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'sync_events') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: eventId,
                      organization_id: orgId,
                      user_id: workerId,
                      status: 'failed',
                      manual_retry_count: 5, // Limit reached
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return createQueryBuilder();
        }),
      });

      const req = new NextRequest('http://localhost/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId }),
      });

      const res = await retrySync(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('Manual retry limit reached');
    });
  });
});
