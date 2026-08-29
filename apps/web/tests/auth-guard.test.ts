import { describe, it, expect, vi } from 'vitest';
import { AuthGuard } from '../lib/auth-guard';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';

describe('AuthGuard Server Security Verification (M02, M13)', () => {
  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Missing session') }),
      },
    });

    const result = await AuthGuard.requireAuthenticatedUser();
    expect('errorResponse' in result).toBe(true);
    if ('errorResponse' in result) {
      expect(result.errorResponse.status).toBe(401);
      const json = await result.errorResponse.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unauthorized');
    }
  });

  it('rejects non-admin users attempting admin operations with 403 Forbidden', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123', email: 'regular@user.com' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'user_123', role: 'user', email: 'regular@user.com' },
          error: null,
        }),
      }),
    });

    const result = await AuthGuard.requireAdmin();
    expect('errorResponse' in result).toBe(true);
    if ('errorResponse' in result) {
      expect(result.errorResponse.status).toBe(403);
      const json = await result.errorResponse.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    }
  });

  it('authorizes verified admin users successfully', async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'admin_999', email: 'admin@jobpulse.io' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'admin_999', role: 'admin', email: 'admin@jobpulse.io' },
          error: null,
        }),
      }),
    });

    const result = await AuthGuard.requireAdmin();
    expect('user' in result).toBe(true);
    if ('user' in result) {
      expect(result.user.id).toBe('admin_999');
      expect(result.profile.role).toBe('admin');
    }
  });
});
