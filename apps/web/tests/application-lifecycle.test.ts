import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getApps, POST as postApps } from '../app/api/applications/route';
import { PATCH as patchApp, DELETE as deleteApp } from '../app/api/applications/[id]/route';
import { AuthGuard } from '../lib/auth-guard';

describe('Application Lifecycle & State Machine (S20/S21, P1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests to applications API with 401 Unauthorized', async () => {
    vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
      errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) as any,
    });

    const req = new NextRequest('http://localhost:3000/api/applications');
    const res = await getApps(req);
    expect(res.status).toBe(401);
  });

  it('allows authenticated user to create application with status transition to applied', async () => {
    const mockCreated = {
      id: 'app_1',
      user_id: 'usr_1',
      company_name: 'Stripe',
      job_title: 'Senior Engineer',
      status: 'applied',
      applied_at: '2026-08-29T12:00:00Z',
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockCreated, error: null }),
          }),
        }),
      }),
    };

    vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
      user: { id: 'usr_1' },
      profile: { id: 'usr_1', role: 'user' },
      supabase: mockSupabase as any,
    } as any);

    const req = new NextRequest('http://localhost:3000/api/applications', {
      method: 'POST',
      body: JSON.stringify({
        companyName: 'Stripe',
        jobTitle: 'Senior Engineer',
        status: 'applied',
      }),
    });

    const res = await postApps(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.status).toBe('applied');
    expect(json.data.company_name).toBe('Stripe');
  });

  it('allows user to update status from applied to interview or offer', async () => {
    const mockUpdated = {
      id: '00000000-0000-0000-0000-000000000001',
      user_id: 'usr_1',
      status: 'interview',
      notes: 'Passed technical screen, scheduled panel interview.',
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockUpdated, error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
      user: { id: 'usr_1' },
      profile: { id: 'usr_1', role: 'user' },
      supabase: mockSupabase as any,
    } as any);

    const req = new NextRequest('http://localhost:3000/api/applications/00000000-0000-0000-0000-000000000001', {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'interview',
        notes: 'Passed technical screen, scheduled panel interview.',
      }),
    });

    const res = await patchApp(req, {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('interview');
    expect(json.data.notes).toContain('Passed technical screen');
  });

  // DELETE Semantics Tests (P1)
  describe('DELETE Application Semantics', () => {
    it('returns 404 Not Found when attempting to delete a non-existent or unauthorized application', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };

      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        user: { id: 'usr_1' },
        profile: { id: 'usr_1', role: 'user' },
        supabase: mockSupabase as any,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/applications/00000000-0000-0000-0000-000000000001', {
        method: 'DELETE',
      });

      const res = await deleteApp(req, {
        params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('Application not found or unauthorized to delete');
    });

    it('returns 200 with deleted: true when application is successfully deleted', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({
                  data: [{ id: '00000000-0000-0000-0000-000000000001' }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };

      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        user: { id: 'usr_1' },
        profile: { id: 'usr_1', role: 'user' },
        supabase: mockSupabase as any,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/applications/00000000-0000-0000-0000-000000000001', {
        method: 'DELETE',
      });

      const res = await deleteApp(req, {
        params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.deleted).toBe(true);
      expect(json.data.id).toBe('00000000-0000-0000-0000-000000000001');
    });
  });
});
