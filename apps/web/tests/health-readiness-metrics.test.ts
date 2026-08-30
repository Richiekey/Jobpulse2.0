import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as healthRoute } from '../app/api/health/route';
import { GET as readyRoute } from '../app/api/ready/route';
import { GET as metricsRoute } from '../app/api/admin/metrics/route';
import * as serverClient from '../lib/supabase/server';
import { AuthGuard } from '../lib/auth-guard';

describe('System Health, Readiness & Observability Metrics (S23-S25)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('returns status ok and process uptime when database is reachable', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'src_1' }], error: null }),
          }),
        }),
      };
      vi.spyOn(serverClient, 'createClient').mockResolvedValue(mockSupabase as any);

      const res = await healthRoute();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.database).toBe('connected');
      expect(typeof json.uptime).toBe('number');
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('GET /api/ready', () => {
    it('returns 200 ready when database connection succeeds', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'src_1' }], error: null }),
          }),
        }),
      };

      vi.spyOn(serverClient, 'createClient').mockResolvedValue(mockSupabase as any);

      const res = await readyRoute();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('ready');
      expect(json.database).toBe('connected');
    });

    it('returns 503 degraded when database connection encounters an error', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB connection timeout' } }),
          }),
        }),
      };

      vi.spyOn(serverClient, 'createClient').mockResolvedValue(mockSupabase as any);

      const res = await readyRoute();
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json.status).toBe('degraded');
      expect(json.error).toContain('DB connection timeout');
    });
  });

  describe('GET /api/admin/metrics (Database-Side Aggregation P0)', () => {
    it('rejects unauthenticated or non-admin requests with 401/403', async () => {
      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
        errorResponse: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) as any,
      });

      const req = new NextRequest('http://localhost:3000/api/admin/metrics');
      const res = await metricsRoute(req);
      expect(res.status).toBe(403);
    });

    it('executes database-side get_admin_system_metrics RPC without unbounded row reads', async () => {
      const mockMetricsPayload = {
        system: { timestamp: new Date().toISOString() },
        companies: { total: 25, verified: 18 },
        sources: {
          total: 30,
          active: 28,
          health: { healthy: 26, degraded: 2, failing: 0, unreachable: 0 },
        },
        jobs: { active: 350, expired: 42 },
        ingestion24h: {
          totalRuns: 60,
          successfulRuns: 58,
          failedRuns: 2,
          successRatePercent: 96.7,
        },
        engagement: {
          outboundClicks24h: 120,
          totalApplicationsTracked: 85,
          applicationsByStatus: { applied: 45, screening: 20, interview: 15, offer: 5 },
        },
      };

      const mockSupabase = {
        rpc: vi.fn().mockImplementation((fnName: string) => {
          if (fnName === 'get_admin_system_metrics') {
            return Promise.resolve({ data: mockMetricsPayload, error: null });
          }
          return Promise.resolve({ data: null, error: { message: 'RPC not found' } });
        }),
      };

      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
        user: { id: 'admin_1' },
        profile: { id: 'admin_1', role: 'admin' },
        supabase: mockSupabase as any,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/admin/metrics');
      const res = await metricsRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_admin_system_metrics');
      expect(json.data.companies.total).toBe(25);
      expect(json.data.companies.verified).toBe(18);
      expect(json.data.sources.health.healthy).toBe(26);
      expect(json.data.jobs.active).toBe(350);
      expect(json.data.ingestion24h.successRatePercent).toBe(96.7);
      expect(json.data.engagement.totalApplicationsTracked).toBe(85);
      expect(json.data.system.uptimeSeconds).toBeDefined();

      // Ensure no raw user/company records leak in response
      expect(json.data.users).toBeUndefined();
      expect(json.data.rawRecords).toBeUndefined();
    });

    it('returns 500 if database aggregation RPC encounters an error', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database connection failed' } }),
      };

      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
        user: { id: 'admin_1' },
        profile: { id: 'admin_1', role: 'admin' },
        supabase: mockSupabase as any,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/admin/metrics');
      const res = await metricsRoute(req);
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.error).toContain('Failed to aggregate system metrics in database');
    });
  });
});
