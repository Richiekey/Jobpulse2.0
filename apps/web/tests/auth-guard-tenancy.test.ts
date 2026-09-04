import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthGuard } from '../lib/auth-guard';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';

describe('AuthGuard Multi-Tenant Tenancy Verification (Batch K)', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('requireOrgMember', () => {
    it('rejects invalid organization UUID with 400 Bad Request', async () => {
      const result = await AuthGuard.requireOrgMember('invalid-uuid');
      expect('errorResponse' in result).toBe(true);
      if ('errorResponse' in result) {
        expect(result.errorResponse.status).toBe(400);
      }
    });

    it('rejects unauthenticated caller with 401 Unauthorized', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('No session') }),
        },
      });

      const result = await AuthGuard.requireOrgMember(orgId);
      expect('errorResponse' in result).toBe(true);
      if ('errorResponse' in result) {
        expect(result.errorResponse.status).toBe(401);
      }
    });

    it('authorizes verified organization worker successfully', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'worker_1', email: 'worker@acme.com' } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'member_1',
              organization_id: orgId,
              user_id: 'worker_1',
              role: 'worker',
            },
            error: null,
          }),
        }),
      });

      const result = await AuthGuard.requireOrgMember(orgId);
      expect('membership' in result).toBe(true);
      if ('membership' in result) {
        expect(result.membership.role).toBe('worker');
        expect(result.organizationId).toBe(orgId);
      }
    });

    it('rejects user who is not a member of the organization with 403 Forbidden', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'outsider_1', email: 'stranger@other.com' } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { role: 'user' }, error: null }),
            };
          }
          return {} as any;
        }),
      });

      const result = await AuthGuard.requireOrgMember(orgId);
      expect('errorResponse' in result).toBe(true);
      if ('errorResponse' in result) {
        expect(result.errorResponse.status).toBe(403);
      }
    });
  });

  describe('requireOrgAdmin', () => {
    it('authorizes organization owner successfully', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'owner_1', email: 'boss@acme.com' } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'member_owner',
              organization_id: orgId,
              user_id: 'owner_1',
              role: 'owner',
            },
            error: null,
          }),
        }),
      });

      const result = await AuthGuard.requireOrgAdmin(orgId);
      expect('membership' in result).toBe(true);
      if ('membership' in result) {
        expect(result.membership.role).toBe('owner');
      }
    });

    it('authorizes organization admin successfully', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin_1', email: 'lead@acme.com' } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'member_admin',
              organization_id: orgId,
              user_id: 'admin_1',
              role: 'admin',
            },
            error: null,
          }),
        }),
      });

      const result = await AuthGuard.requireOrgAdmin(orgId);
      expect('membership' in result).toBe(true);
      if ('membership' in result) {
        expect(result.membership.role).toBe('admin');
      }
    });

    it('rejects worker trying to access admin endpoint with 403 Forbidden', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'worker_1', email: 'worker@acme.com' } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'member_worker',
              organization_id: orgId,
              user_id: 'worker_1',
              role: 'worker',
            },
            error: null,
          }),
        }),
      });

      const result = await AuthGuard.requireOrgAdmin(orgId);
      expect('errorResponse' in result).toBe(true);
      if ('errorResponse' in result) {
        expect(result.errorResponse.status).toBe(403);
      }
    });
  });
});
