import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as applyGetRoute, POST as applyPostRoute } from '../app/api/jobs/[id]/apply/route';
import * as serverClient from '../lib/supabase/server';

describe('Outbound Application Dispatch & Destination Intelligence (P0, P1, S19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Validation & SSRF Security
  it('rejects invalid UUID job identifiers with 400 Bad Request', async () => {
    const req = new NextRequest('http://localhost:3000/api/jobs/invalid-id/apply');
    const res = await applyGetRoute(req, { params: Promise.resolve({ id: 'invalid-id' }) });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain('Invalid job identifier');
  });

  it('returns 404 if the job is not found or inactive', async () => {
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
    const res = await applyGetRoute(req, {
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
    const res = await applyGetRoute(req, {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
    });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain('Unsafe application destination URL');
  });

  // 2. HARD INVARIANT: GET requests MUST NOT cause durable state mutation in applications table
  it('HARD INVARIANT: GET request resolves destination WITHOUT mutating applications table', async () => {
    const mockApplicationMutation = vi.fn();
    const mockTelemetryInsert = vi.fn().mockReturnValue(Promise.resolve({ error: null }));

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
          return { insert: mockTelemetryInsert };
        }
        if (table === 'applications') {
          return {
            upsert: mockApplicationMutation,
            insert: mockApplicationMutation,
            update: mockApplicationMutation,
          };
        }
        return {};
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr_100' } } }),
      },
    };

    vi.spyOn(serverClient, 'createClient').mockResolvedValue(mockSupabase as any);

    const req = new NextRequest('http://localhost:3000/api/jobs/00000000-0000-0000-0000-000000000001/apply', {
      method: 'GET',
    });

    const res = await applyGetRoute(req, {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://jobs.lever.co/stripe/staff-sec/apply');

    // Telemetry was recorded
    expect(mockTelemetryInsert).toHaveBeenCalledTimes(1);

    // Hard Invariant: Zero mutation on applications table!
    expect(mockApplicationMutation).not.toHaveBeenCalled();
  });

  // 3. POST Application Dispatch Lifecycle Transitions (P0 / P1)
  describe('POST Application Dispatch Lifecycle Transitions', () => {
    function setupMockSupabase(existingApp: any) {
      const mockUpsert = vi.fn().mockImplementation((payload: any) => ({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'app_1', ...payload },
            error: null,
          }),
        }),
      }));

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
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: existingApp,
                      error: null,
                    }),
                  }),
                }),
              }),
              upsert: mockUpsert,
            };
          }
          if (table === 'outbound_clicks') {
            return { insert: vi.fn().mockReturnValue(Promise.resolve({ error: null })) };
          }
          return {};
        }),
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr_100' } } }),
        },
      };

      vi.spyOn(serverClient, 'createClient').mockResolvedValue(mockSupabase as any);
      return { mockUpsert };
    }

    it('new application: creates record with status = applied', async () => {
      const { mockUpsert } = setupMockSupabase(null);

      const req = new NextRequest('http://localhost:3000/api/jobs/00000000-0000-0000-0000-000000000001/apply', {
        method: 'POST',
        headers: { accept: 'application/json' },
      });

      const res = await applyPostRoute(req, {
        params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
      });

      expect(res.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'usr_100',
          job_id: '00000000-0000-0000-0000-000000000001',
          status: 'applied',
        }),
        { onConflict: 'user_id, job_id' }
      );
    });

    it('saved application: advances status from saved to applied', async () => {
      const { mockUpsert } = setupMockSupabase({ id: 'app_1', status: 'saved' });

      const req = new NextRequest('http://localhost:3000/api/jobs/00000000-0000-0000-0000-000000000001/apply', {
        method: 'POST',
        headers: { accept: 'application/json' },
      });

      const res = await applyPostRoute(req, {
        params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
      });

      expect(res.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'applied' }),
        { onConflict: 'user_id, job_id' }
      );
    });

    it('applied application: idempotent dispatch maintains applied status', async () => {
      const { mockUpsert } = setupMockSupabase({ id: 'app_1', status: 'applied' });

      const req = new NextRequest('http://localhost:3000/api/jobs/00000000-0000-0000-0000-000000000001/apply', {
        method: 'POST',
        headers: { accept: 'application/json' },
      });

      const res = await applyPostRoute(req, {
        params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
      });

      expect(res.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'applied' }),
        { onConflict: 'user_id, job_id' }
      );
    });

    it('HARD INVARIANT: screening application NEVER regresses to applied', async () => {
      const { mockUpsert } = setupMockSupabase({ id: 'app_1', status: 'screening' });

      const req = new NextRequest('http://localhost:3000/api/jobs/00000000-0000-0000-0000-000000000001/apply', {
        method: 'POST',
        headers: { accept: 'application/json' },
      });

      const res = await applyPostRoute(req, {
        params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
      });

      expect(res.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'screening' }),
        { onConflict: 'user_id, job_id' }
      );
    });

    it('HARD INVARIANT: interview application NEVER regresses to applied', async () => {
      const { mockUpsert } = setupMockSupabase({ id: 'app_1', status: 'interview' });

      const req = new NextRequest('http://localhost:3000/api/jobs/00000000-0000-0000-0000-000000000001/apply', {
        method: 'POST',
        headers: { accept: 'application/json' },
      });

      const res = await applyPostRoute(req, {
        params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
      });

      expect(res.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'interview' }),
        { onConflict: 'user_id, job_id' }
      );
    });

    it('HARD INVARIANT: offer application NEVER regresses to applied', async () => {
      const { mockUpsert } = setupMockSupabase({ id: 'app_1', status: 'offer' });

      const req = new NextRequest('http://localhost:3000/api/jobs/00000000-0000-0000-0000-000000000001/apply', {
        method: 'POST',
        headers: { accept: 'application/json' },
      });

      const res = await applyPostRoute(req, {
        params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
      });

      expect(res.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'offer' }),
        { onConflict: 'user_id, job_id' }
      );
    });

    it('handles persistence failures reliably by failing the request with 500', async () => {
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
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
              upsert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Database connection failed' },
                  }),
                }),
              }),
            };
          }
          return {};
        }),
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr_100' } } }),
        },
      };

      vi.spyOn(serverClient, 'createClient').mockResolvedValue(mockSupabase as any);

      const req = new NextRequest('http://localhost:3000/api/jobs/00000000-0000-0000-0000-000000000001/apply', {
        method: 'POST',
      });

      const res = await applyPostRoute(req, {
        params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toContain('Failed to record application lifecycle state');
    });
  });
});
