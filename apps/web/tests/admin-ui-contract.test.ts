import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getMetricsRoute } from '../app/api/admin/metrics/route.js';
import { GET as getSourcesRoute } from '../app/api/admin/sources/route.js';
import { POST as triggerScrapeRoute } from '../app/api/admin/scrape/trigger/route.js';
import { AuthGuard } from '../lib/auth-guard.js';

/**
 * Admin UI Contract & Error State Regression Tests
 *
 * Proves:
 * 1. Unauthenticated access returns 401 on all admin API endpoints
 * 2. Non-admin access returns 403 on all admin API endpoints
 * 3. Sources API response shape returns { data: { sources: [...] } } — never { data: [...] }
 * 4. Scrape trigger 409 conflict renders correct error shape
 * 5. 500 backend failures return structured error, not silent swallowing
 */
describe('Admin UI Contract & Error State Regression Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. UNAUTHENTICATED ACCESS → 401
  // -------------------------------------------------------------------------
  describe('Unauthenticated access → 401 Unauthorized', () => {
    function mock401() {
      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValueOnce({
        errorResponse: new Response(
          JSON.stringify({
            success: false,
            error: 'Unauthorized: Authentication is required.',
            requestId: 'req_test_401',
          }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        ),
      } as any);
    }

    it('GET /api/admin/metrics returns 401 for unauthenticated requests', async () => {
      mock401();
      const req = new NextRequest('http://localhost:3000/api/admin/metrics');
      const res = await getMetricsRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unauthorized');
    });

    it('GET /api/admin/sources returns 401 for unauthenticated requests', async () => {
      mock401();
      const req = new NextRequest('http://localhost:3000/api/admin/sources');
      const res = await getSourcesRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unauthorized');
    });

    it('POST /api/admin/scrape/trigger returns 401 for unauthenticated requests', async () => {
      mock401();
      const req = new NextRequest('http://localhost:3000/api/admin/scrape/trigger', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const res = await triggerScrapeRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unauthorized');
    });
  });

  // -------------------------------------------------------------------------
  // 2. NON-ADMIN ACCESS → 403
  // -------------------------------------------------------------------------
  describe('Non-admin access → 403 Forbidden', () => {
    function mock403() {
      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValueOnce({
        errorResponse: new Response(
          JSON.stringify({
            success: false,
            error: 'Forbidden: You do not have administrator permissions to access this endpoint.',
            requestId: 'req_test_403',
          }),
          { status: 403, headers: { 'content-type': 'application/json' } }
        ),
      } as any);
    }

    it('GET /api/admin/metrics returns 403 for non-admin users', async () => {
      mock403();
      const req = new NextRequest('http://localhost:3000/api/admin/metrics');
      const res = await getMetricsRoute(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('GET /api/admin/sources returns 403 for non-admin users', async () => {
      mock403();
      const req = new NextRequest('http://localhost:3000/api/admin/sources');
      const res = await getSourcesRoute(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('POST /api/admin/scrape/trigger returns 403 for non-admin users', async () => {
      mock403();
      const req = new NextRequest('http://localhost:3000/api/admin/scrape/trigger', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const res = await triggerScrapeRoute(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });
  });

  // -------------------------------------------------------------------------
  // 3. SOURCES API RESPONSE SHAPE — { data: { sources: [...] } }
  // -------------------------------------------------------------------------
  describe('Sources API response unwrapping contract', () => {
    it('GET /api/admin/sources wraps sources array inside data.sources, not data directly', async () => {
      const mockSources = [
        {
          id: 'cs_1',
          company_id: 'comp_1',
          source_id: 'src_1',
          source_identifier: 'stripe',
          source_url: 'https://boards.greenhouse.io/stripe',
          is_active: true,
          health_status: 'healthy',
          priority: 1,
          schedule_interval_minutes: 60,
          consecutive_failures: 0,
          last_checked_at: '2026-09-01T12:00:00Z',
          last_success_at: '2026-09-01T12:00:00Z',
          last_failure_at: null,
          last_job_count: 45,
          last_error: null,
          discovery_method: 'manual',
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-09-01T12:00:00Z',
          companies: { id: 'comp_1', name: 'Stripe', slug: 'stripe', domain: 'stripe.com' },
          sources: { id: 'src_1', adapter_name: 'greenhouse', name: 'Greenhouse' },
        },
      ];

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: undefined,
      });

      // Chain the final resolution
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: mockSources, error: null }),
        eq: vi.fn().mockReturnThis(),
      };

      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValueOnce({
        user: { id: 'admin_1', email: 'admin@jobpulse.ai' },
        profile: { id: 'admin_1', role: 'admin', email: 'admin@jobpulse.ai' },
        supabase: {
          from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({ data: mockSources, error: null }),
                }),
              }),
            }),
          }),
        } as any,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/admin/sources?limit=100');
      const res = await getSourcesRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();

      // CRITICAL REGRESSION: json.data MUST be an object with a sources key,
      // NOT the raw array. The old bug was: setSources(json.data) where json.data
      // was { count, limit, offset, sources: [...] } — an object, not an array.
      expect(json.data).toBeDefined();
      expect(typeof json.data).toBe('object');
      expect(Array.isArray(json.data)).toBe(false); // MUST NOT be a plain array
      expect(json.data.sources).toBeDefined();
      expect(Array.isArray(json.data.sources)).toBe(true);
      expect(json.data.sources).toHaveLength(1);
      expect(json.data.sources[0].source_identifier).toBe('stripe');

      // Also verify pagination metadata is present
      expect(json.data.count).toBeDefined();
      expect(json.data.limit).toBeDefined();
      expect(json.data.offset).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. SCRAPE TRIGGER 409 CONFLICT
  // -------------------------------------------------------------------------
  describe('Scrape trigger conflict handling', () => {
    it('POST /api/admin/scrape/trigger returns 409 when crawl is already running', async () => {
      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValueOnce({
        user: { id: 'admin_1', email: 'admin@jobpulse.ai' },
        profile: { id: 'admin_1', role: 'admin', email: 'admin@jobpulse.ai' },
        supabase: {
          rpc: vi.fn().mockResolvedValue({
            data: {
              success: false,
              conflict: true,
              message: 'A crawl run is already in progress for scope: all',
              existing_run_id: 'run_existing_123',
              existing_status: 'running',
            },
            error: null,
          }),
        } as any,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/admin/scrape/trigger', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const res = await triggerScrapeRoute(req);
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('already in progress');
    });
  });

  // -------------------------------------------------------------------------
  // 5. BACKEND 500 FAILURES — structured error, not silent
  // -------------------------------------------------------------------------
  describe('Backend 500 failures return structured errors', () => {
    it('GET /api/admin/metrics returns 500 with structured error when RPC fails', async () => {
      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValueOnce({
        user: { id: 'admin_1', email: 'admin@jobpulse.ai' },
        profile: { id: 'admin_1', role: 'admin', email: 'admin@jobpulse.ai' },
        supabase: {
          rpc: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'connection terminated unexpectedly', code: '57P01' },
          }),
        } as any,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/admin/metrics');
      const res = await getMetricsRoute(req);
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();
      expect(typeof json.error).toBe('string');
      expect(json.error.length).toBeGreaterThan(0);
      // Must have a request ID for tracing
      expect(json.requestId).toBeDefined();
    });

    it('POST /api/admin/scrape/trigger returns 500 with structured error when RPC fails', async () => {
      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValueOnce({
        user: { id: 'admin_1', email: 'admin@jobpulse.ai' },
        profile: { id: 'admin_1', role: 'admin', email: 'admin@jobpulse.ai' },
        supabase: {
          rpc: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'database connection pool exhausted', code: '53300' },
          }),
        } as any,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/admin/scrape/trigger', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const res = await triggerScrapeRoute(req);
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Failed to execute');
      expect(json.requestId).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 6. API ERROR RESPONSE SHAPE CONTRACT
  // -------------------------------------------------------------------------
  describe('Error response shape contract', () => {
    it('All error responses contain success=false, error string, and requestId', async () => {
      // Test with 401
      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValueOnce({
        errorResponse: new Response(
          JSON.stringify({
            success: false,
            error: 'Unauthorized: Authentication is required.',
            requestId: 'req_shape_test',
          }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        ),
      } as any);

      const req = new NextRequest('http://localhost:3000/api/admin/metrics');
      const res = await getMetricsRoute(req);
      const json = await res.json();

      expect(json).toHaveProperty('success', false);
      expect(json).toHaveProperty('error');
      expect(typeof json.error).toBe('string');
      expect(json).toHaveProperty('requestId');
      // The response must NOT have a 'data' key on error
      expect(json.data).toBeUndefined();
    });
  });
});
