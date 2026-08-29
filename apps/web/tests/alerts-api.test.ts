import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getAlertsRoute, POST as createAlertRoute } from '../app/api/alerts/route';
import { PATCH as updateAlertRoute, DELETE as deleteAlertRoute } from '../app/api/alerts/[id]/route';
import { GET as getDeliveriesRoute } from '../app/api/alerts/deliveries/route';
import { AuthGuard } from '../lib/auth-guard';

describe('Job Alerts API (Batch G)', () => {
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

      const res = await getAlertsRoute();
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

    it('rejects webhook alert creation with forbidden SSRF URL', async () => {
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

    it('rejects invalid payload with 400 Bad Request', async () => {
      vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
        user: validUser as any,
        supabase: {} as any,
      });

      const req = new NextRequest('http://localhost:3000/api/alerts', {
        method: 'POST',
        body: JSON.stringify({ title: 'A' }), // Title too short
      });

      const res = await createAlertRoute(req);
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH & DELETE /api/alerts/[id]', () => {
    it('updates alert status successfully', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'alert_1', is_active: false },
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
        body: JSON.stringify({ isActive: false }),
      });

      const res = await updateAlertRoute(req, { params: Promise.resolve({ id: 'alert_1' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.alert.is_active).toBe(false);
    });

    it('deletes an alert successfully', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
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
  });

  describe('GET /api/alerts/deliveries', () => {
    it('returns delivery history for authenticated user', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'del_1',
                      alert_id: 'alert_1',
                      channel: 'email',
                      status: 'sent',
                      matched_job_ids: ['job_1', 'job_2'],
                    },
                  ],
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

      const req = new NextRequest('http://localhost:3000/api/alerts/deliveries');
      const res = await getDeliveriesRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.deliveries).toHaveLength(1);
      expect(json.data.deliveries[0].status).toBe('sent');
    });
  });
});
