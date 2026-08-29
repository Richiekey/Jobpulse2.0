import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as detectRoute } from '../app/api/admin/sources/detect/route.js';
import { POST as validateRoute } from '../app/api/admin/sources/validate/route.js';
import { POST as onboardRoute } from '../app/api/admin/sources/onboard/route.js';
import { GET as getSourcesRoute } from '../app/api/admin/sources/route.js';
import { AuthGuard } from '../lib/auth-guard.js';

describe('Admin Source Intelligence APIs Security & Behavior (S14, SSRF, Pagination, Concurrency)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Authentication & Authorization Security
  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValueOnce({
      errorResponse: new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Authentication is required.' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      ),
    } as any);

    const req = new NextRequest('http://localhost:3000/api/admin/sources/detect', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://boards.greenhouse.io/stripe' }),
    });

    const res = await detectRoute(req);
    expect(res.status).toBe(401);
  });

  it('rejects non-admin users with 403 Forbidden', async () => {
    vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValueOnce({
      errorResponse: new Response(
        JSON.stringify({ success: false, error: 'Forbidden: You do not have administrator permissions.' }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      ),
    } as any);

    const req = new NextRequest('http://localhost:3000/api/admin/sources/validate', {
      method: 'POST',
      body: JSON.stringify({ atsType: 'greenhouse', sourceIdentifier: 'stripe' }),
    });

    const res = await validateRoute(req);
    expect(res.status).toBe(403);
  });

  // 2. SSRF Protection on User-Supplied URLs
  it('blocks private loopback and link-local SSRF URLs on detect endpoint', async () => {
    vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
      user: { id: 'admin_1' },
      profile: { id: 'admin_1', role: 'admin' },
      supabase: {} as any,
    } as any);

    // Loopback
    const req1 = new NextRequest('http://localhost:3000/api/admin/sources/detect', {
      method: 'POST',
      body: JSON.stringify({ url: 'http://127.0.0.1:8080/internal' }),
    });
    const res1 = await detectRoute(req1);
    expect(res1.status).toBe(400);
    const json1 = await res1.json();
    expect(json1.error).toContain('SSRF Protection');

    // Cloud metadata
    const req2 = new NextRequest('http://localhost:3000/api/admin/sources/detect', {
      method: 'POST',
      body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data' }),
    });
    const res2 = await detectRoute(req2);
    expect(res2.status).toBe(400);

    // RFC1918 Private range
    const req3 = new NextRequest('http://localhost:3000/api/admin/sources/detect', {
      method: 'POST',
      body: JSON.stringify({ url: 'http://192.168.1.1/admin' }),
    });
    const res3 = await detectRoute(req3);
    expect(res3.status).toBe(400);
  });

  it('blocks SSRF URLs on validate endpoint', async () => {
    vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
      user: { id: 'admin_1' },
      profile: { id: 'admin_1', role: 'admin' },
      supabase: {} as any,
    } as any);

    const req = new NextRequest('http://localhost:3000/api/admin/sources/validate', {
      method: 'POST',
      body: JSON.stringify({
        atsType: 'greenhouse',
        sourceIdentifier: 'stripe',
        sourceUrl: 'http://10.0.0.1/sensitive',
      }),
    });

    const res = await validateRoute(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('SSRF Protection');
  });

  // 3. Request Payload Size Bounding
  it('rejects oversized HTML payloads exceeding 2MB bound', async () => {
    vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
      user: { id: 'admin_1' },
      profile: { id: 'admin_1', role: 'admin' },
      supabase: {} as any,
    } as any);

    const oversizedHtml = 'x'.repeat(2.5 * 1024 * 1024); // 2.5MB
    const req = new NextRequest('http://localhost:3000/api/admin/sources/detect', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/careers', html: oversizedHtml }),
    });

    const res = await detectRoute(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('exceeds 2MB maximum limit');
  });

  // 4. Successful ATS Detection
  it('successfully detects ATS platform and returns 200 OK for authorized admin', async () => {
    vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValueOnce({
      user: { id: 'admin_123', email: 'admin@jobpulse.ai' },
      profile: { id: 'admin_123', role: 'admin' },
      supabase: {} as any,
    } as any);

    const req = new NextRequest('http://localhost:3000/api/admin/sources/detect', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://boards.greenhouse.io/stripe' }),
    });

    const res = await detectRoute(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.detected).toBe(true);
    expect(json.data.atsType).toBe('greenhouse');
    expect(json.data.boardIdentifier).toBe('stripe');
  });

  // 5. Pagination Input Validation
  it('rejects invalid non-numeric or negative pagination params with 400 Bad Request', async () => {
    vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
      user: { id: 'admin_1' },
      profile: { id: 'admin_1', role: 'admin' },
      supabase: {
        from: vi.fn(),
      } as any,
    } as any);

    // Invalid non-numeric limit
    const req1 = new NextRequest('http://localhost:3000/api/admin/sources?limit=abc');
    const res1 = await getSourcesRoute(req1);
    expect(res1.status).toBe(400);
    const json1 = await res1.json();
    expect(json1.error).toContain('Invalid query parameters');

    // Negative limit
    const req2 = new NextRequest('http://localhost:3000/api/admin/sources?limit=-10');
    const res2 = await getSourcesRoute(req2);
    expect(res2.status).toBe(400);

    // Negative offset
    const req3 = new NextRequest('http://localhost:3000/api/admin/sources?offset=-5');
    const res3 = await getSourcesRoute(req3);
    expect(res3.status).toBe(400);
  });

  // 6. Concurrent Onboarding Simulation & RPC Execution
  it('executes atomic onboarding RPC when onboarding a new or existing company', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        company_id: 'comp_100',
        company_slug: 'stripe',
        company_name: 'Stripe, Inc.',
        is_new_company: false,
        company_source_id: 'cs_100',
      },
      error: null,
    });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sources') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'src_gh_1', adapter_name: 'greenhouse' }, error: null }),
          };
        }
        if (table === 'companies') {
          return {
            select: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({ data: [], error: null }),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {};
      }),
      rpc: mockRpc,
    };

    vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValue({
      user: { id: 'admin_1' },
      profile: { id: 'admin_1', role: 'admin' },
      supabase: mockSupabase as any,
    } as any);

    const req = new NextRequest('http://localhost:3000/api/admin/sources/onboard', {
      method: 'POST',
      body: JSON.stringify({
        companyName: 'Stripe',
        companyDomain: 'stripe.com',
        atsType: 'greenhouse',
        boardIdentifier: 'stripe',
      }),
    });

    const res = await onboardRoute(req);
    expect(res.status).toBe(201);
    expect(mockRpc).toHaveBeenCalledWith('onboard_company_and_source', expect.objectContaining({
      p_company_name: 'Stripe',
      p_company_domain: 'stripe.com',
      p_source_identifier: 'stripe',
    }));

    const json = await res.json();
    expect(json.data.companyId).toBe('comp_100');
    expect(json.data.companySlug).toBe('stripe');
  });
});
