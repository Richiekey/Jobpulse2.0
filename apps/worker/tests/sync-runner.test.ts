import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncRunner, type ClaimedSyncEvent } from '../src/engine/sync-runner.js';
import { encryptToken, type SyncEventPayload } from '@jobpulse/domain';

describe('Batch O — SyncRunner Daemon Engine', () => {
  const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const userId = '11111111-1111-1111-1111-111111111111';
  const integrationId = 'int-googlesheets-001';
  const applicationId = 'app-unit-test-100';

  beforeEach(() => {
    process.env['GOOGLE_TOKEN_ENCRYPTION_KEY'] = encryptionKey;
    process.env['GOOGLE_CLIENT_ID'] = 'mock-google-client-id';
    process.env['GOOGLE_CLIENT_SECRET'] = 'mock-google-client-secret';
  });

  const createSamplePayload = (overrides?: Partial<SyncEventPayload>): SyncEventPayload => ({
    applicationId,
    jobTitle: 'Senior Infrastructure Engineer',
    companyName: 'Acme Cloud Corp',
    location: 'Remote, US',
    status: 'applied',
    source: 'linkedin',
    appliedAt: '2026-09-04T12:00:00Z',
    notes: 'Submitted resume and portfolio',
    salary: '$180,000 - $210,000',
    jobUrl: 'https://careers.acme.com/jobs/100',
    ...overrides,
  });

  const setupMockEnvironment = (options?: {
    claimedEvents?: ClaimedSyncEvent[];
    existingSheetRows?: string[][];
    failGoogleFetch?: { status: number; message: string };
  }) => {
    const encryptedSecret = encryptToken('sample-refresh-token-xyz', encryptionKey, userId);

    const integrations = [
      {
        id: integrationId,
        user_id: userId,
        organization_id: null,
        provider: 'google_sheets',
        is_active: true,
        config: {
          spreadsheetId: 'test-spreadsheet-id-123',
          sheetName: 'Job Applications',
        },
      },
    ];

    const secrets = [
      {
        integration_id: integrationId,
        encrypted_refresh_token: encryptedSecret.ciphertext,
        token_iv: encryptedSecret.iv,
        token_auth_tag: encryptedSecret.tag,
      },
    ];

    const rpcCalls: { fn: string; args: any }[] = [];

    const mockSupabase = {
      rpc: vi.fn(async (fn: string, args: any) => {
        rpcCalls.push({ fn, args });
        if (fn === 'claim_next_pending_sync_events') {
          return { data: options?.claimedEvents ?? [], error: null };
        }
        if (fn === 'complete_sync_event') {
          return { data: null, error: null };
        }
        if (fn === 'fail_sync_event') {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }),
      from: vi.fn((table: string) => {
        let selectedId = '';
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn((col: string, val: string) => {
            if (col === 'id' || col === 'integration_id') {
              selectedId = val;
            }
            return chain;
          }),
          maybeSingle: vi.fn(async () => {
            if (table === 'user_integrations') {
              const item = integrations.find((i) => i.id === selectedId);
              return { data: item || null, error: null };
            }
            if (table === 'integration_secrets') {
              const item = secrets.find((s) => s.integration_id === selectedId);
              return { data: item || null, error: null };
            }
            return { data: null, error: null };
          }),
        };
        return chain;
      }),
    };

    const fetchCalls: { url: string; method?: string; body?: any }[] = [];

    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method || 'GET';
      let body: any = undefined;
      if (init?.body) {
        if (typeof init.body === 'string') {
          try {
            body = JSON.parse(init.body);
          } catch {
            body = init.body;
          }
        } else {
          body = init.body;
        }
      }
      fetchCalls.push({ url, method, body });

      // 1. Google OAuth Token Refresh
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'valid-google-access-token-999',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Simulate failure if requested
      if (options?.failGoogleFetch) {
        return new Response(
          JSON.stringify({ error: { message: options.failGoogleFetch.message } }),
          {
            status: options.failGoogleFetch.status,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // 2. Google Sheets GET (inspect existing rows)
      if (method === 'GET' && url.includes('/values/')) {
        const rows = options?.existingSheetRows || [
          [
            'Application ID',
            'Job Title',
            'Company',
            'Location',
            'Status',
            'Source',
            'Applied At',
            'Salary',
            'Job URL',
            'Notes',
          ],
        ];
        return new Response(JSON.stringify({ values: rows }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 3. Google Sheets Append (POST)
      if (method === 'POST' && url.includes(':append')) {
        return new Response(
          JSON.stringify({
            updates: {
              updatedRange: 'Job Applications!A2:J2',
              updatedRows: 1,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 4. Google Sheets Update in place (PUT)
      if (method === 'PUT' && url.includes('/values/')) {
        return new Response(
          JSON.stringify({
            updatedRange: 'Job Applications!A2:J2',
            updatedRows: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not Found', { status: 404 });
    });

    return {
      mockSupabase,
      mockFetch,
      rpcCalls,
      fetchCalls,
    };
  };

  it('Test A: Successful sync appends new row to Google Sheets when application does not exist', async () => {
    const claimedEvent: ClaimedSyncEvent = {
      id: 'sync-event-001',
      user_id: userId,
      organization_id: null,
      application_id: applicationId,
      integration_id: integrationId,
      provider: 'google_sheets',
      attempts: 0,
      max_attempts: 5,
      payload: createSamplePayload(),
    };

    const { mockSupabase, mockFetch, rpcCalls, fetchCalls } = setupMockEnvironment({
      claimedEvents: [claimedEvent],
    });

    const runner = new SyncRunner({
      batchSize: 5,
      fetchFn: mockFetch as any,
      supabaseClient: mockSupabase,
    });

    const syncedCount = await runner.pollAndExecutePendingSync();

    expect(syncedCount).toBe(1);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('claim_next_pending_sync_events', {
      p_batch_size: 5,
    });

    // Verify Append was called
    const appendCall = fetchCalls.find((c) => c.method === 'POST' && c.url.includes(':append'));
    expect(appendCall).toBeDefined();
    expect(appendCall?.body.values[0][0]).toBe(applicationId);
    expect(appendCall?.body.values[0][1]).toBe('Senior Infrastructure Engineer');

    // Verify complete_sync_event RPC was called
    const completeCall = rpcCalls.find((c) => c.fn === 'complete_sync_event');
    expect(completeCall).toBeDefined();
    expect(completeCall?.args.p_event_id).toBe('sync-event-001');
  });

  it('Test B: Re-syncing an existing application updates the existing row in place without duplicating', async () => {
    const claimedEvent: ClaimedSyncEvent = {
      id: 'sync-event-002',
      user_id: userId,
      organization_id: null,
      application_id: applicationId,
      integration_id: integrationId,
      provider: 'google_sheets',
      attempts: 0,
      max_attempts: 5,
      payload: createSamplePayload({
        status: 'interviewing',
        notes: 'Round 1 technical phone screen completed',
      }),
    };

    // Sheet already contains application in Row 2
    const existingRows = [
      ['Application ID', 'Job Title', 'Company', 'Location', 'Status', 'Source', 'Applied At', 'Salary', 'Job URL', 'Notes'],
      [applicationId, 'Senior Infrastructure Engineer', 'Acme Cloud Corp', 'Remote, US', 'applied', 'linkedin', '2026-09-04T12:00:00Z', '$180,000 - $210,000', 'https://careers.acme.com/jobs/100', 'Submitted resume and portfolio'],
      ['app-other-999', 'Frontend Dev', 'Beta LLC', 'NY', 'applied', 'direct', '2026-09-03', '$150k', '', ''],
    ];

    const { mockSupabase, mockFetch, rpcCalls, fetchCalls } = setupMockEnvironment({
      claimedEvents: [claimedEvent],
      existingSheetRows: existingRows,
    });

    const runner = new SyncRunner({
      batchSize: 5,
      fetchFn: mockFetch as any,
      supabaseClient: mockSupabase,
    });

    const syncedCount = await runner.pollAndExecutePendingSync();

    expect(syncedCount).toBe(1);

    // Verify PUT was called for row 2 (not POST append)
    const putCall = fetchCalls.find((c) => c.method === 'PUT');
    expect(putCall).toBeDefined();
    expect(putCall?.url).toContain('Job%20Applications!A2:J2');
    expect(putCall?.body.values[0][0]).toBe(applicationId);
    expect(putCall?.body.values[0][4]).toBe('interviewing'); // Updated status
    expect(putCall?.body.values[0][8]).toBe('Round 1 technical phone screen completed'); // Updated notes

    const appendCall = fetchCalls.find((c) => c.method === 'POST' && c.url.includes(':append'));
    expect(appendCall).toBeUndefined(); // Zero duplication!

    // Verify completion with row_2 external ID
    const completeCall = rpcCalls.find((c) => c.fn === 'complete_sync_event');
    expect(completeCall?.args).toEqual({
      p_event_id: 'sync-event-002',
      p_external_row_id: 'row_2',
    });
  });

  it('Test C: Google API transient error (HTTP 429/500) triggers exponential backoff retry and records last_error', async () => {
    const claimedEvent: ClaimedSyncEvent = {
      id: 'sync-event-003',
      user_id: userId,
      organization_id: null,
      application_id: applicationId,
      integration_id: integrationId,
      provider: 'google_sheets',
      attempts: 2, // 3rd attempt
      max_attempts: 5,
      payload: createSamplePayload(),
    };

    const { mockSupabase, mockFetch, rpcCalls } = setupMockEnvironment({
      claimedEvents: [claimedEvent],
      failGoogleFetch: { status: 429, message: 'Rate limit exceeded: quota units consumed' },
    });

    const runner = new SyncRunner({
      fetchFn: mockFetch as any,
      supabaseClient: mockSupabase,
    });

    const syncedCount = await runner.pollAndExecutePendingSync();

    expect(syncedCount).toBe(0);

    // Complete should NOT have been called
    const completeCall = rpcCalls.find((c) => c.fn === 'complete_sync_event');
    expect(completeCall).toBeUndefined();

    // fail_sync_event RPC must be called with jittered backoff
    const failCall = rpcCalls.find((c) => c.fn === 'fail_sync_event');
    expect(failCall).toBeDefined();
    expect(failCall?.args.p_event_id).toBe('sync-event-003');
    expect(failCall?.args.p_error_message).toContain('Rate limit exceeded');
    // For attempt 2, base delay is 10 * 2^1 = 20s (+/- 15% jitter) -> ~17-23s
    expect(failCall?.args.p_retry_delay_seconds).toBeGreaterThanOrEqual(15);
    expect(failCall?.args.p_retry_delay_seconds).toBeLessThanOrEqual(26);
  });

  it('Test D: Attempt calculation moves towards dead_letter on max attempts', async () => {
    const claimedEvent: ClaimedSyncEvent = {
      id: 'sync-event-004',
      user_id: userId,
      organization_id: null,
      application_id: applicationId,
      integration_id: integrationId,
      provider: 'google_sheets',
      attempts: 4, // 5th attempt (max = 5)
      max_attempts: 5,
      payload: createSamplePayload(),
    };

    const { mockSupabase, mockFetch, rpcCalls } = setupMockEnvironment({
      claimedEvents: [claimedEvent],
      failGoogleFetch: { status: 503, message: 'Google Service Unavailable' },
    });

    const runner = new SyncRunner({
      fetchFn: mockFetch as any,
      supabaseClient: mockSupabase,
    });

    await runner.pollAndExecutePendingSync();

    const failCall = rpcCalls.find((c) => c.fn === 'fail_sync_event');
    expect(failCall).toBeDefined();
    expect(failCall?.args.p_event_id).toBe('sync-event-004');
    expect(failCall?.args.p_error_message).toContain('Google Service Unavailable');
    // Delay calculated for attempt 4: 10 * 2^3 = 80s (+/- 15% jitter) -> ~68-92s
    expect(failCall?.args.p_retry_delay_seconds).toBeGreaterThanOrEqual(65);
    expect(failCall?.args.p_retry_delay_seconds).toBeLessThanOrEqual(95);
  });

  it('Test E: Google Sheets API failure never touches or corrupts application record in PostgreSQL', async () => {
    const claimedEvent: ClaimedSyncEvent = {
      id: 'sync-event-005',
      user_id: userId,
      organization_id: null,
      application_id: applicationId,
      integration_id: integrationId,
      provider: 'google_sheets',
      attempts: 0,
      max_attempts: 5,
      payload: createSamplePayload(),
    };

    const { mockSupabase, mockFetch } = setupMockEnvironment({
      claimedEvents: [claimedEvent],
      failGoogleFetch: { status: 500, message: 'Internal Server Error' },
    });

    const runner = new SyncRunner({
      fetchFn: mockFetch as any,
      supabaseClient: mockSupabase,
    });

    await runner.pollAndExecutePendingSync();

    // Verify that NO call was made to mutate public.applications
    expect(mockSupabase.from).not.toHaveBeenCalledWith('applications');
    // Only user_integrations and integration_secrets were selected from
    const fromCalls = mockSupabase.from.mock.calls.map((c: any) => c[0]);
    expect(fromCalls).toContain('user_integrations');
    expect(fromCalls).toContain('integration_secrets');
    expect(fromCalls).not.toContain('applications');
  });
});
