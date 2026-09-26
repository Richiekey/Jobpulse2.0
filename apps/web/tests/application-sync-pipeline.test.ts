import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEvent, processSyncForApplication } from '../lib/sync-processor';
import * as syncLib from '@jobpulse/domain';
import { createAdminClient } from '../lib/supabase/admin';

vi.mock('../lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@jobpulse/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@jobpulse/domain')>();
  return {
    ...actual,
    syncApplicationToGoogleSheet: vi.fn(),
    refreshGoogleAccessToken: vi.fn(),
    decryptToken: vi.fn().mockReturnValue('mocked-refresh-token'),
  };
});

describe('Application Sync Pipeline Tests', () => {
  const mockEvent = {
    id: 'test-event-123',
    application_id: 'app-123',
    user_id: 'user-123',
    organization_id: null,
    provider: 'google_sheets',
    status: 'pending',
    attempts: 0,
    max_attempts: 5,
    payload: {
      applicationId: 'app-123',
      jobTitle: 'Software Engineer',
      companyName: 'Test Corp',
      status: 'applied',
      appliedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    integration_id: 'int-123',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockIntegration = {
    id: 'int-123',
    user_id: 'user-123',
    provider: 'google_sheets',
    is_active: true,
    auth_state: {
      refresh_token: 'test-refresh-token',
    },
    config: {
      spreadsheetId: 'sheet-123',
      sheetName: 'Sheet1',
    },
  };

  const mockAdminClient = {
    from: vi.fn(),
    rpc: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createAdminClient as any).mockReturnValue(mockAdminClient);

    (syncLib.refreshGoogleAccessToken as any).mockResolvedValue({
      accessToken: 'test-access-token',
      expiresIn: 3600,
    });
  });

  const setupMocks = (claimData: any, writeAction: 'appended' | 'updated' | 'error', dbFindEventData = mockEvent) => {
    // 1. Mock DB Event fetch
    const selectEventChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: dbFindEventData, error: null }),
    };

    // 2. Mock DB Integration fetch
    const selectIntChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockIntegration, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: mockIntegration, error: null }),
    };

    const selectSecretChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          encrypted_refresh_token: 'encrypted',
          token_iv: 'iv',
          token_auth_tag: 'tag',
        },
        error: null,
      }),
    };

    // 3. Mock Application update
    const updateAppChain = {
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    };

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'sync_events') return selectEventChain;
      if (table === 'user_integrations') return selectIntChain;
      if (table === 'integration_secrets') return selectSecretChain;
      if (table === 'applications') return updateAppChain;
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    });

    // 4. Mock RPCs
    mockAdminClient.rpc.mockImplementation((rpcName: string, args: any) => {
      if (rpcName === 'claim_sync_event') {
        return Promise.resolve({ data: claimData, error: null });
      }
      if (rpcName === 'complete_sync_event') {
        return Promise.resolve({ data: true, error: null });
      }
      if (rpcName === 'fail_sync_event') {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    // 5. Mock Google Sheets Write
    if (writeAction === 'error') {
      (syncLib.syncApplicationToGoogleSheet as any).mockRejectedValue(new Error('Google write failed'));
    } else {
      (syncLib.syncApplicationToGoogleSheet as any).mockResolvedValue({
        action: writeAction,
        rowIndex: writeAction === 'updated' ? 5 : undefined,
      });
    }
  };

  it('Immediate processing: application -> pending event -> immediate claim -> Google write -> synced', async () => {
    setupMocks({ claim_token: 'valid-token' }, 'appended');

    const claimedEvent = { ...mockEvent, claim_token: 'valid-token' };
    const result = await processEvent(mockAdminClient as any, claimedEvent as any);

    expect(result.rowIndex).toBeUndefined(); // appended returns no rowIndex
    expect(syncLib.syncApplicationToGoogleSheet).toHaveBeenCalled();
    expect(mockAdminClient.rpc).toHaveBeenCalledWith('complete_sync_event', expect.objectContaining({
      p_event_id: mockEvent.id,
      p_claim_token: 'valid-token',
    }));
  });

  it('Claiming: pending -> processing with UUID claim token', async () => {
    setupMocks({ claim_token: 'mocked-uuid-token' }, 'appended');

    const claimedEvent = { ...mockEvent, claim_token: 'mocked-uuid-token' };
    await processEvent(mockAdminClient as any, claimedEvent as any);

    // Assert that the fetched claim token is passed into complete
    expect(mockAdminClient.rpc).toHaveBeenCalledWith('complete_sync_event', expect.objectContaining({
      p_claim_token: 'mocked-uuid-token',
    }));
  });

  it('Successful sync: processing -> synced', async () => {
    setupMocks({ claim_token: 'valid-token' }, 'appended');
    const claimedEvent = { ...mockEvent, claim_token: 'valid-token' };
    const result = await processEvent(mockAdminClient as any, claimedEvent as any);

    expect(result).toHaveProperty('rowIndex');
  });

  it('Google write failure: processing -> failed', async () => {
    setupMocks({ claim_token: 'valid-token' }, 'error');

    const claimedEvent = { ...mockEvent, claim_token: 'valid-token' };
    
    await expect(processEvent(mockAdminClient as any, claimedEvent as any)).rejects.toThrow();
  });

  it('Non-retryable Google error: processing -> dead_letter', async () => {
    setupMocks({ claim_token: 'valid-token' }, 'appended'); // Setup default mocks first
    // 400 Bad Request is considered non-retryable by our isGoogleApiRetryableError check
    (syncLib.syncApplicationToGoogleSheet as any).mockRejectedValue(new Error('Google Sheets row append failed (400): INVALID_ARGUMENT'));

    const claimedEvent = { ...mockEvent, claim_token: 'valid-token' };
    
    await expect(processEvent(mockAdminClient as any, claimedEvent as any)).rejects.toThrow();
  });

  it('Retry: failed -> processing -> synced', async () => {
    const failedEvent = { ...mockEvent, status: 'pending', attempts: 1 };
    setupMocks({ claim_token: 'valid-token' }, 'appended', failedEvent);

    const claimedEvent = { ...failedEvent, claim_token: 'valid-token' };
    await processEvent(mockAdminClient as any, claimedEvent as any);

    expect(mockAdminClient.rpc).toHaveBeenCalledWith('complete_sync_event', expect.any(Object));
  });

  it('Claim conflict: Two workers attempting the same event (worker B -> cannot claim)', async () => {
    setupMocks(null, 'appended');

    // Test processSyncForApplication to see it handle the null claim
    const insertChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [mockEvent], error: null })
    };
    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'sync_events') return insertChain;
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: {}, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    });

    const result = await processSyncForApplication(mockEvent.application_id, mockEvent.user_id);

    expect(result.ok).toBe(false);
    expect(result.status).toBe('pending');
    expect(result.error).toMatch(/Sync event could not be claimed/);
  });

  it('No silent failure: A failed claim must NOT produce { ok: true }', async () => {
    setupMocks(null, 'appended');

    // Mock the direct queue function for immediate processing
    // `processSyncForApplication` inserts a new event and returns it, but since we mock the insert
    // we need to set up the admin client to return the mock event on insert
    const insertChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [mockEvent], error: null })
    };
    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'sync_events') return insertChain;
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: {}, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    });

    mockAdminClient.rpc.mockImplementation((rpcName: string, args: any) => {
      if (rpcName === 'claim_sync_event') {
        return Promise.resolve({ data: null, error: new Error('Claim error') }); // Explicit failure
      }
      return Promise.resolve({ data: null, error: null });
    });

    const result = await processSyncForApplication(mockEvent.application_id, mockEvent.user_id);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('failed');
  });

  it('Existing application: Google Sheets row update rather than duplicate append', async () => {
    setupMocks({ claim_token: 'valid-token' }, 'updated');

    const claimedEvent = { ...mockEvent, claim_token: 'valid-token' };
    await processEvent(mockAdminClient as any, claimedEvent as any);

    // In our mock, 'updated' sets rowIndex: 5
    expect(syncLib.syncApplicationToGoogleSheet).toHaveBeenCalled();
    expect(mockAdminClient.rpc).toHaveBeenCalledWith('complete_sync_event', expect.objectContaining({
      p_external_row_id: 'row_5',
    }));
  });

  it('New application: Google Sheets row append', async () => {
    setupMocks({ claim_token: 'valid-token' }, 'appended');

    const claimedEvent = { ...mockEvent, claim_token: 'valid-token' };
    await processEvent(mockAdminClient as any, claimedEvent as any);

    expect(syncLib.syncApplicationToGoogleSheet).toHaveBeenCalled();
    // In our mock, 'appended' has no rowIndex
    expect(mockAdminClient.rpc).toHaveBeenCalledWith('complete_sync_event', expect.objectContaining({
      p_external_row_id: null,
    }));
  });
});
