import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET as getApplicationEvents,
  POST as postApplicationEvent,
} from '../app/api/applications/[id]/events/route';
import {
  PATCH as patchApplication,
  DELETE as deleteApplication,
} from '../app/api/applications/[id]/route';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';

describe('Application Events & CRM API (Batch L)', () => {
  const appId = '11111111-1111-1111-1111-111111111111';
  const orgId = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';
  const otherUserId = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/applications/[id]/events', () => {
    it('returns 400 for invalid UUID', async () => {
      const req = new NextRequest('http://localhost/api/applications/invalid-uuid/events');
      const res = await getApplicationEvents(req, { params: Promise.resolve({ id: 'invalid-uuid' }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('valid UUID');
    });

    it('returns 401 when user is not authenticated', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: new Error('Unauthorized'),
          }),
        },
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/events`);
      const res = await getApplicationEvents(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it('returns 404 when application does not exist or caller has no access', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/events`);
      const res = await getApplicationEvents(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('returns 200 with chronological events and actor enrichment', async () => {
      const mockApp = {
        id: appId,
        user_id: userId,
        organization_id: orgId,
      };

      const mockEvents = [
        {
          id: 'evt-1',
          application_id: appId,
          organization_id: orgId,
          actor_id: userId,
          event_type: 'created',
          from_status: null,
          to_status: 'applied',
          metadata: { company: 'Google' },
          created_at: '2026-09-04T10:00:00Z',
        },
        {
          id: 'evt-2',
          application_id: appId,
          organization_id: orgId,
          actor_id: userId,
          event_type: 'status_changed',
          from_status: 'applied',
          to_status: 'screening',
          metadata: { notes: 'Passed resume filter' },
          created_at: '2026-09-04T11:00:00Z',
        },
      ];

      const mockProfiles = [
        {
          id: userId,
          email: 'worker@example.com',
          full_name: 'Test Worker',
          avatar_url: 'https://example.com/avatar.png',
        },
      ];

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockApp,
                error: null,
              }),
            };
          }
          if (table === 'application_events') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              range: vi.fn().mockResolvedValue({
                data: mockEvents,
                error: null,
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: mockProfiles,
                error: null,
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/events`);
      const res = await getApplicationEvents(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
      expect(json.data[0].eventType).toBe('created');
      expect(json.data[1].eventType).toBe('status_changed');
      expect(json.data[0].actor?.email).toBe('worker@example.com');
      expect(json.data[0].actor?.fullName).toBe('Test Worker');
    });
  });

  describe('POST /api/applications/[id]/events', () => {
    it('returns 400 when note content is empty', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: appId, user_id: userId, organization_id: null, status: 'applied' },
            error: null,
          }),
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: '   ' }),
      });

      const res = await postApplicationEvent(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Note content cannot be empty');
    });

    it('rejects client attempts to directly fabricate lifecycle events like status_changed or assigned', async () => {
      const mockApp = {
        id: appId,
        user_id: userId,
        organization_id: orgId,
        status: 'applied',
      };

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: mockApp,
            error: null,
          }),
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'status_changed',
          note: 'Fabricated interview status',
        }),
      });

      const res = await postApplicationEvent(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Authoritative lifecycle events');
    });

    it('returns 201 when adding a CRM note event', async () => {
      const mockApp = {
        id: appId,
        user_id: userId,
        organization_id: orgId,
        status: 'screening',
      };

      const mockCreatedEvent = {
        id: 'evt-3',
        application_id: appId,
        organization_id: orgId,
        actor_id: userId,
        actor_type: 'user',
        event_type: 'note_added',
        from_status: 'screening',
        to_status: 'screening',
        metadata: { note: 'Called candidate for screening interview' },
        created_at: '2026-09-04T12:00:00Z',
      };

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockApp,
                error: null,
              }),
            };
          }
          if (table === 'application_events') {
            return {
              insert: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: mockCreatedEvent,
                error: null,
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'note_added',
          note: 'Called candidate for screening interview',
        }),
      });

      const res = await postApplicationEvent(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.eventType).toBe('note_added');
      expect(json.data.metadata.note).toBe('Called candidate for screening interview');
    });
  });

  describe('PATCH /api/applications/[id] Authorization & CRM updates', () => {
    it('allows an organization admin to update application status and notes', async () => {
      const mockUpdated = {
        id: appId,
        organization_id: orgId,
        status: 'interview',
        notes: 'Interview scheduled',
        updated_at: '2026-09-04T13:00:00Z',
      };

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'applications') {
            return {
              update: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: mockUpdated,
                error: null,
              }),
            };
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}?organizationId=${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'interview',
          notes: 'Interview scheduled',
        }),
      });

      const res = await patchApplication(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('interview');
    });

    it('rejects update if caller is neither owner nor org admin', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { role: 'worker' }, // worker is NOT org admin!
                error: null,
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}?organizationId=${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'interview',
        }),
      });

      const res = await patchApplication(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
    });
  });
});
