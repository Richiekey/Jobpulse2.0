import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getAlertsRoute, POST as createAlertRoute } from '../app/api/alerts/route';
import { PATCH as updateAlertRoute, DELETE as deleteAlertRoute } from '../app/api/alerts/[id]/route';
import { GET as getDeliveriesRoute } from '../app/api/alerts/deliveries/route';
import { AuthGuard } from '../lib/auth-guard';

describe('Job Alerts API — Security, Validation & Ownership (Batch G Remediation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validUser = {
    id: 'user_test_999',
    email: 'farmer@jobpulse.io',
  };

  describe('Authorization Safeguards', () => {
    it('rejects unauthenticated requests to GET /api/alerts with 401 Unauthorized', async () => {
      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) as any,
      });

      const res = await getAlertsRoute(new NextRequest('http://localhost:3000/api/alerts'));
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated requests to POST /api/alerts with 401 Unauthorized', async () => {
      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) as any,
      });

      const req = new NextRequest('http://localhost:3000/api/alerts', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Alert' }),
      });

      const res = await createAlertRoute(req);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/alerts (Creation & SSRF Validation)', () => {
    it('creates a valid email job alert with 201 Created', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'alert_new_1',
                  user_id: validUser.id,
                  title: 'Staff React Engineer',
                  query: 'React',
                  frequency: 'daily',
                  channel: 'email',
                  is_active: true,
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        user: validUser as any,
        supabase: mockSupabase as any,
      });

      const req = new NextRequest('http://localhost:3000/api/alerts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Staff React Engineer',
          query: 'React',
          frequency: 'daily',
          channel: 'email',
        }),
      });

      const res = await createAlertRoute(req);
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.data.alert.id).toBe('alert_new_1');
      expect(json.data.alert.title).toBe('Staff React Engineer');
    });

    it('creates a valid webhook alert when URL is safe HTTPS endpoint', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'alert_webhook_1',
                  user_id: validUser.id,
                  title: 'Webhook Alert',
                  channel: 'webhook',
                  webhook_url: 'https://api.externalapp.com/webhook',
                  is_active: true,
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        user: validUser as any,
        supabase: mockSupabase as any,
      });

      const req = new NextRequest('http://localhost:3000/api/alerts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Webhook Alert',
          channel: 'webhook',
          webhookUrl: 'https://api.externalapp.com/webhook',
        }),
      });

      const res = await createAlertRoute(req);
      expect(res.status).toBe(201);
    });

    it('rejects webhook alert creation with forbidden SSRF URL (localhost / metadata)', async () => {
      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        user: validUser as any,
        supabase: {} as any,
      });

      const req = new NextRequest('http://localhost:3000/api/alerts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Local Webhook Alert',
          channel: 'webhook',
          webhookUrl: 'http://localhost:8080/hook', // Loopback SSRF attack
        }),
      });

      const res = await createAlertRoute(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('Invalid webhook URL');
    });
  });

  describe('PATCH /api/alerts/[id] (SSRF Validation & Ownership Security)', () => {
    it('rejects unsafe webhookUrl during PATCH with 400 Bad Request', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'alert_1', user_id: validUser.id, channel: 'webhook', webhook_url: 'https://safe.com/hook' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };

      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        user: validUser as any,
        supabase: mockSupabase as any,
      });

      const req = new NextRequest('http://localhost:3000/api/alerts/alert_1', {
        method: 'PATCH',
        body: JSON.stringify({ webhookUrl: 'http://169.254.169.254/latest/meta-data' }), // SSRF bypass attempt
      });

      const res = await updateAlertRoute(req, { params: Promise.resolve({ id: 'alert_1' }) });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('Invalid webhook URL');
    });

    it('updates safe webhookUrl during PATCH with 200 OK', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'alert_1', user_id: validUser.id, channel: 'webhook', webhook_url: 'https://old.com/hook' },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'alert_1', user_id: validUser.id, channel: 'webhook', webhook_url: 'https://new-safe.com/hook' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      };

      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        user: validUser as any,
        supabase: mockSupabase as any,
      });

      const req = new NextRequest('http://localhost:3000/api/alerts/alert_1', {
        method: 'PATCH',
        body: JSON.stringify({ webhookUrl: 'https://new-safe.com/hook' }),
      });

      const res = await updateAlertRoute(req, { params: Promise.resolve({ id: 'alert_1' }) });
      expect(res.status).toBe(200);
    });

    it('rejects update on non-existent or cross-user alert with 404 Not Found', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null, // Cross-user or nonexistent
                  error: { message: 'Row not found' },
                }),
              }),
            }),
          }),
        }),
      };

      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        user: validUser as any,
        supabase: mockSupabase as any,
      });

      const req = new NextRequest('http://localhost:3000/api/alerts/other_user_alert', {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      });

      const res = await updateAlertRoute(req, { params: Promise.resolve({ id: 'other_user_alert' }) });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/alerts/[id]', () => {
    it('deletes an owned alert successfully with 200 OK', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [{ id: 'alert_1' }], error: null }),
              }),
            }),
          }),
        }),
      };

      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        user: validUser as any,
        supabase: mockSupabase as any,
      });

      const req = new NextRequest('http://localhost:3000/api/alerts/alert_1', {
        method: 'DELETE',
      });

      const res = await deleteAlertRoute(req, { params: Promise.resolve({ id: 'alert_1' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.id).toBe('alert_1');
    });

    it('returns 404 when deleting an alert belonging to another user', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [], error: null }), // No rows matched user_id
              }),
            }),
          }),
        }),
      };

      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        user: validUser as any,
        supabase: mockSupabase as any,
      });

      const req = new NextRequest('http://localhost:3000/api/alerts/foreign_alert', {
        method: 'DELETE',
      });

      const res = await deleteAlertRoute(req, { params: Promise.resolve({ id: 'foreign_alert' }) });
      expect(res.status).toBe(404);
    });
  });
});
