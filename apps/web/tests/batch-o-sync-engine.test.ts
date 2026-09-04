import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getSyncStatusRoute } from '../app/api/sync/status/route';
import { POST as postSyncRetryRoute } from '../app/api/sync/retry/route';

// Mock cookies from next/headers
const mockCookieStore = new Map<string, { name: string; value: string; options?: any }>();
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => mockCookieStore.get(name),
    set: (name: string, value: string, options?: any) => {
      mockCookieStore.set(name, { name, value, options });
    },
    delete: (name: string) => {
      mockCookieStore.delete(name);
    },
    getAll: () => Array.from(mockCookieStore.values()),
  })),
}));

// Mock Supabase client
vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock Supabase admin client
vi.mock('../lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';
import { createAdminClient } from '../lib/supabase/admin';

describe('Batch O — Application Sync Engine Web API Suite', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const orgId = '33333333-3333-3333-3333-333333333333';
  const otherOrgId = '44444444-4444-4444-4444-444444444444';

  let mockDbSyncEvents: any[] = [];
  let mockDbOrgMembers: any[] = [];

  const setupMockSupabase = (currentUserId: string | null) => {
    mockDbSyncEvents = [];
    mockDbOrgMembers = [
      {
        id: 'mem-1',
        organization_id: orgId,
        user_id: userId,
        role: 'admin',
      },
      {
        id: 'mem-2',
        organization_id: orgId,
        user_id: otherUserId,
        role: 'worker',
      },
    ];

    const createQueryChain = (table: string, isServiceRole = false) => {
      const state: any = {
        filters: {} as Record<string, any>,
        inFilters: {} as Record<string, any[]>,
        nullFilters: [] as string[],
        limitVal: 50,
      };

      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((col: string, val: any) => {
          state.filters[col] = val;
          return chain;
        }),
        is: vi.fn((col: string, val: any) => {
          if (val === null) {
            state.nullFilters.push(col);
          }
          return chain;
        }),
        in: vi.fn((col: string, vals: any[]) => {
          state.inFilters[col] = vals;
          return chain;
        }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn((limit: number) => {
          state.limitVal = limit;
          return chain;
        }),
        maybeSingle: vi.fn(async () => {
          if (table === 'sync_events') {
            const found = mockDbSyncEvents.find((e) => {
              for (const [k, v] of Object.entries(state.filters)) {
                if (e[k] !== v) return false;
              }
              return true;
            });
            return { data: found || null, error: null };
          }
          if (table === 'organization_members') {
            const found = mockDbOrgMembers.find((m) => {
              for (const [k, v] of Object.entries(state.filters)) {
                if (m[k] !== v) return false;
              }
              return true;
            });
            return { data: found || null, error: null };
          }
          return { data: null, error: null };
        }),
        single: vi.fn(async () => {
          if (table === 'organization_members') {
            const found = mockDbOrgMembers.find((m) => {
              for (const [k, v] of Object.entries(state.filters)) {
                if (m[k] !== v) return false;
              }
              return true;
            });
            return { data: found || null, error: found ? null : new Error('Member not found') };
          }
          return { data: null, error: null };
        }),
        update: vi.fn((updateData: any) => {
          const updateChain: any = {
            eq: vi.fn((col: string, val: any) => {
              state.filters[col] = val;
              return updateChain;
            }),
            is: vi.fn((col: string, val: any) => {
              if (val === null) state.nullFilters.push(col);
              return updateChain;
            }),
            in: vi.fn((col: string, vals: any[]) => {
              state.inFilters[col] = vals;
              return updateChain;
            }),
            select: vi.fn(async () => {
              const matched = mockDbSyncEvents.filter((e) => {
                for (const [k, v] of Object.entries(state.filters)) {
                  if (e[k] !== v) return false;
                }
                for (const col of state.nullFilters) {
                  if (e[col] !== null) return false;
                }
                for (const [k, vals] of Object.entries(state.inFilters)) {
                  if (!(vals as any[]).includes(e[k])) return false;
                }
                return true;
              });

              for (const m of matched) {
                Object.assign(m, updateData);
              }
              return { data: matched, error: null };
            }),
          };

          // If await without .select()
          updateChain.then = (resolve: any) => {
            const matched = mockDbSyncEvents.filter((e) => {
              for (const [k, v] of Object.entries(state.filters)) {
                if (e[k] !== v) return false;
              }
              for (const col of state.nullFilters) {
                if (e[col] !== null) return false;
              }
              for (const [k, vals] of Object.entries(state.inFilters)) {
                if (!(vals as any[]).includes(e[k])) return false;
              }
              return true;
            });
            for (const m of matched) {
              Object.assign(m, updateData);
            }
            return resolve({ error: null });
          };

          return updateChain;
        }),
      };

      // If await without .single()/.maybeSingle()
      chain.then = (resolve: any) => {
        if (table === 'sync_events') {
          const matched = mockDbSyncEvents.filter((e) => {
            for (const [k, v] of Object.entries(state.filters)) {
              if (e[k] !== v) return false;
            }
            for (const col of state.nullFilters) {
              if (e[col] !== null) return false;
            }
            for (const [k, vals] of Object.entries(state.inFilters)) {
              if (!(vals as any[]).includes(e[k])) return false;
            }
            return true;
          });
          return resolve({ data: matched.slice(0, state.limitVal), error: null });
        }
        return resolve({ data: [], error: null });
      };

      return chain;
    };

    // Client for authenticated session
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: currentUserId ? { id: currentUserId, email: 'user@jobpulse.io' } : null,
          },
          error: currentUserId ? null : new Error('Missing session'),
        }),
      },
      rpc: vi.fn(async (fnName: string) => {
        // Internal worker/service_role queue RPCs are denied to authenticated clients
        if (
          fnName === 'claim_next_pending_sync_events' ||
          fnName === 'complete_sync_event' ||
          fnName === 'fail_sync_event'
        ) {
          return {
            data: null,
            error: {
              name: 'PostgrestError',
              message: `permission denied for function ${fnName}`,
              details: '',
              hint: '',
              code: '42501',
            } as any,
          };
        }
        return { data: null, error: new Error(`Unknown RPC: ${fnName}`) };
      }),
      from: (table: string) => createQueryChain(table, false),
    });

    // Admin client (service_role)
    (createAdminClient as any).mockReturnValue({
      from: (table: string) => createQueryChain(table, true),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/sync/status', () => {
    it('returns 401 if caller is unauthenticated', async () => {
      setupMockSupabase(null);
      const req = new NextRequest('http://localhost:3000/api/sync/status');
      const res = await getSyncStatusRoute(req);
      expect(res.status).toBe(401);
    });

    it('returns personal sync status counts and recent events for authenticated worker', async () => {
      setupMockSupabase(userId);
      mockDbSyncEvents.push(
        {
          id: 'e1',
          user_id: userId,
          organization_id: null,
          status: 'synced',
          created_at: '2026-09-04T10:00:00Z',
        },
        {
          id: 'e2',
          user_id: userId,
          organization_id: null,
          status: 'failed',
          created_at: '2026-09-04T10:05:00Z',
        },
        {
          id: 'e3',
          user_id: userId,
          organization_id: null,
          status: 'pending',
          created_at: '2026-09-04T10:10:00Z',
        },
        // Other user event - must not count or show
        {
          id: 'e4',
          user_id: otherUserId,
          organization_id: null,
          status: 'synced',
          created_at: '2026-09-04T10:12:00Z',
        }
      );

      const req = new NextRequest('http://localhost:3000/api/sync/status');
      const res = await getSyncStatusRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.counts).toEqual({
        pending: 1,
        processing: 0,
        synced: 1,
        failed: 1,
        dead_letter: 0,
      });
      expect(json.data.recentEvents).toHaveLength(3);
    });

    it('allows org member to view org sync status via query parameter', async () => {
      setupMockSupabase(userId); // userId is admin of orgId
      mockDbSyncEvents.push(
        {
          id: 'e-org-1',
          user_id: userId,
          organization_id: orgId,
          status: 'synced',
          created_at: '2026-09-04T11:00:00Z',
        },
        {
          id: 'e-org-2',
          user_id: otherUserId,
          organization_id: orgId,
          status: 'dead_letter',
          created_at: '2026-09-04T11:05:00Z',
        }
      );

      const req = new NextRequest(`http://localhost:3000/api/sync/status?organizationId=${orgId}`);
      const res = await getSyncStatusRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.counts.dead_letter).toBe(1);
      expect(json.data.counts.synced).toBe(1);
    });

    it('denies access if user is not a member of the requested organization (403)', async () => {
      setupMockSupabase(userId); // userId is NOT a member of otherOrgId
      const req = new NextRequest(`http://localhost:3000/api/sync/status?organizationId=${otherOrgId}`);
      const res = await getSyncStatusRoute(req);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/sync/retry', () => {
    it('returns 401 if unauthenticated', async () => {
      setupMockSupabase(null);
      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(401);
    });

    it('retries a single failed event owned by the caller', async () => {
      setupMockSupabase(userId);
      const eventId = '11111111-2222-3333-4444-555555555555';
      mockDbSyncEvents.push({
        id: eventId,
        user_id: userId,
        organization_id: null,
        status: 'failed',
        attempts: 3,
        last_error: 'HTTP 429 Rate limited',
      });

      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId }),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.retriedCount).toBe(1);

      // Verify event was updated
      const updated = mockDbSyncEvents.find((e) => e.id === eventId);
      expect(updated.status).toBe('pending');
      expect(updated.attempts).toBe(0);
      expect(updated.last_error).toBeNull();
    });

    it('forbids worker from retrying another user’s personal sync event (403)', async () => {
      setupMockSupabase(userId);
      const foreignEventId = '99999999-9999-9999-9999-999999999999';
      mockDbSyncEvents.push({
        id: foreignEventId,
        user_id: otherUserId,
        organization_id: null,
        status: 'failed',
      });

      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId: foreignEventId }),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(403);
    });

    it('allows Org Admin to batch retry failed and dead-letter events for organization', async () => {
      setupMockSupabase(userId); // userId is org admin of orgId
      mockDbSyncEvents.push(
        {
          id: 'org-fail-1',
          user_id: otherUserId,
          organization_id: orgId,
          status: 'failed',
          attempts: 2,
        },
        {
          id: 'org-fail-2',
          user_id: userId,
          organization_id: orgId,
          status: 'dead_letter',
          attempts: 5,
        },
        {
          id: 'org-synced-3',
          user_id: userId,
          organization_id: orgId,
          status: 'synced',
          attempts: 1,
        }
      );

      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ organizationId: orgId }),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.retriedCount).toBe(2);

      // Synced event was untouched
      const untouched = mockDbSyncEvents.find((e) => e.id === 'org-synced-3');
      expect(untouched.status).toBe('synced');
    });

    it('rejects batch org retry if user is not an org admin (403)', async () => {
      setupMockSupabase(otherUserId); // otherUserId has 'worker' role, not 'admin'
      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ organizationId: orgId }),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(403);
    });

    it('allows worker to batch retry all their personal failed and dead-letter events', async () => {
      setupMockSupabase(userId);
      mockDbSyncEvents.push(
        {
          id: 'user-fail-1',
          user_id: userId,
          organization_id: null,
          status: 'failed',
          attempts: 1,
        },
        {
          id: 'user-fail-2',
          user_id: userId,
          organization_id: null,
          status: 'dead_letter',
          attempts: 5,
        }
      );

      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.retriedCount).toBe(2);
    });
  });

  describe('Security Invariants — Internal Queue RPC Isolation', () => {
    it('proves authenticated client attempting to call claim_next_pending_sync_events directly is DENIED (42501)', async () => {
      setupMockSupabase(userId);
      const supabase = await createClient();

      const { data, error } = await supabase.rpc('claim_next_pending_sync_events', {
        p_batch_size: 10,
      });

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.code).toBe('42501');
      expect(error?.message).toContain('permission denied for function claim_next_pending_sync_events');
    });

    it('proves authenticated client attempting to call complete_sync_event directly is DENIED (42501)', async () => {
      setupMockSupabase(userId);
      const supabase = await createClient();

      const { data, error } = await supabase.rpc('complete_sync_event', {
        p_event_id: '00000000-0000-0000-0000-000000000000',
        p_external_row_id: 'row_2',
      });

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.code).toBe('42501');
      expect(error?.message).toContain('permission denied for function complete_sync_event');
    });

    it('proves authenticated client attempting to call fail_sync_event directly is DENIED (42501)', async () => {
      setupMockSupabase(userId);
      const supabase = await createClient();

      const { data, error } = await supabase.rpc('fail_sync_event', {
        p_event_id: '00000000-0000-0000-0000-000000000000',
        p_error_message: 'Exploit attempt',
        p_retry_delay_seconds: 0,
      });

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.code).toBe('42501');
      expect(error?.message).toContain('permission denied for function fail_sync_event');
    });
  });
});
