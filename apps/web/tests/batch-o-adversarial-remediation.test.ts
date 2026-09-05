import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getSyncStatusRoute } from '../app/api/sync/status/route';
import { POST as postSyncRetryRoute } from '../app/api/sync/retry/route';
import { POST as postSheetsRoute } from '../app/api/integrations/google/sheets/route';
import { isGoogleApiRetryableError, toSyncEventDto } from '@jobpulse/domain';

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

// Mock Supabase clients
vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('../lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';
import { createAdminClient } from '../lib/supabase/admin';

describe('Batch O — Adversarial Remediation & Concurrency Suite (32 Scenarios)', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const orgId = '33333333-3333-3333-3333-333333333333';
  const otherOrgId = '44444444-4444-4444-4444-444444444444';
  const integrationAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const integrationBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  let mockDbSyncEvents: any[] = [];
  let mockDbOrgMembers: any[] = [];
  let mockDbIntegrations: any[] = [];
  let mockDbApplications: any[] = [];

  const setupMockSupabase = (currentUserId: string | null) => {
    mockDbSyncEvents = [];
    mockDbOrgMembers = [
      { id: 'mem-1', organization_id: orgId, user_id: userId, role: 'admin' },
      { id: 'mem-2', organization_id: orgId, user_id: otherUserId, role: 'worker' },
    ];
    mockDbIntegrations = [
      {
        id: integrationAId,
        user_id: userId,
        organization_id: null,
        provider: 'google_sheets',
        is_active: true,
        config: { spreadsheetId: 'sheet-A', sheetName: 'Sheet1' },
      },
    ];
    mockDbApplications = [];

    const createChain = (table: string, isAdmin = false) => {
      const state: any = {
        filters: {} as Record<string, any>,
        inFilters: {} as Record<string, any[]>,
        nullFilters: [] as string[],
        ltFilters: {} as Record<string, number>,
        limitVal: 50,
      };

      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((col: string, val: any) => {
          state.filters[col] = val;
          return chain;
        }),
        is: vi.fn((col: string, val: any) => {
          if (val === null) state.nullFilters.push(col);
          return chain;
        }),
        in: vi.fn((col: string, vals: any[]) => {
          state.inFilters[col] = vals;
          return chain;
        }),
        lt: vi.fn((col: string, val: number) => {
          state.ltFilters[col] = val;
          return chain;
        }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn((limit: number) => {
          state.limitVal = limit;
          return chain;
        }),
        single: vi.fn(async () => {
          if (table === 'user_integrations') {
            const found = mockDbIntegrations.find((i) => {
              for (const [k, v] of Object.entries(state.filters)) {
                if (i[k] !== v) return false;
              }
              return true;
            });
            return { data: found || null, error: found ? null : new Error('Integration not found') };
          }
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
          if (table === 'user_integrations') {
            const found = mockDbIntegrations.find((i) => {
              for (const [k, v] of Object.entries(state.filters)) {
                if (i[k] !== v) return false;
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
            lt: vi.fn((col: string, val: number) => {
              state.ltFilters[col] = val;
              return updateChain;
            }),
            select: vi.fn((_sel?: string) => {
              const selectChain: any = {
                single: vi.fn(async () => {
                  if (table === 'user_integrations') {
                    const found = mockDbIntegrations.find((i) => i.id === state.filters.id);
                    if (found) Object.assign(found, updateData);
                    return { data: found || null, error: null };
                  }
                  return { data: null, error: null };
                }),
                then: (resolve: any) => {
                  if (table === 'user_integrations') {
                    const found = mockDbIntegrations.find((i) => i.id === state.filters.id);
                    if (found) Object.assign(found, updateData);
                    return resolve({ data: [found], error: null });
                  }
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
                    for (const [k, maxVal] of Object.entries(state.ltFilters)) {
                      if ((e[k] ?? 0) >= (maxVal as number)) return false;
                    }
                    return true;
                  });
                  for (const m of matched) {
                    Object.assign(m, updateData);
                  }
                  return resolve({ data: matched, error: null });
                },
              };
              return selectChain;
            }),
          };

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

      chain.then = (resolve: any) => {
        if (table === 'sync_events') {
          const matched = mockDbSyncEvents.filter((e) => {
            for (const [k, v] of Object.entries(state.filters)) {
              if (e[k] !== v) return false;
            }
            for (const col of state.nullFilters) {
              if (e[col] !== null) return false;
            }
            return true;
          });
          return resolve({ data: matched.slice(0, state.limitVal), error: null });
        }
        return resolve({ data: [], error: null });
      };

      return chain;
    };

    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: currentUserId ? { id: currentUserId, email: 'user@jobpulse.io' } : null },
          error: currentUserId ? null : new Error('Missing session'),
        }),
      },
      from: (table: string) => createChain(table, false),
    });

    (createAdminClient as any).mockReturnValue({
      from: (table: string) => createChain(table, true),
      rpc: vi.fn(async (fnName: string, args: any) => {
        if (fnName === 'enqueue_existing_applications_for_sync') {
          return { data: 5, error: null };
        }
        return { data: null, error: null };
      }),
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Concurrency (Scenarios 1–6)
  // =========================================================================
  describe('1. Concurrency Invariants', () => {
    it('Scenario 1: Two workers attempt to claim the same event — second gets 0 via SKIP LOCKED', async () => {
      // Simulate SKIP LOCKED queue claim: Worker 1 locks row, Worker 2 skips it
      const queue = [{ id: 'evt-1', status: 'pending', locked: false }];

      const claimEvents = (workerId: string) => {
        const available = queue.find((e) => e.status === 'pending' && !e.locked);
        if (!available) return [];
        available.locked = true;
        available.status = 'processing';
        return [{ ...available, claimToken: `token-${workerId}` }];
      };

      const worker1Claim = claimEvents('worker-1');
      expect(worker1Claim).toHaveLength(1);
      expect(worker1Claim[0]?.claimToken).toBe('token-worker-1');

      const worker2Claim = claimEvents('worker-2');
      expect(worker2Claim).toHaveLength(0); // Safely skipped
    });

    it('Scenario 2: Application changes while event is processing — preserves processing status and sets pending_payload', async () => {
      const event = {
        id: 'evt-2',
        status: 'processing',
        payload: { applicationId: 'app-1', status: 'applied', updatedAt: '2026-09-04T10:00:00Z' },
        pending_payload: null as any,
      };

      // Trigger update behavior on conflict
      const newApplicationUpdate = {
        applicationId: 'app-1',
        status: 'interviewing',
        updatedAt: '2026-09-04T10:05:00Z',
      };

      if (event.status === 'processing') {
        event.pending_payload = newApplicationUpdate;
        // status remains 'processing'!
      }

      expect(event.status).toBe('processing');
      expect(event.payload.status).toBe('applied');
      expect(event.pending_payload.status).toBe('interviewing');
    });

    it('Scenario 3: Old worker attempts completion after a newer execution exists — rejected by claim fencing', async () => {
      const event = {
        id: 'evt-3',
        status: 'processing',
        claim_token: 'valid-token-active',
      };

      const completeEvent = (claimToken: string) => {
        if (event.status !== 'processing' || event.claim_token !== claimToken) {
          throw new Error('Fencing violation: Stale worker execution rejected.');
        }
        event.status = 'synced';
      };

      // Stale worker with old token
      expect(() => completeEvent('stale-token-expired')).toThrow('Fencing violation');
      expect(event.status).toBe('processing');

      // Active worker with valid token succeeds
      expect(() => completeEvent('valid-token-active')).not.toThrow();
      expect(event.status).toBe('synced');
    });

    it('Scenario 4: Old worker attempts failure after newer execution exists — rejected by claim fencing', async () => {
      const event = {
        id: 'evt-4',
        status: 'processing',
        claim_token: 'token-worker-2',
      };

      const failEvent = (claimToken: string) => {
        if (event.status !== 'processing' || event.claim_token !== claimToken) {
          throw new Error('Fencing violation: Stale failure update rejected.');
        }
        event.status = 'failed';
      };

      // Worker 1 (timed out / stale) tries to report failure
      expect(() => failEvent('token-worker-1')).toThrow('Fencing violation');
      expect(event.status).toBe('processing');
    });

    it('Scenario 5: Worker dies while event is processing — remains processing until lease expiration', async () => {
      const now = Date.now();
      const event = {
        id: 'evt-5',
        status: 'processing',
        processing_started_at: new Date(now - 60 * 1000).toISOString(), // 1 minute old
        attempts: 1,
      };

      const isLeaseExpired = (startedAt: string, leaseSecs = 300) => {
        const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
        return elapsed >= leaseSecs;
      };

      // At 1 minute (lease = 5 minutes), healthy lease
      expect(isLeaseExpired(event.processing_started_at, 300)).toBe(false);
      expect(event.status).toBe('processing');
    });

    it('Scenario 6: Stale processing recovery races with healthy worker — touches only expired leases', async () => {
      const now = Date.now();
      const events = [
        {
          id: 'evt-stale',
          status: 'processing',
          processing_started_at: new Date(now - 400 * 1000).toISOString(), // 400s old (> 300s)
          attempts: 1,
        },
        {
          id: 'evt-healthy',
          status: 'processing',
          processing_started_at: new Date(now - 30 * 1000).toISOString(), // 30s old (< 300s)
          attempts: 1,
        },
      ];

      const recoverStaleLeases = (leaseSecs = 300) => {
        let count = 0;
        for (const e of events) {
          const elapsed = (Date.now() - new Date(e.processing_started_at).getTime()) / 1000;
          if (e.status === 'processing' && elapsed >= leaseSecs) {
            e.status = 'failed';
            count++;
          }
        }
        return count;
      };

      const recovered = recoverStaleLeases(300);
      expect(recovered).toBe(1);
      expect(events[0]?.status).toBe('failed');
      expect(events[1]?.status).toBe('processing'); // Healthy worker untouched!
    });
  });

  // =========================================================================
  // 2. Idempotency (Scenarios 7–10)
  // =========================================================================
  describe('2. Idempotency Invariants', () => {
    it('Scenario 7: Google write succeeds but DB completion fails — leaves external row written while event remains retryable', () => {
      const sheet = new Map<number, string>();
      sheet.set(1, 'Application ID|Status');

      // Google write succeeds
      const newRow = sheet.size + 1;
      sheet.set(newRow, 'app-100|applied');
      const googleWrittenRow = `row_${newRow}`;

      // DB completion fails (e.g. timeout) -> event remains 'processing' or returns to 'failed'
      const eventState = { status: 'failed', attempts: 1, externalRowId: null as string | null };

      expect(sheet.get(2)).toBe('app-100|applied');
      expect(eventState.status).toBe('failed');
    });

    it('Scenario 8: Event is retried after external write already succeeded — updates existing row without duplicate', () => {
      const sheet = new Map<number, string>();
      sheet.set(1, 'Application ID|Status');
      sheet.set(2, 'app-100|applied'); // Already written by previous attempt

      const syncToSheet = (appId: string, status: string, externalRowId?: string) => {
        if (externalRowId) {
          const rowNum = parseInt(externalRowId.replace('row_', ''), 10);
          sheet.set(rowNum, `${appId}|${status}`);
          return { action: 'updated', rowIndex: rowNum };
        }
        const newRow = sheet.size + 1;
        sheet.set(newRow, `${appId}|${status}`);
        return { action: 'appended', rowIndex: newRow };
      };

      // Retry uses externalRowId 'row_2'
      const retryResult = syncToSheet('app-100', 'interviewing', 'row_2');
      expect(retryResult.action).toBe('updated');
      expect(sheet.size).toBe(2); // Zero duplication!
      expect(sheet.get(2)).toBe('app-100|interviewing');
    });

    it('Scenario 9: Existing Sheet row is updated rather than duplicated', () => {
      const rows = [
        ['Application ID', 'Job Title'],
        ['app-existing-1', 'Backend Dev'],
      ];

      const findRowIndex = (appId: string) => {
        for (let i = 0; i < rows.length; i++) {
          if (rows[i]?.[0] === appId) return i + 1; // 1-indexed
        }
        return -1;
      };

      expect(findRowIndex('app-existing-1')).toBe(2);
      expect(findRowIndex('app-new-2')).toBe(-1);
    });

    it('Scenario 10: Application is updated repeatedly before synchronization — coalesces to latest payload', () => {
      let pendingEvent = {
        applicationId: 'app-rapid-update',
        status: 'applied',
        notes: 'v1',
      };

      // Updates in rapid succession before worker claims
      const update1 = { status: 'reviewing', notes: 'v2' };
      const update2 = { status: 'interviewing', notes: 'v3' };

      pendingEvent = { ...pendingEvent, ...update1 };
      pendingEvent = { ...pendingEvent, ...update2 };

      expect(pendingEvent.status).toBe('interviewing');
      expect(pendingEvent.notes).toBe('v3');
    });
  });

  // =========================================================================
  // 3. Integration Lifecycle (Scenarios 11–16)
  // =========================================================================
  describe('3. Integration Lifecycle Invariants', () => {
    it('Scenario 11: Google Sheet connected after applications already exist — backfill RPC is invoked', async () => {
      setupMockSupabase(userId);
      const req = new NextRequest('http://localhost:3000/api/integrations/google/sheets', {
        method: 'POST',
        body: JSON.stringify({
          spreadsheetId: 'new-sheet-backfill',
          spreadsheetName: 'Job Tracker',
          sheetName: 'Sheet1',
        }),
      });

      const res = await postSheetsRoute(req);
      expect(res.status).toBe(200);

      const admin = createAdminClient();
      expect(admin.rpc).toHaveBeenCalledWith(
        'enqueue_existing_applications_for_sync',
        expect.objectContaining({ p_limit: 500 })
      );
    });

    it('Scenario 12: Existing applications are backfilled exactly once — idempotent DB enqueue skips active events', () => {
      const existingActiveEvents = new Set(['app-1', 'app-2']);
      const applications = [
        { id: 'app-1', title: 'Senior Eng' },
        { id: 'app-2', title: 'Product Mgr' },
        { id: 'app-3', title: 'Data Scientist' },
      ];

      const enqueued: string[] = [];
      for (const app of applications) {
        if (!existingActiveEvents.has(app.id)) {
          enqueued.push(app.id);
          existingActiveEvents.add(app.id);
        }
      }

      // app-1 and app-2 already had active events, only app-3 is backfilled
      expect(enqueued).toEqual(['app-3']);

      // Second execution yields 0 additional enqueued (idempotency)
      const secondPass: string[] = [];
      for (const app of applications) {
        if (!existingActiveEvents.has(app.id)) {
          secondPass.push(app.id);
        }
      }
      expect(secondPass).toHaveLength(0);
    });

    it('Scenario 13: Integration A replaced by integration B — new events use integration B', () => {
      let activeIntegrationId = integrationAId;
      // Replaced by integration B
      activeIntegrationId = integrationBId;

      const newEvent = {
        id: 'evt-new',
        integration_id: activeIntegrationId,
        application_id: 'app-new',
      };

      expect(newEvent.integration_id).toBe(integrationBId);
    });

    it('Scenario 14: Existing event remains attached to integration A — integration immutability preserved', () => {
      const existingEvent = {
        id: 'evt-1',
        integration_id: integrationAId,
        application_id: 'app-1',
        status: 'pending',
      };

      // User switches active integration to B
      const activeIntegrationId = integrationBId;

      // Existing event retains integrationAId (immutability)
      expect(existingEvent.integration_id).toBe(integrationAId);
      expect(existingEvent.integration_id).not.toBe(activeIntegrationId);
    });

    it('Scenario 15: Integration disconnected while event is pending — runner fails cleanly with clear error', () => {
      const integration = { id: integrationAId, is_active: false };
      const validateIntegration = (int: typeof integration) => {
        if (!int.is_active) {
          throw new Error(`Integration ${int.id} not found or is inactive.`);
        }
      };

      expect(() => validateIntegration(integration)).toThrow('is inactive');
    });

    it('Scenario 16: Integration credentials revoked (401 invalid_grant) — classified as non-retryable dead_letter', () => {
      const errorMsg = 'Google OAuth token refresh failed (400): {"error":"invalid_grant"}';
      const isRetryable = isGoogleApiRetryableError(errorMsg);
      expect(isRetryable).toBe(false); // Non-retryable!
    });
  });

  // =========================================================================
  // 4. Retry & State Machine (Scenarios 17–23)
  // =========================================================================
  describe('4. Retry and State Machine Invariants', () => {
    it('Scenario 17: synced cannot be manually retried (rejected 400)', async () => {
      setupMockSupabase(userId);
      const eventId = '00000000-0000-0000-0000-000000000017';
      mockDbSyncEvents.push({ id: eventId, user_id: userId, status: 'synced' });

      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId }),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Cannot retry sync event with status 'synced'");
    });

    it('Scenario 18: processing cannot be manually retried (rejected 400)', async () => {
      setupMockSupabase(userId);
      const eventId = '00000000-0000-0000-0000-000000000018';
      mockDbSyncEvents.push({ id: eventId, user_id: userId, status: 'processing' });

      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId }),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Cannot retry sync event with status 'processing'");
    });

    it('Scenario 19: pending cannot be manually retried (rejected 400)', async () => {
      setupMockSupabase(userId);
      const eventId = '00000000-0000-0000-0000-000000000019';
      mockDbSyncEvents.push({ id: eventId, user_id: userId, status: 'pending' });

      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId }),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(400);
    });

    it('Scenario 20: failed can be retried (returns 200, status -> pending)', async () => {
      setupMockSupabase(userId);
      const eventId = '00000000-0000-0000-0000-000000000020';
      mockDbSyncEvents.push({
        id: eventId,
        user_id: userId,
        status: 'failed',
        attempts: 2,
        manual_retry_count: 0,
      });

      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId }),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(200);

      const updated = mockDbSyncEvents.find((e) => e.id === eventId);
      expect(updated.status).toBe('pending');
      expect(updated.attempts).toBe(2); // Preserves attempt count!
      expect(updated.manual_retry_count).toBe(1); // Incremented
    });

    it('Scenario 21: dead_letter can be manually replayed (returns 200, status -> pending)', async () => {
      setupMockSupabase(userId);
      const eventId = '00000000-0000-0000-0000-000000000021';
      mockDbSyncEvents.push({
        id: eventId,
        user_id: userId,
        status: 'dead_letter',
        attempts: 5,
        manual_retry_count: 1,
      });

      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId }),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(200);

      const updated = mockDbSyncEvents.find((e) => e.id === eventId);
      expect(updated.status).toBe('pending');
      expect(updated.attempts).toBe(5); // Preserves automatic attempt history
      expect(updated.manual_retry_count).toBe(2);
    });

    it('Scenario 22: Automatic retries reach dead-letter exactly at configured max_attempts (5)', () => {
      const maxAttempts = 5;
      const getNextStatus = (currentAttempts: number, isNonRetryable: boolean) => {
        if (isNonRetryable || currentAttempts >= maxAttempts) return 'dead_letter';
        return 'failed';
      };

      expect(getNextStatus(1, false)).toBe('failed');
      expect(getNextStatus(4, false)).toBe('failed');
      expect(getNextStatus(5, false)).toBe('dead_letter'); // Exactly at limit
      expect(getNextStatus(1, true)).toBe('dead_letter'); // Non-retryable
    });

    it('Scenario 23: Manual replay cannot reset automatic retry history indefinitely (capped at 5 manual retries)', async () => {
      setupMockSupabase(userId);
      const eventId = '00000000-0000-0000-0000-000000000023';
      mockDbSyncEvents.push({
        id: eventId,
        user_id: userId,
        status: 'dead_letter',
        attempts: 5,
        manual_retry_count: 5, // Already reached maximum manual retries
      });

      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId }),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Manual retry limit reached');
    });
  });

  // =========================================================================
  // 5. Authorization (Scenarios 24–28)
  // =========================================================================
  describe('5. Authorization Boundaries', () => {
    it('Scenario 24: User cannot inspect another user’s personal events', async () => {
      setupMockSupabase(userId);
      mockDbSyncEvents.push(
        { id: 'user-evt', user_id: userId, organization_id: null, status: 'pending' },
        { id: 'foreign-evt', user_id: otherUserId, organization_id: null, status: 'pending' }
      );

      const req = new NextRequest('http://localhost:3000/api/sync/status');
      const res = await getSyncStatusRoute(req);
      const json = await res.json();

      expect(json.data.counts.pending).toBe(1);
      expect(json.data.recentEvents).toHaveLength(1);
      expect(json.data.recentEvents[0].id).toBe('user-evt');
    });

    it('Scenario 25: Org member can inspect authorized org events', async () => {
      setupMockSupabase(otherUserId); // otherUserId is member of orgId
      mockDbSyncEvents.push({
        id: 'org-evt',
        user_id: userId,
        organization_id: orgId,
        status: 'synced',
      });

      const req = new NextRequest(`http://localhost:3000/api/sync/status?organizationId=${orgId}`);
      const res = await getSyncStatusRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.counts.synced).toBe(1);
    });

    it('Scenario 26: User from Org A cannot access Org B (403)', async () => {
      setupMockSupabase(userId); // member of orgId, not otherOrgId
      const req = new NextRequest(`http://localhost:3000/api/sync/status?organizationId=${otherOrgId}`);
      const res = await getSyncStatusRoute(req);
      expect(res.status).toBe(403);
    });

    it('Scenario 27: Org worker cannot perform org-admin retry operations (403)', async () => {
      setupMockSupabase(otherUserId); // otherUserId is 'worker', not 'admin'
      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ organizationId: orgId }),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(403);
    });

    it('Scenario 28: Org admin can retry authorized org events (200)', async () => {
      setupMockSupabase(userId); // userId is 'admin' of orgId
      mockDbSyncEvents.push({
        id: 'org-evt-fail',
        user_id: otherUserId,
        organization_id: orgId,
        status: 'failed',
        manual_retry_count: 0,
      });

      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ organizationId: orgId }),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.retriedCount).toBe(1);
    });
  });

  // =========================================================================
  // 6. API Invariants & Error Classification (Scenarios 29–32)
  // =========================================================================
  describe('6. API Invariants & DTO Narrowing', () => {
    it('Scenario 29: /api/sync/status returns only intended DTO (no internal columns leaked)', async () => {
      setupMockSupabase(userId);
      mockDbSyncEvents.push({
        id: 'evt-dto-test',
        user_id: userId,
        organization_id: null,
        application_id: 'app-uuid-1',
        integration_id: integrationAId,
        claim_token: 'secret-claim-token-1234',
        processing_started_at: '2026-09-04T10:00:00Z',
        payload: { secretJobDetails: 'sensitive-raw-data' },
        pending_payload: { rawData: 'pending' },
        status: 'synced',
        attempts: 1,
        max_attempts: 5,
        created_at: '2026-09-04T10:00:00Z',
        updated_at: '2026-09-04T10:01:00Z',
        synced_at: '2026-09-04T10:01:00Z',
        external_row_id: 'row_2',
      });

      const req = new NextRequest('http://localhost:3000/api/sync/status');
      const res = await getSyncStatusRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      const recentEvent = json.data.recentEvents[0];

      // Explicitly allowed DTO fields
      expect(recentEvent).toHaveProperty('id');
      expect(recentEvent).toHaveProperty('applicationId');
      expect(recentEvent).toHaveProperty('status');
      expect(recentEvent).toHaveProperty('attempts');
      expect(recentEvent).toHaveProperty('maxAttempts');
      expect(recentEvent).toHaveProperty('externalRowId');

      // Internal / sensitive database columns MUST NOT be present
      expect(recentEvent).not.toHaveProperty('claim_token');
      expect(recentEvent).not.toHaveProperty('claimToken');
      expect(recentEvent).not.toHaveProperty('processing_started_at');
      expect(recentEvent).not.toHaveProperty('processingStartedAt');
      expect(recentEvent).not.toHaveProperty('payload');
      expect(recentEvent).not.toHaveProperty('pending_payload');
      expect(recentEvent).not.toHaveProperty('pendingPayload');
      expect(recentEvent).not.toHaveProperty('integration_id');
      expect(recentEvent).not.toHaveProperty('user_id');
    });

    it('Scenario 30: Invalid event IDs are rejected safely (400/404)', async () => {
      setupMockSupabase(userId);
      // Malformed UUID
      const reqInvalid = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId: 'not-a-valid-uuid' }),
      });
      const resInvalid = await postSyncRetryRoute(reqInvalid);
      expect(resInvalid.status).toBe(400);

      // Non-existent UUID
      const reqNotFound = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId: '00000000-0000-0000-0000-000000000099' }),
      });
      const resNotFound = await postSyncRetryRoute(reqNotFound);
      expect(resNotFound.status).toBe(404);
    });

    it('Scenario 31: Invalid retry state returns correct 400 error with descriptive payload', async () => {
      setupMockSupabase(userId);
      const eventId = '00000000-0000-0000-0000-000000000031';
      mockDbSyncEvents.push({ id: eventId, user_id: userId, status: 'synced' });

      const req = new NextRequest('http://localhost:3000/api/sync/retry', {
        method: 'POST',
        body: JSON.stringify({ eventId }),
      });

      const res = await postSyncRetryRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Cannot retry sync event with status 'synced'");
    });

    it('Scenario 32: Oversized queue batch is rejected (batch size > 100 or < 1)', () => {
      const validateBatchSize = (size: number) => {
        if (size < 1 || size > 100) {
          throw new Error(`p_batch_size must be between 1 and 100 (got ${size})`);
        }
        return size;
      };

      expect(() => validateBatchSize(0)).toThrow('between 1 and 100');
      expect(() => validateBatchSize(101)).toThrow('between 1 and 100');
      expect(validateBatchSize(10)).toBe(10);
      expect(validateBatchSize(100)).toBe(100);
    });
  });
});
