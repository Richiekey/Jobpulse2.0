import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getAdminIntelligence } from '../app/api/admin/intelligence/route';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';

describe('Admin Operational Intelligence API (Batch R)', () => {
  const orgAId = '11111111-1111-1111-1111-111111111111';
  const orgBId = '22222222-2222-2222-2222-222222222222';
  const platformAdminId = 'platform-admin-id';
  const orgAAdminId = 'org-a-admin-id';
  const workerId = 'worker-id';
  const normalUserId = 'normal-user-id';

  const mockRpcMetrics = {
    timeRange: '24h',
    windowStart: '2026-09-05T12:00:00Z',
    organizationId: null,
    scope: {
      workforce: 'organization',
      jobs: 'platform',
      sourceHealth: 'platform',
      dataQuality: 'platform',
    },
    workforce: {
      roster: { totalWorkers: 10, activeWorkers: 5 },
      velocity: { dispatched: 8, startedInWindow: 6, completed: 6, cancelled: 1, skipped: 0 },
      inProgress: 2,
      completionRatePercent: 85.7,
      currentActive: 2,
      overdueBacklog: 0,
      verifications: {
        verifiedInWindow: 4,
        rejectedInWindow: 1,
        reviewedInWindow: 5,
        pendingCurrent: 0,
        approvalRatePercent: 80.0,
        total: 5,
      },
      avgTurnaroundHours: 3.2,
    },
    jobs: {
      inventory: { activeJobs: 15000, expiredJobs: 18000, totalJobs: 33000 },
      ingestionVelocity: { new24h: 150, new7d: 3500, new30d: 33000 },
      freshness: { fresh: 12000, aging: 300, stale: 200, critical: 2500 },
      quality: {
        salaryTransparencyPercent: 12.5,
        skillCoveragePercent: 65.0,
        locationSpecificityPercent: 60.0,
        directApplyCoveragePercent: 100.0,
      },
    },
    sourceHealth: {
      reliability: { totalRuns: 1500, successfulRuns: 1400, failedRuns: 100, successRatePercent: 93.3 },
      distribution: { healthy: 28, degraded: 1, failing: 2, disabled: 0, total: 31 },
      executionPerformance: { avgDurationMs: 2500, minDurationMs: 50, maxDurationMs: 200000 },
      yield: { avgDiscovered: 100.0, avgInserted: 25.0, avgUpdated: 0.0 },
      failureTaxonomy: [{ category: 'timeout', count: 12 }],
    },
    dataQuality: {
      auditedActiveJobs: 15000,
      missingFields: { missingSalary: 13000, missingSkills: 5000, missingLocation: 6000, missingDescription: 900 },
      atsResolution: {
        resolvedCount: 15000,
        fallbackCount: 0,
        resolutionRatePercent: 100.0,
        methods: { GREENHOUSE: 8000, ASHBY: 1000 },
      },
      compensation: {
        currencies: { USD: 400, $: 800 },
        intervals: { YEARLY: 1000, HOURLY: 20 },
      },
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Unauthenticated -> 401
  it('1. returns 401 when request is unauthenticated', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'JWT expired' },
        }),
      },
    });

    const req = new NextRequest(`http://localhost/api/admin/intelligence?organizationId=${orgAId}`);
    const response = await getAdminIntelligence(req);
    expect(response.status).toBe(401);
  });

  // 2. Worker -> 403
  it('2. returns 403 when caller is a worker in the organization', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: workerId } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { role: 'user' },
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
                    data: { id: 'mem-1', organization_id: orgAId, user_id: workerId, role: 'worker' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {} as any;
      }),
    });

    const req = new NextRequest(`http://localhost/api/admin/intelligence?organizationId=${orgAId}`);
    const response = await getAdminIntelligence(req);
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toContain('Forbidden');
  });

  // 3. Normal user -> 403
  it('3. returns 403 when caller is a normal non-member user', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: normalUserId } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { role: 'user' },
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
                    data: null,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {} as any;
      }),
    });

    const req = new NextRequest(`http://localhost/api/admin/intelligence?organizationId=${orgAId}`);
    const response = await getAdminIntelligence(req);
    expect(response.status).toBe(403);
  });

  // 4. Org A admin -> Org A -> 200
  it('4. returns 200 when Org A admin queries Org A metrics', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: orgAAdminId } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { role: 'user' },
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
                    data: { id: 'mem-admin-a', organization_id: orgAId, user_id: orgAAdminId, role: 'admin' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {} as any;
      }),
      rpc: vi.fn().mockResolvedValue({
        data: { ...mockRpcMetrics, organizationId: orgAId },
        error: null,
      }),
    });

    const req = new NextRequest(`http://localhost/api/admin/intelligence?organizationId=${orgAId}&range=24h`);
    const response = await getAdminIntelligence(req);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.organizationId).toBe(orgAId);
    expect(json.data.workforce).toBeDefined();
    expect(json.data.jobs).toBeDefined();
    expect(json.data.sourceHealth).toBeDefined();
    expect(json.data.dataQuality).toBeDefined();
  });

  // 5. Org A admin -> Org B -> 403
  it('5. returns 403 when Org A admin attempts to query Org B metrics', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: orgAAdminId } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { role: 'user' },
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
                    data: null, // Not a member of Org B
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {} as any;
      }),
    });

    const req = new NextRequest(`http://localhost/api/admin/intelligence?organizationId=${orgBId}`);
    const response = await getAdminIntelligence(req);
    expect(response.status).toBe(403);
  });

  // 6. Org A admin -> global -> 403
  it('6. returns 403 when Org A admin attempts to query global metrics (no organizationId)', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: orgAAdminId } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { role: 'user' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {} as any;
      }),
    });

    const req = new NextRequest('http://localhost/api/admin/intelligence');
    const response = await getAdminIntelligence(req);
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toContain('Global operational intelligence requires platform administrator permissions');
  });

  // 7. Platform admin -> Org A -> 200
  it('7. returns 200 when Platform admin queries Org A metrics without membership', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: platformAdminId } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { role: 'admin' }, // Platform superadmin
                  error: null,
                }),
              }),
            }),
          };
        }
        return {} as any;
      }),
      rpc: vi.fn().mockResolvedValue({
        data: { ...mockRpcMetrics, organizationId: orgAId },
        error: null,
      }),
    });

    const req = new NextRequest(`http://localhost/api/admin/intelligence?organizationId=${orgAId}`);
    const response = await getAdminIntelligence(req);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.organizationId).toBe(orgAId);
  });

  // 8. Platform admin -> Org B -> 200
  it('8. returns 200 when Platform admin queries Org B metrics', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: platformAdminId } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { role: 'admin' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {} as any;
      }),
      rpc: vi.fn().mockResolvedValue({
        data: { ...mockRpcMetrics, organizationId: orgBId },
        error: null,
      }),
    });

    const req = new NextRequest(`http://localhost/api/admin/intelligence?organizationId=${orgBId}`);
    const response = await getAdminIntelligence(req);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.organizationId).toBe(orgBId);
  });

  // 9. Platform admin -> global -> 200
  it('9. returns 200 when Platform admin queries global metrics', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: platformAdminId } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { role: 'admin' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {} as any;
      }),
      rpc: vi.fn().mockResolvedValue({
        data: { ...mockRpcMetrics, organizationId: null },
        error: null,
      }),
    });

    const req = new NextRequest('http://localhost/api/admin/intelligence?range=7d');
    const response = await getAdminIntelligence(req);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.organizationId).toBeNull();
  });

  // 10. Malformed UUID -> 400
  it('10. returns 400 when organizationId is not a valid UUID', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: platformAdminId } },
          error: null,
        }),
      },
    });

    const req = new NextRequest('http://localhost/api/admin/intelligence?organizationId=not-a-valid-uuid');
    const response = await getAdminIntelligence(req);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('Invalid organizationId format');
  });

  // 11. Invalid range -> 400
  it('11. returns 400 when range parameter is unsupported', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: platformAdminId } },
          error: null,
        }),
      },
    });

    const req = new NextRequest('http://localhost/api/admin/intelligence?range=1year');
    const response = await getAdminIntelligence(req);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('Invalid range parameter');
  });
});
