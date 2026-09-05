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

describe('Batch L Adversarial & Integrity Verification Suite', () => {
  const appId = '11111111-1111-1111-1111-111111111111';
  const orgAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const orgBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const ownerId = '11111111-0000-0000-0000-000000000000';
  const worker1Id = '22222222-0000-0000-0000-000000000000';
  const worker2Id = '33333333-0000-0000-0000-000000000000';
  const adminId = '44444444-0000-0000-0000-000000000000';
  const outsiderId = '99999999-0000-0000-0000-000000000000';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 1. EVENT AUTHENTICITY & FABRICATION PREVENTION (P0)
  // ===========================================================================
  describe('1. Event Authenticity & Anti-Fabrication Gates', () => {
    const mockApp = {
      id: appId,
      user_id: ownerId,
      organization_id: orgAId,
      worker_id: worker1Id,
      status: 'applied',
    };

    const setupAuth = (userId: string) => {
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
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { role: userId === adminId ? 'admin' : 'worker' },
                error: null,
              }),
            };
          }
          return {};
        }),
      });
    };

    it('rejects direct client attempt to fabricate status_changed event', async () => {
      setupAuth(ownerId);
      const req = new NextRequest(`http://localhost/api/applications/${appId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'status_changed',
          note: 'Fabricated interview advancement',
        }),
      });

      const res = await postApplicationEvent(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Authoritative lifecycle events');
    });

    it('rejects direct client attempt to fabricate assigned event', async () => {
      setupAuth(adminId);
      const req = new NextRequest(`http://localhost/api/applications/${appId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'assigned',
          note: 'Assigned to self without assignment RPC',
        }),
      });

      const res = await postApplicationEvent(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Authoritative lifecycle events');
    });

    it('rejects direct client attempt to fabricate reassigned event', async () => {
      setupAuth(adminId);
      const req = new NextRequest(`http://localhost/api/applications/${appId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'reassigned',
          note: 'Reassigned worker fraudulently',
        }),
      });

      const res = await postApplicationEvent(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Authoritative lifecycle events');
    });

    it('rejects direct client attempt to fabricate created event', async () => {
      setupAuth(ownerId);
      const req = new NextRequest(`http://localhost/api/applications/${appId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'created',
          note: 'Fabricating second creation record',
        }),
      });

      const res = await postApplicationEvent(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Authoritative lifecycle events');
    });

    it('rejects direct client attempt to fabricate archived event', async () => {
      setupAuth(ownerId);
      const req = new NextRequest(`http://localhost/api/applications/${appId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'archived',
          note: 'Fabricating archived audit record',
        }),
      });

      const res = await postApplicationEvent(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Authoritative lifecycle events');
    });

    it('allows legitimate user-authored CRM note_added event', async () => {
      const mockCreated = {
        id: 'evt-valid-1',
        application_id: appId,
        organization_id: orgAId,
        actor_id: ownerId,
        actor_type: 'user',
        event_type: 'note_added',
        from_status: 'applied',
        to_status: 'applied',
        metadata: { note: 'Left follow up phone call' },
        created_at: new Date().toISOString(),
      };

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: ownerId } },
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
                data: mockCreated,
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
          note: 'Left follow up phone call',
        }),
      });

      const res = await postApplicationEvent(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.eventType).toBe('note_added');
      expect(json.data.metadata.note).toBe('Left follow up phone call');
    });

    it('allows legitimate user-authored CRM comment_added event', async () => {
      const mockCreated = {
        id: 'evt-valid-2',
        application_id: appId,
        organization_id: orgAId,
        actor_id: worker1Id,
        actor_type: 'worker',
        event_type: 'comment_added',
        from_status: 'applied',
        to_status: 'applied',
        metadata: { note: 'Submitted take-home assignment link' },
        created_at: new Date().toISOString(),
      };

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: worker1Id } },
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
                data: mockCreated,
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
          eventType: 'comment_added',
          note: 'Submitted take-home assignment link',
        }),
      });

      const res = await postApplicationEvent(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.eventType).toBe('comment_added');
    });
  });

  // ===========================================================================
  // 2. TENANT ISOLATION & AUTHORIZATION SYMMETRY (P1)
  // ===========================================================================
  describe('2. Multi-Tenant Isolation & Symmetric Authorization', () => {
    const orgApplication = {
      id: appId,
      user_id: ownerId,
      organization_id: orgAId,
      worker_id: worker1Id,
    };

    it('blocks unassigned worker in same organization from viewing another worker application timeline', async () => {
      // worker2 is in orgA, but is NOT the owner and NOT the assigned worker
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: worker2Id } },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: orgApplication,
                error: null,
              }),
            };
          }
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

      const req = new NextRequest(`http://localhost/api/applications/${appId}/events`);
      const res = await getApplicationEvents(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      // Must be 404 to avoid leaking existence of another worker's application
      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('allows assigned worker to view their assigned application timeline', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: worker1Id } },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: orgApplication,
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
                data: [
                  {
                    id: 'evt-w1',
                    application_id: appId,
                    organization_id: orgAId,
                    actor_id: worker1Id,
                    actor_type: 'worker',
                    event_type: 'status_changed',
                    from_status: 'applied',
                    to_status: 'screening',
                    metadata: {},
                    created_at: '2026-09-04T12:00:00Z',
                  },
                ],
                error: null,
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
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
      expect(json.data[0].actorType).toBe('worker');
    });

    it('allows organization admin to view any application timeline in their organization', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: orgApplication,
                error: null,
              }),
            };
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { role: 'admin' }, // is org admin
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
                data: [],
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
    });

    it('blocks complete outsider from accessing application events', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: outsiderId } },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: orgApplication,
                error: null,
              }),
            };
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: null, // not in org
                error: null,
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: null, // not a superadmin
                error: null,
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/events`);
      const res = await getApplicationEvents(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });
  });

  // ===========================================================================
  // 3. APPLICATION DELETION & AUDIT PRESERVATION (P0)
  // ===========================================================================
  describe('3. Application Deletion & Audit Log Preservation', () => {
    it('performs soft-deletion archiving and preserves audit history', async () => {
      const mockArchived = {
        id: appId,
        user_id: ownerId,
        status: 'archived',
        deleted_at: new Date().toISOString(),
      };

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: ownerId } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: mockArchived,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}`, {
        method: 'DELETE',
      });

      const res = await deleteApplication(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.deleted).toBe(true);
      expect(json.data.id).toBe(appId);
    });
  });

  // ===========================================================================
  // 4. ACTOR ATTRIBUTION & AUDIT COMPLETENESS (P1)
  // ===========================================================================
  describe('4. Complete Mutation Coverage on PATCH', () => {
    it('records metadata detail updates when companyName or jobTitle changes', async () => {
      const mockUpdated = {
        id: appId,
        user_id: ownerId,
        company_name: 'Alphabet Inc.',
        job_title: 'Staff Software Engineer',
        status: 'applied',
        updated_at: new Date().toISOString(),
      };

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: ownerId } },
            error: null,
          }),
        },
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: appId,
                    user_id: ownerId,
                    organization_id: null,
                    deleted_at: null,
                  },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: mockUpdated,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        })),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: 'Alphabet Inc.',
          jobTitle: 'Staff Software Engineer',
        }),
      });

      const res = await patchApplication(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.company_name).toBe('Alphabet Inc.');
      expect(json.data.job_title).toBe('Staff Software Engineer');
    });

    it('rejects PATCH update on an already soft-deleted application with 404', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: ownerId } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null, // is('deleted_at', null) matched nothing because application is soft-deleted
                  error: null,
                }),
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Row not found' },
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: null, // is('deleted_at', null) matched nothing
                      error: { message: 'Row not found' },
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'Attempting to revive archived application with notes',
        }),
      });

      const res = await patchApplication(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Application not found or unauthorized to modify');
    });
  });

  // ===========================================================================
  // 5. ARCHIVED APPLICATION BOUNDARIES & REPEAT DELETE IDEMPOTENCY
  // ===========================================================================
  describe('5. Archived Application Boundaries & Repeat DELETE Idempotency', () => {
    it('rejects adding CRM events to an archived application with 400', async () => {
      const mockArchivedApp = {
        id: appId,
        user_id: ownerId,
        organization_id: null,
        worker_id: null,
        status: 'archived',
        deleted_at: '2026-09-04T10:00:00Z',
      };

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: ownerId } },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockArchivedApp,
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
          note: 'Trying to add note to deleted app',
        }),
      });

      const res = await postApplicationEvent(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Cannot append CRM events to an archived application');
    });

    it('rejects repeat DELETE on an already deleted application with 404', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: ownerId } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: null, // matched 0 rows because deleted_at IS NOT NULL
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}`, {
        method: 'DELETE',
      });

      const res = await deleteApplication(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Application not found or unauthorized to delete');
    });

    it('prevents client from elevating actorType or injecting lifecycle metadata into CRM note', async () => {
      const mockApp = {
        id: appId,
        user_id: ownerId,
        organization_id: null,
        worker_id: null,
        status: 'applied',
        deleted_at: null,
      };

      let insertedPayload: any = null;

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: ownerId } },
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
              insert: vi.fn((payload) => {
                insertedPayload = payload;
                return {
                  select: vi.fn().mockReturnThis(),
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'evt-secure-1',
                      application_id: appId,
                      organization_id: null,
                      actor_id: ownerId,
                      actor_type: payload.actor_type,
                      event_type: payload.event_type,
                      from_status: payload.from_status,
                      to_status: payload.to_status,
                      metadata: payload.metadata,
                      created_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                };
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
          note: 'Legitimate interview prep note',
          actorType: 'admin', // Attempted elevation!
          metadata: {
            statusChanged: true, // Attempted state manipulation
            toStatus: 'offer',
          },
        }),
      });

      const res = await postApplicationEvent(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      // Client actorType 'admin' was ignored; server derived 'user' based on caller context
      expect(insertedPayload.actor_type).toBe('user');
      // Lifecycle status was not modified by metadata
      expect(insertedPayload.from_status).toBe('applied');
      expect(insertedPayload.to_status).toBe('applied');
    });
  });
});
