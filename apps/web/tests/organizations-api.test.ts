import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getOrgs, POST as createOrg } from '../app/api/organizations/route';
import {
  GET as getMembers,
  POST as addMember,
  PATCH as updateMember,
  DELETE as deleteMember,
} from '../app/api/organizations/[id]/members/route';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';

describe('Organizations & Members API (Batch K)', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/organizations', () => {
    it('returns list of organizations caller belongs to', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user_1' } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                role: 'owner',
                created_at: '2026-09-01T00:00:00Z',
                organizations: {
                  id: orgId,
                  name: 'Staffing Pro',
                  slug: 'staffing-pro',
                  domain: 'staffing.com',
                  logo_url: null,
                  created_at: '2026-09-01T00:00:00Z',
                },
              },
            ],
            error: null,
          }),
        }),
      });

      const response = await getOrgs();
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].name).toBe('Staffing Pro');
      expect(json.data[0].membershipRole).toBe('owner');
    });
  });

  describe('POST /api/organizations', () => {
    it('creates organization and assigns caller as owner via RPC', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'creator_1' } },
            error: null,
          }),
        },
        rpc: vi.fn().mockResolvedValue({
          data: {
            id: orgId,
            name: 'New Agency',
            slug: 'new-agency',
            role: 'owner',
          },
          error: null,
        }),
      });

      const req = new NextRequest('http://localhost/api/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New Agency',
          slug: 'new-agency',
          domain: 'newagency.com',
        }),
      });

      const response = await createOrg(req);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.slug).toBe('new-agency');
      expect(json.data.role).toBe('owner');
    });

    it('rejects duplicate slug with 409 Conflict', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'creator_1' } },
            error: null,
          }),
        },
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: new Error('CONFLICT: Organization slug is already in use.'),
        }),
      });

      const req = new NextRequest('http://localhost/api/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Duplicate Agency',
          slug: 'duplicate-agency',
        }),
      });

      const response = await createOrg(req);
      expect(response.status).toBe(409);
    });
  });

  describe('GET /api/organizations/[id]/members', () => {
    it('returns organization members with profile details for verified members', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user_1' } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === 'organization_id' && val === orgId) {
                  return {
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: 'm1', organization_id: orgId, user_id: 'user_1', role: 'admin' },
                        error: null,
                      }),
                    }),
                    order: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: 'm1',
                          organization_id: orgId,
                          user_id: 'user_1',
                          role: 'admin',
                          created_at: '2026-09-01T00:00:00Z',
                          profiles: { email: 'admin@acme.com', full_name: 'Admin Joe' },
                        },
                      ],
                      error: null,
                    }),
                  };
                }
                return {} as any;
              }),
            };
          }
          return {} as any;
        }),
      });

      const req = new NextRequest(`http://localhost/api/organizations/${orgId}/members`);
      const response = await getMembers(req, { params: Promise.resolve({ id: orgId }) });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data[0].fullName).toBe('Admin Joe');
    });
  });

  describe('POST /api/organizations/[id]/members', () => {
    it('allows admin to add new member by userId', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin_1' } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'm_admin', organization_id: orgId, user_id: 'admin_1', role: 'admin' },
                    error: null,
                  }),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'new_m',
                      organization_id: orgId,
                      user_id: '22222222-2222-2222-2222-222222222222',
                      role: 'worker',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        }),
      });

      const req = new NextRequest(`http://localhost/api/organizations/${orgId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          userId: '22222222-2222-2222-2222-222222222222',
          role: 'worker',
        }),
      });

      const response = await addMember(req, { params: Promise.resolve({ id: orgId }) });
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.role).toBe('worker');
    });
  });
});
