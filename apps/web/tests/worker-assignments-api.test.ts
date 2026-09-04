import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getWorkerAssignments } from '../app/api/worker/assignments/route';
import { PATCH as updateAssignmentStatus } from '../app/api/worker/assignments/[id]/route';
import { GET as getWorkerProfile, PUT as updateWorkerProfile } from '../app/api/worker/profile/route';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';

describe('Worker Assignments & Profile API (Batch K)', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const assignmentId = '22222222-2222-2222-2222-222222222222';
  const workerUserId = 'worker_abc';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/worker/assignments', () => {
    it('returns assigned jobs for the authenticated worker', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: assignmentId,
                organization_id: orgId,
                job_id: 'job_123',
                worker_id: workerUserId,
                assigned_by: 'admin_1',
                status: 'assigned',
                deadline_at: null,
                notes: 'Please review and apply',
                created_at: '2026-09-02T10:00:00Z',
                updated_at: '2026-09-02T10:00:00Z',
                jobs: {
                  id: 'job_123',
                  canonical_title: 'Full Stack Engineer',
                  display_title: 'Full Stack Engineer (TypeScript)',
                  locations: ['Remote'],
                  workplace_type: 'remote',
                  employment_type: 'full_time',
                  apply_url: 'https://stripe.com/jobs/apply',
                  canonical_url: 'https://stripe.com/jobs/123',
                  posted_at: '2026-09-01T00:00:00Z',
                  companies: {
                    id: 'comp_stripe',
                    name: 'Stripe',
                    logo_url: 'https://stripe.com/logo.png',
                  },
                },
              },
            ],
            error: null,
          }),
        }),
      });

      const req = new NextRequest('http://localhost/api/worker/assignments');
      const response = await getWorkerAssignments(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].status).toBe('assigned');
      expect(json.data[0].job.company.name).toBe('Stripe');
    });
  });

  describe('PATCH /api/worker/assignments/[id]', () => {
    it('allows worker to transition from assigned to in_progress', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: assignmentId,
              worker_id: workerUserId,
              status: 'assigned',
            },
            error: null,
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: assignmentId,
                      worker_id: workerUserId,
                      status: 'in_progress',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const req = new NextRequest(`http://localhost/api/worker/assignments/${assignmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress' }),
      });

      const response = await updateAssignmentStatus(req, { params: Promise.resolve({ id: assignmentId }) });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('in_progress');
    });

    it('rejects worker attempting an invalid jump: assigned -> completed', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: assignmentId,
              worker_id: workerUserId,
              status: 'assigned',
            },
            error: null,
          }),
        }),
      });

      const req = new NextRequest(`http://localhost/api/worker/assignments/${assignmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      });

      const response = await updateAssignmentStatus(req, { params: Promise.resolve({ id: assignmentId }) });
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Invalid status transition');
    });
  });

  describe('GET & PUT /api/worker/profile', () => {
    it('upserts and retrieves worker profile with CV and skills', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUserId } },
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
                    data: { id: 'm1', organization_id: orgId, user_id: workerUserId, role: 'worker' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'worker_profiles') {
            return {
              upsert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'wp_1',
                      organization_id: orgId,
                      user_id: workerUserId,
                      skills: ['React', 'Node.js'],
                      availability: 'immediate',
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

      const req = new NextRequest('http://localhost/api/worker/profile', {
        method: 'PUT',
        body: JSON.stringify({
          organizationId: orgId,
          skills: ['React', 'Node.js'],
          availability: 'immediate',
        }),
      });

      const response = await updateWorkerProfile(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.skills).toEqual(['React', 'Node.js']);
    });
  });
});
