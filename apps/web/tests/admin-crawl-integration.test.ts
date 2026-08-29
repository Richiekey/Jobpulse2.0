import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as triggerScrapeRoute } from '../app/api/admin/scrape/trigger/route';
import { GET as adminMetricsRoute } from '../app/api/admin/metrics/route';
import { GET as adminSourcesRoute } from '../app/api/admin/sources/route';
import { AuthGuard } from '../lib/auth-guard';

describe('Admin Crawl Trigger & Observability Integration (Batch F P0/P1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validAdmin = {
    id: 'admin_usr_123',
    role: 'admin',
  };

  describe('Security & Role Authorization Guard (P1)', () => {
    it('rejects unauthenticated trigger requests with 401 Unauthorized', async () => {
      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
        errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) as any,
      });

      const req = new NextRequest('http://localhost:3000/api/admin/scrape/trigger', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const res = await triggerScrapeRoute(req);
      expect(res.status).toBe(401);
    });

    it('rejects authenticated non-admin users with 403 Forbidden', async () => {
      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
        errorResponse: new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), { status: 403 }) as any,
      });

      const req = new NextRequest('http://localhost:3000/api/admin/scrape/trigger', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const res = await triggerScrapeRoute(req);
      expect(res.status).toBe(403);
    });
  });

  describe('Trigger Request Validation & Concurrency Safety (P0)', () => {
    it('successfully queues a global crawl run for authenticated admin with 202 Accepted', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                contains: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [] }), // No active runs
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'run_new_123',
                  started_at: new Date().toISOString(),
                  status: 'pending',
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
        user: { id: validAdmin.id },
        profile: validAdmin as any,
        supabase: mockSupabase as any,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/admin/scrape/trigger', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const res = await triggerScrapeRoute(req);
      expect(res.status).toBe(202);

      const json = await res.json();
      expect(json.data.runId).toBe('run_new_123');
      expect(json.data.status).toBe('pending');
      expect(json.data.companyIdentifier).toBe('all');
    });

    it('rejects duplicate concurrent triggers for the same target with 409 Conflict', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                contains: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [{ id: 'run_active_999', started_at: new Date().toISOString(), status: 'running' }],
                  }),
                }),
              }),
            }),
          }),
        }),
      };

      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
        user: { id: validAdmin.id },
        profile: validAdmin as any,
        supabase: mockSupabase as any,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/admin/scrape/trigger', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const res = await triggerScrapeRoute(req);
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.error).toContain('already in progress or queued');
      expect(json.error).toContain('run_active_999');
    });

    it('rejects trigger for disabled company source with 400 Bad Request', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'company_sources') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: '33333333-3333-3333-3333-333333333333', is_active: false, source_identifier: 'stripe' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
        user: { id: validAdmin.id },
        profile: validAdmin as any,
        supabase: mockSupabase as any,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/admin/scrape/trigger', {
        method: 'POST',
        body: JSON.stringify({ sourceId: '33333333-3333-3333-3333-333333333333' }),
      });

      const res = await triggerScrapeRoute(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('is disabled and cannot be crawled');
    });

    it('returns 404 Not Found when triggering crawl on nonexistent sourceId', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'company_sources') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Row not found' },
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
        user: { id: validAdmin.id },
        profile: validAdmin as any,
        supabase: mockSupabase as any,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/admin/scrape/trigger', {
        method: 'POST',
        body: JSON.stringify({ sourceId: '44444444-4444-4444-4444-444444444444' }),
      });

      const res = await triggerScrapeRoute(req);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toContain('was not found');
    });

    it('rejects malformed payload with 400 Bad Request', async () => {
      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
        user: { id: validAdmin.id },
        profile: validAdmin as any,
        supabase: {} as any,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/admin/scrape/trigger', {
        method: 'POST',
        body: JSON.stringify({ sourceId: 'not-a-valid-uuid' }),
      });

      const res = await triggerScrapeRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid request payload');
    });
  });
});
