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
    it('returns status ok and process uptime', async () => {
      const res = await healthRoute();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('ok');
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

  describe('GET /api/admin/metrics', () => {
    it('rejects unauthenticated or non-admin requests with 401/403', async () => {
      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
        errorResponse: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) as any,
      });

      const req = new NextRequest('http://localhost:3000/api/admin/metrics');
      const res = await metricsRoute(req);
      expect(res.status).toBe(403);
    });

    it('compiles and returns aggregated system observability metrics for admin', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'companies') {
            return {
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'c1', verified: true }, { id: 'c2', verified: false }],
                count: 2,
              }),
            };
          }
          if (table === 'company_sources') {
            return {
              select: vi.fn().mockResolvedValue({
                data: [
                  { id: 'cs1', health_status: 'healthy', is_active: true },
                  { id: 'cs2', health_status: 'degraded', is_active: true },
                ],
                count: 2,
              }),
            };
          }
          if (table === 'jobs') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((col: string, val: string) => {
                  if (val === 'active') return Promise.resolve({ count: 120 });
                  if (val === 'expired') return Promise.resolve({ count: 15 });
                  return Promise.resolve({ count: 0 });
                }),
              }),
            };
          }
          if (table === 'scrape_runs') {
            return {
              select: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'r1', status: 'completed' },
                    { id: 'r2', status: 'completed' },
                    { id: 'r3', status: 'failed' },
                  ],
                }),
              }),
            };
          }
          if (table === 'outbound_clicks') {
            return {
              select: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ count: 48 }),
              }),
            };
          }
          if (table === 'applications') {
            return {
              select: vi.fn().mockResolvedValue({
                data: [
                  { id: 'a1', status: 'applied' },
                  { id: 'a2', status: 'interview' },
                ],
                count: 2,
              }),
            };
          }
          return {};
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
      expect(json.data.companies.total).toBe(2);
      expect(json.data.companies.verified).toBe(1);
      expect(json.data.sources.health.healthy).toBe(1);
      expect(json.data.sources.health.degraded).toBe(1);
      expect(json.data.jobs.active).toBe(120);
      expect(json.data.jobs.expired).toBe(15);
      expect(json.data.ingestion24h.totalRuns).toBe(3);
      expect(json.data.ingestion24h.successfulRuns).toBe(2);
      expect(json.data.ingestion24h.failedRuns).toBe(1);
      expect(json.data.ingestion24h.successRatePercent).toBe(66.7);
      expect(json.data.engagement.outboundClicks24h).toBe(48);
      expect(json.data.engagement.totalApplicationsTracked).toBe(2);
      expect(json.data.engagement.applicationsByStatus.interview).toBe(1);
    });
  });
});
