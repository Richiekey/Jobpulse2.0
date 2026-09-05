import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getAdminVerifications } from '../app/api/admin/verifications/route';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';

describe('Admin Verifications Review Queue API (Batch Q)', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const adminId = 'admin_user_id';
  const workerId = '22222222-2222-2222-2222-222222222222';
  const appId = '33333333-3333-3333-3333-333333333333';
  const verifId = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Not logged in' },
        }),
      },
    });

    const req = new NextRequest(`http://localhost/api/admin/verifications?organizationId=${orgId}`);
    const response = await getAdminVerifications(req);
    expect(response.status).toBe(401);
  });

  it('returns 400 when organizationId is missing for non-platform admin', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: adminId } },
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

    const req = new NextRequest('http://localhost/api/admin/verifications');
    const response = await getAdminVerifications(req);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('organizationId query parameter is required');
  });

  it('returns 400 when organizationId format is invalid', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: adminId } },
          error: null,
        }),
      },
    });

    const req = new NextRequest('http://localhost/api/admin/verifications?organizationId=invalid-uuid');
    const response = await getAdminVerifications(req);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('Invalid organizationId format');
  });

  it('returns 403 when user is neither an org admin nor platform admin', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'worker_user_id' } },
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
                    data: { role: 'worker' }, // Worker, not admin
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

    const req = new NextRequest(`http://localhost/api/admin/verifications?organizationId=${orgId}`);
    const response = await getAdminVerifications(req);
    expect(response.status).toBe(403);
  });

  it('returns 200 with formatted verifications, application context, and signed URLs', async () => {
    const mockSignedUrl = 'https://storage.supabase.co/signed/verification-screenshots/evidence.png?token=mocktoken';
    const createSignedUrlMock = vi.fn().mockResolvedValue({
      data: { signedUrl: mockSignedUrl },
      error: null,
    });

    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: adminId } },
          error: null,
        }),
      },
      storage: {
        from: vi.fn().mockImplementation((bucket: string) => {
          if (bucket === 'verification-screenshots') {
            return {
              createSignedUrl: createSignedUrlMock,
            };
          }
          return {} as any;
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === 'role') {
                return {
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { role: 'user' },
                      error: null,
                    }),
                  }),
                };
              }
              return {
                in: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: workerId,
                      email: 'worker@acme.com',
                      full_name: 'Alice Worker',
                      avatar_url: 'https://avatar.png',
                    },
                  ],
                  error: null,
                }),
              };
            }),
          };
        }
        if (table === 'organization_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { role: 'admin' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'application_verifications') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                const chain: any = {
                  eq: vi.fn().mockImplementation(() => chain),
                  order: vi.fn().mockImplementation(() => ({
                    range: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: verifId,
                          application_id: appId,
                          organization_id: orgId,
                          worker_id: workerId,
                          screenshot_url: `verification-screenshots/${orgId}/${appId}/evidence.png`,
                          status: 'pending',
                          reviewer_id: null,
                          reviewer_notes: null,
                          reviewed_at: null,
                          created_at: '2026-09-02T12:00:00Z',
                          updated_at: '2026-09-02T12:00:00Z',
                          applications: {
                            id: appId,
                            company_name: 'Stripe',
                            job_title: 'Staff Engineer',
                            status: 'applied',
                            applied_at: '2026-09-02T11:00:00Z',
                            notes: 'Applied via Greenhouse',
                            user_id: workerId,
                            worker_id: workerId,
                            verification_status: 'pending',
                          },
                        },
                      ],
                      count: 1,
                      error: null,
                    }),
                  })),
                };
                return chain;
              }),
            }),
          };
        }
        return {} as any;
      }),
    });

    const req = new NextRequest(`http://localhost/api/admin/verifications?organizationId=${orgId}&status=pending`);
    const response = await getAdminVerifications(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.count).toBe(1);
    expect(json.data.verifications).toHaveLength(1);

    const v = json.data.verifications[0];
    expect(v.id).toBe(verifId);
    expect(v.status).toBe('pending');
    expect(v.signedUrl).toBe(mockSignedUrl);
    expect(v.hasScreenshot).toBe(true);
    expect(v.application.companyName).toBe('Stripe');
    expect(v.application.jobTitle).toBe('Staff Engineer');
    expect(v.worker.fullName).toBe('Alice Worker');
    expect(createSignedUrlMock).toHaveBeenCalledWith(`${orgId}/${appId}/evidence.png`, 3600);
  });
});
