import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getWorkerActivity } from '../app/api/worker/activity/route';
import { PATCH as updateApplication } from '../app/api/applications/[id]/route';
import { PATCH as updateAssignmentStatus } from '../app/api/worker/assignments/[id]/route';
import { GET as getWorkerProfile, PUT as updateWorkerProfile } from '../app/api/worker/profile/route';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';

describe('Batch P — Worker Command Center Integration Suite', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const otherOrgId = '22222222-2222-2222-2222-222222222222';
  const workerUserId = '33333333-3333-3333-3333-333333333333';
  const otherUserId = '44444444-4444-4444-4444-444444444444';
  const assignmentId = '55555555-5555-5555-5555-555555555555';
  const appId = '66666666-6666-6666-6666-666666666666';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. GET /api/worker/activity
  // =========================================================================
  describe('GET /api/worker/activity', () => {
    it('returns 401 when caller is unauthenticated', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      });

      const req = new NextRequest('http://localhost:3000/api/worker/activity');
      const res = await getWorkerActivity(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('returns 400 for invalid organizationId format', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUserId } }, error: null }),
        },
      });

      const req = new NextRequest('http://localhost:3000/api/worker/activity?organizationId=not-a-uuid');
      const res = await getWorkerActivity(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid organizationId');
    });

    it('returns 403 if caller is not a member of the requested organization', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUserId } }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/activity?organizationId=${orgId}`);
      const res = await getWorkerActivity(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden');
    });

    it('aggregates and returns chronological activity items sorted descending', async () => {
      const mockAssignments = [
        {
          id: assignmentId,
          organization_id: orgId,
          job_id: 'job-1',
          status: 'in_progress',
          deadline_at: '2026-09-10T00:00:00Z',
          notes: 'Please apply today',
          created_at: '2026-09-02T10:00:00Z',
          updated_at: '2026-09-03T12:00:00Z',
          jobs: {
            id: 'job-1',
            canonical_title: 'Software Engineer',
            display_title: 'Senior Software Engineer',
            companies: { name: 'Acme Corp' },
          },
        },
      ];

      const mockApplications = [
        {
          id: appId,
          organization_id: orgId,
          company_name: 'Beta Tech',
          job_title: 'Frontend Developer',
          status: 'screening',
          verification_status: 'verified',
          sync_status: 'synced',
          applied_at: '2026-09-01T09:00:00Z',
          created_at: '2026-09-01T09:00:00Z',
          updated_at: '2026-09-04T15:00:00Z',
        },
      ];

      const mockVerifications = [
        {
          id: 'v-1',
          application_id: appId,
          organization_id: orgId,
          worker_id: workerUserId,
          status: 'verified',
          notes: 'Confirmation email verified',
          rejection_reason: null,
          created_at: '2026-09-01T09:30:00Z',
          reviewed_at: '2026-09-01T14:00:00Z',
          applications: { company_name: 'Beta Tech', job_title: 'Frontend Developer' },
        },
      ];

      const mockSyncEvents = [
        {
          id: 's-1',
          application_id: appId,
          organization_id: orgId,
          status: 'synced',
          attempts: 1,
          last_error: null,
          created_at: '2026-09-01T09:05:00Z',
          updated_at: '2026-09-01T09:06:00Z',
        },
      ];

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUserId } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { role: 'worker', user_id: workerUserId, organization_id: orgId },
                error: null,
              }),
            };
          }
          if (table === 'job_assignments') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              then: (resolve: any) => resolve({ data: mockAssignments, error: null }),
            };
          }
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              then: (resolve: any) => resolve({ data: mockApplications, error: null }),
            };
          }
          if (table === 'application_events') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
          if (table === 'application_verifications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              then: (resolve: any) => resolve({ data: mockVerifications, error: null }),
            };
          }
          if (table === 'sync_events') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              then: (resolve: any) => resolve({ data: mockSyncEvents, error: null }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/activity?organizationId=${orgId}`);
      const res = await getWorkerActivity(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.data).toBeDefined();
      expect(json.data.items.length).toBeGreaterThan(0);

      // Verify items are ordered chronologically descending
      const timestamps = json.data.items.map((i: any) => new Date(i.occurredAt).getTime());
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
      }

      // Verify category items are present
      const categories = new Set(json.data.items.map((i: any) => i.category));
      expect(categories.has('assignment')).toBe(true);
      expect(categories.has('application')).toBe(true);
      expect(categories.has('verification')).toBe(true);
      expect(categories.has('sync')).toBe(true);
    });
  });

  // =========================================================================
  // 2. PATCH /api/applications/[id] (Worker Ownership Access)
  // =========================================================================
  describe('PATCH /api/applications/[id]', () => {
    it('allows worker to update their own application even when orgId is provided without org admin role', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUserId } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appId,
                  user_id: workerUserId, // Caller is owner
                  organization_id: orgId,
                  deleted_at: null,
                },
                error: null,
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: appId,
                      user_id: workerUserId,
                      organization_id: orgId,
                      status: 'interview',
                      notes: 'Moving to interview round',
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(
        `http://localhost:3000/api/applications/${appId}?organizationId=${orgId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'interview',
            notes: 'Moving to interview round',
          }),
        }
      );

      const res = await updateApplication(req, { params: Promise.resolve({ id: appId }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe('interview');
    });

    it('rejects update if caller is neither owner nor org admin', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUserId } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appId,
                  user_id: otherUserId, // Not owner!
                  organization_id: orgId,
                  deleted_at: null,
                },
                error: null,
              }),
            };
          }
          if (table === 'organization_members') {
            // Not org admin!
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { role: 'worker', user_id: workerUserId, organization_id: orgId },
                error: null,
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(
        `http://localhost:3000/api/applications/${appId}?organizationId=${orgId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'rejected' }),
        }
      );

      const res = await updateApplication(req, { params: Promise.resolve({ id: appId }) });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 3. PATCH /api/worker/assignments/[id] (FSM Lifecycle Transitions)
  // =========================================================================
  describe('PATCH /api/worker/assignments/[id]', () => {
    it('allows worker to transition assignment from assigned to in_progress', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUserId } }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: assignmentId, worker_id: workerUserId, status: 'assigned' },
            error: null,
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: assignmentId, worker_id: workerUserId, status: 'in_progress' },
                error: null,
              }),
            }),
          }),
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });

      const res = await updateAssignmentStatus(req, { params: Promise.resolve({ id: assignmentId }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe('in_progress');
    });

    it('rejects worker attempting to transition from completed back to in_progress', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUserId } }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: assignmentId, worker_id: workerUserId, status: 'completed' },
            error: null,
          }),
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });

      const res = await updateAssignmentStatus(req, { params: Promise.resolve({ id: assignmentId }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid status transition');
    });

    it('returns 404 if worker attempts to update an assignment assigned to someone else', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUserId } }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null, // Scoped to worker_id = user.id, returns null
            error: null,
          }),
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });

      const res = await updateAssignmentStatus(req, { params: Promise.resolve({ id: assignmentId }) });
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 4. GET & PUT /api/worker/profile
  // =========================================================================
  describe('GET & PUT /api/worker/profile', () => {
    it('returns worker profile when authorized member', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUserId } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { role: 'worker', user_id: workerUserId, organization_id: orgId },
                error: null,
              }),
            };
          }
          if (table === 'worker_profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  user_id: workerUserId,
                  organization_id: orgId,
                  skills: ['TypeScript', 'React'],
                  availability: 'immediate',
                  experience_years: 4,
                },
                error: null,
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/profile?organizationId=${orgId}`);
      const res = await getWorkerProfile(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.skills).toContain('TypeScript');
      expect(json.data.availability).toBe('immediate');
    });

    it('updates worker profile with validated fields', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerUserId } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { role: 'worker', user_id: workerUserId, organization_id: orgId },
                error: null,
              }),
            };
          }
          if (table === 'worker_profiles') {
            return {
              upsert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      user_id: workerUserId,
                      organization_id: orgId,
                      skills: ['Go', 'Kubernetes'],
                      availability: 'two_weeks',
                      experience_years: 6,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/worker/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgId,
          skills: ['Go', 'Kubernetes'],
          availability: 'two_weeks',
          experienceYears: 6,
          preferredRoles: ['Backend Engineer'],
          preferredLocations: ['Remote'],
        }),
      });

      const res = await updateWorkerProfile(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.skills).toContain('Go');
      expect(json.data.availability).toBe('two_weeks');
    });
  });
});
