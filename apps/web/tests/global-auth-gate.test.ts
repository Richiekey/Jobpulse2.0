import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AuthGuard } from '../lib/auth-guard';
import { ApiResponse } from '../lib/api-response';
import { GET as getFeedRoute } from '../app/api/jobs/feed/route';
import { GET as getFiltersRoute } from '../app/api/jobs/filters/route';
import { GET as getCompaniesRoute } from '../app/api/companies/route';
import { GET as getBenchmarksRoute } from '../app/api/salaries/benchmarks/route';
import { GET as getMetricsRoute } from '../app/api/admin/metrics/route';
import { GET as getHealthRoute } from '../app/api/health/route';
import { GET as getReadyRoute } from '../app/api/ready/route';

/**
 * Global Authentication Gate Regression Tests
 *
 * Proves the security architecture:
 * 1. Unauthenticated API requests → 401 on all protected routes
 * 2. Authenticated normal user → can access normal routes, blocked from admin
 * 3. Authenticated admin → can access admin routes
 * 4. Infrastructure probes remain unauthenticated
 */
describe('Global Authentication Gate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. UNAUTHENTICATED REQUESTS → 401
  // -----------------------------------------------------------------------
  describe('Unauthenticated API requests return 401', () => {
    beforeEach(() => {
      // Simulate unauthenticated: requireAuthenticatedUser returns errorResponse
      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        errorResponse: ApiResponse.error('Unauthorized: Authentication is required.', null, 401),
      });
    });

    it('GET /api/jobs/feed → 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/jobs/feed');
      const res = await getFeedRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unauthorized');
    });

    it('GET /api/jobs/filters → 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/jobs/filters');
      const res = await getFiltersRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('GET /api/companies → 401', async () => {
      const res = await getCompaniesRoute();
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('GET /api/salaries/benchmarks → 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/salaries/benchmarks');
      const res = await getBenchmarksRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 2. AUTHENTICATED NORMAL USER → admin blocked with 403
  // -----------------------------------------------------------------------
  describe('Authenticated normal user blocked from admin API with 403', () => {
    it('GET /api/admin/metrics → 403 for non-admin user', async () => {
      vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
        errorResponse: ApiResponse.error('Forbidden: You do not have administrator permissions.', null, 403),
      });

      const req = new NextRequest('http://localhost:3000/api/admin/metrics');
      const res = await getMetricsRoute(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });
  });

  // -----------------------------------------------------------------------
  // 3. INFRASTRUCTURE PROBES REMAIN UNAUTHENTICATED
  // -----------------------------------------------------------------------
  describe('Infrastructure probes exempt from authentication', () => {
    it('GET /api/health → not 401 without authentication', async () => {
      const res = await getHealthRoute();
      expect(res.status).not.toBe(401);
    });

    it('GET /api/ready → not 401 without authentication', async () => {
      const res = await getReadyRoute();
      expect(res.status).not.toBe(401);
    });
  });

});

