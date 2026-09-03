import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as triggerScrapeRoute } from '../app/api/admin/scrape/trigger/route';
import { GET as getRunsRoute } from '../app/api/admin/scrape/runs/route';
import { AuthGuard } from '../lib/auth-guard';

describe('Admin Crawl Trigger & Atomic Concurrency Guard (Batch F P0/P1)', () => {
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

  describe('Atomic Scrape Scheduling RPC & Concurrency Protection (P0)', () => {
    it('atomically schedules a crawl run via schedule_admin_scrape_run RPC with 202 Accepted', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockImplementation((fnName: string, params: any) => {
          if (fnName === 'schedule_admin_scrape_run') {
            return Promise.resolve({
              data: {
                success: true,
                conflict: false,
                run_id: 'run_atomic_123',
                status: 'pending',
                company_identifier: 'all',
                source_id: null,
                scheduled_at: new Date().toISOString(),
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: { message: 'RPC not found' } });
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
      expect(mockSupabase.rpc).toHaveBeenCalledWith('schedule_admin_scrape_run', {
        p_admin_id: validAdmin.id,
        p_company_identifier: 'all',
        p_source_id: null,
        p_ttl_seconds: 900,
        p_execution_mode: 'manual_global',
      });
      expect(json.data.runId).toBe('run_atomic_123');
      expect(json.data.status).toBe('pending');
      expect(json.data.companyIdentifier).toBe('all');
    });

    it('rejects duplicate concurrent triggers with 409 Conflict when RPC returns conflict: true', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: {
            success: false,
            conflict: true,
            existing_run_id: 'run_active_999',
            existing_status: 'running',
            existing_started_at: new Date().toISOString(),
            message: 'A scrape crawl is already running or queued for this target (Run ID: run_active_999).',
          },
          error: null,
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
      expect(json.error).toContain('already running or queued');
      expect(json.error).toContain('run_active_999');
    });

    it('rejects trigger for disabled company source with 400 Bad Request when RPC returns DISABLED', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: {
            success: false,
            error_type: 'DISABLED',
            message: 'Company source "stripe" is disabled and cannot be crawled.',
          },
          error: null,
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

    it('returns 404 Not Found when RPC returns NOT_FOUND for nonexistent sourceId', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: {
            success: false,
            error_type: 'NOT_FOUND',
            message: 'Company source with ID "44444444-4444-4444-4444-444444444444" was not found.',
          },
          error: null,
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

    it('returns 500 when scheduling RPC encounters an unhandled database error', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed during transaction' },
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
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.error).toContain('Failed to execute atomic scrape scheduling RPC in database');
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

  describe('Admin Scrape Runs Telemetry API (P2)', () => {
    it('returns recent scrape runs with human-readable outcome classification', async () => {
      const mockRuns = [
        {
          id: 'run_completed_1',
          status: 'completed',
          started_at: '2026-09-03T16:00:00Z',
          completed_at: '2026-09-03T16:05:00Z',
          companies_attempted: 1,
          companies_succeeded: 1,
          companies_failed: 0,
          jobs_discovered: 150,
          jobs_inserted: 120,
          jobs_updated: 30,
          jobs_rejected: 0,
          jobs_failed: 0,
          metadata: {
            execution_mode: 'manual_global',
            sources_targeted: 1,
          },
        },
        {
          id: 'run_zero_due',
          status: 'completed',
          started_at: '2026-09-03T15:00:00Z',
          completed_at: '2026-09-03T15:00:01Z',
          companies_attempted: 0,
          companies_succeeded: 0,
          companies_failed: 0,
          jobs_discovered: 0,
          jobs_inserted: 0,
          jobs_updated: 0,
          jobs_rejected: 0,
          jobs_failed: 0,
          metadata: {
            execution_mode: 'scheduled',
            outcome: 'zero_sources_due',
            sources_targeted: 59,
          },
        },
      ];

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: mockRuns,
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

      const req = new NextRequest('http://localhost:3000/api/admin/scrape/runs');
      const res = await getRunsRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.runs).toHaveLength(2);
      expect(json.data.runs[0].id).toBe('run_completed_1');
      expect(json.data.runs[0].outcomeText).toBe('Completed — 150 jobs ingested');
      expect(json.data.runs[1].id).toBe('run_zero_due');
      expect(json.data.runs[1].outcomeText).toBe('Completed — 0 sources due');
    });

    it('rejects unauthenticated access to runs endpoint with 401', async () => {
      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
        errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) as any,
      });

      const req = new NextRequest('http://localhost:3000/api/admin/scrape/runs');
      const res = await getRunsRoute(req);
      expect(res.status).toBe(401);
    });
  });
});
