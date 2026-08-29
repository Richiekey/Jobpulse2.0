import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as applyRoute } from '../app/api/jobs/[id]/apply/route';
import * as serverClient from '../lib/supabase/server';

describe('Outbound Application Dispatch & Destination Intelligence (S19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid UUID job identifiers with 400 Bad Request', async () => {
    const req = new NextRequest('http://localhost:3000/api/jobs/invalid-id/apply');
    const res = await applyRoute(req, { params: Promise.resolve({ id: 'invalid-id' }) });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain('Invalid job identifier');
  });

  it('returns 404 if the job is not found', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          }),
        }),
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    };

    vi.spyOn(serverClient, 'createClient').mockResolvedValue(mockSupabase as any);

    const req = new NextRequest('http://localhost:3000/api/jobs/00000000-0000-0000-0000-000000000001/apply');
    const res = await applyRoute(req, {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
    });
    expect(res.status).toBe(404);
  });

  it('blocks unsafe SSRF target URLs and returns 400 Bad Request', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: '00000000-0000-0000-0000-000000000001',
                apply_url: 'http://169.254.169.254/latest/meta-data',
                canonical_url: 'http://169.254.169.254/latest/meta-data',
                url_resolution_confidence: 1.0,
              },
              error: null,
            }),
          }),
        }),
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    };

    vi.spyOn(serverClient, 'createClient').mockResolvedValue(mockSupabase as any);

    const req = new NextRequest('http://localhost:3000/api/jobs/00000000-0000-0000-0000-000000000001/apply');
    const res = await applyRoute(req, {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
    });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain('Unsafe application destination URL');
  });

  it('records outbound click telemetry and returns 302 redirect to original ATS URL', async () => {
    const mockInsert = vi.fn().mockReturnValue(Promise.resolve({ error: null }));
    const mockUpsert = vi.fn().mockReturnValue(Promise.resolve({ error: null }));

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'jobs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: '00000000-0000-0000-0000-000000000001',
                    display_title: 'Staff Security Engineer',
                    apply_url: 'https://jobs.lever.co/stripe/staff-sec/apply',
                    canonical_url: 'https://jobs.lever.co/stripe/staff-sec',
                    url_resolution_confidence: 1.0,
                    companies: { name: 'Stripe' },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'outbound_clicks') {
          return { insert: mockInsert };
        }
        if (table === 'applications') {
          return { upsert: mockUpsert };
        }
        return {};
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr_100' } } }),
      },
    };

    vi.spyOn(serverClient, 'createClient').mockResolvedValue(mockSupabase as any);

    const req = new NextRequest('http://localhost:3000/api/jobs/00000000-0000-0000-0000-000000000001/apply', {
      headers: {
        'user-agent': 'Mozilla/5.0 TestBrowser',
        referer: 'https://jobpulse.ai/search',
      },
    });

    const res = await applyRoute(req, {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://jobs.lever.co/stripe/staff-sec/apply');

    // Verify telemetry logged
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      job_id: '00000000-0000-0000-0000-000000000001',
      user_id: 'usr_100',
      destination_url: 'https://jobs.lever.co/stripe/staff-sec/apply',
      user_agent: 'Mozilla/5.0 TestBrowser',
    }));

    // Verify application auto-logged
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'usr_100',
        job_id: '00000000-0000-0000-0000-000000000001',
        company_name: 'Stripe',
        status: 'applied',
      }),
      expect.anything()
    );
  });
});
