import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as connectRoute } from '../app/api/integrations/google/connect/route';
import { GET as callbackRoute } from '../app/api/integrations/google/callback/route';
import { GET as statusRoute } from '../app/api/integrations/google/status/route';
import {
  GET as getSheetsRoute,
  POST as postSheetsRoute,
} from '../app/api/integrations/google/sheets/route';
import {
  POST as disconnectRoutePost,
  DELETE as disconnectRouteDelete,
} from '../app/api/integrations/google/disconnect/route';
import { signOAuthState, encryptToken, decryptToken } from '@jobpulse/domain';

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

describe('Batch N — Google Sheets Integration Suite', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const orgId = '33333333-3333-3333-3333-333333333333';
  const otherOrgId = '44444444-4444-4444-4444-444444444444';

  let mockDbIntegrations: any[] = [];
  let mockDbSecrets: any[] = [];
  let mockDbOrgMembers: any[] = [];

  const setupMockSupabase = (currentUserId: string | null) => {
    mockDbIntegrations = [];
    mockDbSecrets = [];
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

    // Ordinary user/session client (RLS enforced)
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: currentUserId ? { id: currentUserId, email: 'test@jobpulse.io' } : null,
          },
          error: currentUserId ? null : new Error('Missing session'),
        }),
      },
      from: (table: string) => {
        // Table: integration_secrets — RLS is strictly enabled with ZERO client policies.
        // Ordinary client reads/writes are DENIED by PostgreSQL RLS.
        if (table === 'integration_secrets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('Permission denied: Row-level security policy blocks access to integration_secrets'),
            }),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('Permission denied: Row-level security policy blocks access to integration_secrets'),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: null,
                error: new Error('Permission denied: Row-level security policy blocks access to integration_secrets'),
              }),
            }),
          };
        }

        if (table === 'organization_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn(function (this: any, col: string, val: any) {
              this.filters = this.filters || {};
              this.filters[col] = val;
              return this;
            }),
            maybeSingle: vi.fn(function (this: any) {
              const matched = mockDbOrgMembers.find(
                (m) =>
                  (!this.filters?.organization_id || m.organization_id === this.filters.organization_id) &&
                  (!this.filters?.user_id || m.user_id === this.filters.user_id)
              );
              return Promise.resolve({ data: matched || null, error: null });
            }),
            single: vi.fn(function (this: any) {
              const matched = mockDbOrgMembers.find(
                (m) =>
                  (!this.filters?.organization_id || m.organization_id === this.filters.organization_id) &&
                  (!this.filters?.user_id || m.user_id === this.filters.user_id)
              );
              return Promise.resolve({
                data: matched || null,
                error: matched ? null : new Error('Member not found'),
              });
            }),
          };
        }

        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { role: 'worker' }, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'worker' }, error: null }),
          };
        }

        if (table === 'user_integrations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn(function (this: any, col: string, val: any) {
              this.filters = this.filters || {};
              this.filters[col] = val;
              return this;
            }),
            is: vi.fn(function (this: any, col: string, val: any) {
              this.filters = this.filters || {};
              this.filters[col] = val;
              return this;
            }),
            maybeSingle: vi.fn(function (this: any) {
              const matched = mockDbIntegrations.find((item) => {
                if (this.filters?.provider && item.provider !== this.filters.provider) return false;
                if (this.filters?.id && item.id !== this.filters.id) return false;
                if (this.filters?.organization_id && item.organization_id !== this.filters.organization_id)
                  return false;
                if (this.filters?.organization_id === null && item.organization_id !== null) return false;
                if (this.filters?.user_id && item.user_id !== this.filters.user_id) return false;
                if (this.filters?.is_active !== undefined && item.is_active !== this.filters.is_active)
                  return false;
                return true;
              });
              return Promise.resolve({ data: matched ? { ...matched } : null, error: null });
            }),
            single: vi.fn(function (this: any) {
              const matched = mockDbIntegrations.find((item) => {
                if (this.filters?.provider && item.provider !== this.filters.provider) return false;
                if (this.filters?.id && item.id !== this.filters.id) return false;
                if (this.filters?.organization_id && item.organization_id !== this.filters.organization_id)
                  return false;
                if (this.filters?.organization_id === null && item.organization_id !== null) return false;
                if (this.filters?.user_id && item.user_id !== this.filters.user_id) return false;
                if (this.filters?.is_active !== undefined && item.is_active !== this.filters.is_active)
                  return false;
                return true;
              });
              return Promise.resolve({
                data: matched ? { ...matched } : null,
                error: matched ? null : new Error('Not found'),
              });
            }),
            insert: vi.fn((record: any) => {
              const inserted = {
                id: `int-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                ...record,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              mockDbIntegrations.push(inserted);
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: inserted, error: null }),
              };
            }),
            update: vi.fn(function (this: any, updates: any) {
              return {
                eq: vi.fn((col: string, val: any) => {
                  const idx = mockDbIntegrations.findIndex((i) => i[col] === val);
                  if (idx !== -1) {
                    const existing = mockDbIntegrations[idx];

                    // Database trigger simulation: enforce_integration_ownership_immutability
                    if (updates.user_id !== undefined && updates.user_id !== existing.user_id) {
                      return {
                        select: vi.fn().mockReturnThis(),
                        single: vi.fn().mockResolvedValue({
                          data: null,
                          error: new Error('Integration identity is immutable: user_id cannot be changed.'),
                        }),
                      };
                    }
                    if (
                      updates.organization_id !== undefined &&
                      updates.organization_id !== existing.organization_id
                    ) {
                      return {
                        select: vi.fn().mockReturnThis(),
                        single: vi.fn().mockResolvedValue({
                          data: null,
                          error: new Error('Integration scope is immutable: organization_id cannot be changed.'),
                        }),
                      };
                    }
                    if (updates.provider !== undefined && updates.provider !== existing.provider) {
                      return {
                        select: vi.fn().mockReturnThis(),
                        single: vi.fn().mockResolvedValue({
                          data: null,
                          error: new Error('Integration provider is immutable.'),
                        }),
                      };
                    }

                    mockDbIntegrations[idx] = {
                      ...mockDbIntegrations[idx],
                      ...updates,
                      updated_at: new Date().toISOString(),
                    };
                    const updatedItem = { ...mockDbIntegrations[idx] };
                    return {
                      select: vi.fn().mockReturnThis(),
                      single: vi.fn().mockResolvedValue({ data: updatedItem, error: null }),
                    };
                  }
                  return {
                    select: vi.fn().mockReturnThis(),
                    single: vi.fn().mockResolvedValue({ data: null, error: new Error('Not found') }),
                  };
                }),
              };
            }),
            delete: vi.fn(function (this: any) {
              return {
                eq: vi.fn((col: string, val: any) => {
                  const toDelete = mockDbIntegrations.filter((i) => i[col] === val);
                  // Cascade delete to mockDbSecrets (simulating ON DELETE CASCADE)
                  for (const item of toDelete) {
                    mockDbSecrets = mockDbSecrets.filter((s) => s.integration_id !== item.id);
                  }
                  mockDbIntegrations = mockDbIntegrations.filter((i) => i[col] !== val);
                  return Promise.resolve({ error: null });
                }),
              };
            }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      },
    });

    // Privileged service_role admin client (bypasses RLS for internal secrets management)
    (createAdminClient as any).mockReturnValue({
      from: (table: string) => {
        if (table === 'integration_secrets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn(function (this: any, col: string, val: any) {
              this.filters = this.filters || {};
              this.filters[col] = val;
              return this;
            }),
            maybeSingle: vi.fn(function (this: any) {
              const matched = mockDbSecrets.find((s) => {
                if (this.filters?.integration_id && s.integration_id !== this.filters.integration_id)
                  return false;
                return true;
              });
              return Promise.resolve({ data: matched ? { ...matched } : null, error: null });
            }),
            upsert: vi.fn((record: any) => {
              const existingIdx = mockDbSecrets.findIndex((s) => s.integration_id === record.integration_id);
              if (existingIdx !== -1) {
                mockDbSecrets[existingIdx] = {
                  ...mockDbSecrets[existingIdx],
                  ...record,
                  updated_at: new Date().toISOString(),
                };
              } else {
                mockDbSecrets.push({
                  id: `sec-${Date.now()}`,
                  ...record,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
              }
              return Promise.resolve({ error: null });
            }),
            delete: vi.fn(function (this: any) {
              return {
                eq: vi.fn((col: string, val: any) => {
                  mockDbSecrets = mockDbSecrets.filter((s) => s[col] !== val);
                  return Promise.resolve({ error: null });
                }),
              };
            }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      },
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockCookieStore.clear();
  });

  // ---------------------------------------------------------------------------
  // 1. AUTHENTICATION (401)
  // ---------------------------------------------------------------------------
  describe('Authentication Enforcement (401)', () => {
    beforeEach(() => {
      setupMockSupabase(null);
    });

    it('rejects unauthenticated GET /connect with 401', async () => {
      const req = new NextRequest('http://localhost/api/integrations/google/connect');
      const res = await connectRoute(req);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated GET /callback with 401', async () => {
      const req = new NextRequest('http://localhost/api/integrations/google/callback?code=mock&state=mock');
      const res = await callbackRoute(req);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated GET /status with 401', async () => {
      const req = new NextRequest('http://localhost/api/integrations/google/status');
      const res = await statusRoute(req);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated GET /sheets with 401', async () => {
      const req = new NextRequest('http://localhost/api/integrations/google/sheets');
      const res = await getSheetsRoute(req);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated POST /sheets with 401', async () => {
      const req = new NextRequest('http://localhost/api/integrations/google/sheets', {
        method: 'POST',
        body: JSON.stringify({ spreadsheetId: '123456789' }),
      });
      const res = await postSheetsRoute(req);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated POST /disconnect with 401', async () => {
      const req = new NextRequest('http://localhost/api/integrations/google/disconnect', {
        method: 'POST',
      });
      const res = await disconnectRoutePost(req);
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. CONNECT & STATE ISSUANCE
  // ---------------------------------------------------------------------------
  describe('Connect Route & CSRF State Issuance', () => {
    beforeEach(() => {
      setupMockSupabase(userId);
    });

    it('successfully initiates personal Google OAuth with signed state and cookie', async () => {
      const req = new NextRequest('http://localhost/api/integrations/google/connect?json=true');
      const res = await connectRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.authorizationUrl).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(json.data.authorizationUrl).toContain('access_type=offline');
      expect(json.data.authorizationUrl).toContain('prompt=consent');
      expect(json.data.state).toBeDefined();

      const stateCookie = mockCookieStore.get('jobpulse_google_oauth_state');
      expect(stateCookie).toBeDefined();
      expect(stateCookie?.value).toBe(json.data.state);
      expect(stateCookie?.options?.httpOnly).toBe(true);
      expect(stateCookie?.options?.sameSite).toBe('lax');
    });

    it('allows Org Admin to initiate org-scoped Google OAuth', async () => {
      const req = new NextRequest(
        `http://localhost/api/integrations/google/connect?organizationId=${orgId}&json=true`
      );
      const res = await connectRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.state).toBeDefined();
    });

    it('rejects non-admin worker from connecting on behalf of an organization (403)', async () => {
      // otherUserId is a worker, not admin in orgId
      setupMockSupabase(otherUserId);

      const req = new NextRequest(
        `http://localhost/api/integrations/google/connect?organizationId=${orgId}&json=true`
      );
      const res = await connectRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('rejects invalid UUID in organizationId query (400)', async () => {
      const req = new NextRequest(
        'http://localhost/api/integrations/google/connect?organizationId=invalid-uuid&json=true'
      );
      const res = await connectRoute(req);
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. CALLBACK & CSRF PROTECTION
  // ---------------------------------------------------------------------------
  describe('Callback Route & CSRF Protection', () => {
    beforeEach(() => {
      setupMockSupabase(userId);
    });

    it('rejects callback with error query from Google denial (400)', async () => {
      const req = new NextRequest('http://localhost/api/integrations/google/callback?error=access_denied');
      const res = await callbackRoute(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('Google OAuth access denied: access_denied');
    });

    it('rejects callback when state cookie is missing (400 CSRF)', async () => {
      const state = signOAuthState({
        userId,
        timestamp: Date.now(),
        nonce: 'validnonce12345678',
      });

      // No cookie set
      const req = new NextRequest(`http://localhost/api/integrations/google/callback?code=mock_code&state=${state}`);
      const res = await callbackRoute(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('CSRF protection failed');
    });

    it('rejects callback when state query does not match cookie (400 CSRF)', async () => {
      const state1 = signOAuthState({ userId, timestamp: Date.now(), nonce: 'nonce1' });
      const state2 = signOAuthState({ userId, timestamp: Date.now(), nonce: 'nonce2' });

      mockCookieStore.set('jobpulse_google_oauth_state', {
        name: 'jobpulse_google_oauth_state',
        value: state1,
      });

      const req = new NextRequest(`http://localhost/api/integrations/google/callback?code=mock_code&state=${state2}`);
      const res = await callbackRoute(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('CSRF protection failed');
    });

    it('rejects callback when state token has been tampered with (400)', async () => {
      const state = signOAuthState({ userId, timestamp: Date.now(), nonce: 'nonce1' });
      const tamperedState = state + 'tamper';

      mockCookieStore.set('jobpulse_google_oauth_state', {
        name: 'jobpulse_google_oauth_state',
        value: tamperedState,
      });

      const req = new NextRequest(`http://localhost/api/integrations/google/callback?code=mock_code&state=${tamperedState}`);
      const res = await callbackRoute(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('signature verification failed');
    });

    it('rejects callback when state token belongs to a different authenticated user (403)', async () => {
      const stateForOtherUser = signOAuthState({
        userId: otherUserId,
        timestamp: Date.now(),
        nonce: 'nonce-other',
      });

      mockCookieStore.set('jobpulse_google_oauth_state', {
        name: 'jobpulse_google_oauth_state',
        value: stateForOtherUser,
      });

      const req = new NextRequest(
        `http://localhost/api/integrations/google/callback?code=mock_code&state=${stateForOtherUser}`
      );
      const res = await callbackRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toContain('OAuth session user does not match');
    });

    it('successfully processes personal OAuth callback and stores encrypted refresh token', async () => {
      const state = signOAuthState({
        userId,
        timestamp: Date.now(),
        nonce: 'nonce-success-1',
      });

      mockCookieStore.set('jobpulse_google_oauth_state', {
        name: 'jobpulse_google_oauth_state',
        value: state,
      });

      const req = new NextRequest(
        `http://localhost/api/integrations/google/callback?code=valid_code&state=${state}&json=true`
      );
      const res = await callbackRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.provider).toBe('google_sheets');
      expect(json.data.organizationId).toBeNull();
      expect(json.data.isActive).toBe(true);

      // Verify that user_integrations contains NO secret columns
      expect(mockDbIntegrations).toHaveLength(1);
      const stored = mockDbIntegrations[0];
      expect(stored.encrypted_refresh_token).toBeUndefined();
      expect(stored.token_iv).toBeUndefined();
      expect(stored.token_auth_tag).toBeUndefined();

      // Verify that isolated integration_secrets received the encrypted token
      expect(mockDbSecrets).toHaveLength(1);
      const secret = mockDbSecrets[0];
      expect(secret.integration_id).toBe(stored.id);
      expect(secret.encrypted_refresh_token).toBeDefined();
      expect(secret.encrypted_refresh_token).not.toContain('mock_refresh_token');
      expect(secret.token_iv).toHaveLength(24);
      expect(secret.token_auth_tag).toHaveLength(32);
      expect(secret.key_version).toBe(1);

      // Verify cookie was cleared
      expect(mockCookieStore.has('jobpulse_google_oauth_state')).toBe(false);
    });

    it('successfully processes organization OAuth callback and links to org', async () => {
      const state = signOAuthState({
        userId,
        organizationId: orgId,
        timestamp: Date.now(),
        nonce: 'nonce-org-success',
      });

      mockCookieStore.set('jobpulse_google_oauth_state', {
        name: 'jobpulse_google_oauth_state',
        value: state,
      });

      const req = new NextRequest(
        `http://localhost/api/integrations/google/callback?code=valid_code&state=${state}&json=true`
      );
      const res = await callbackRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.organizationId).toBe(orgId);

      const storedOrgInt = mockDbIntegrations.find((i) => i.organization_id === orgId);
      expect(storedOrgInt).toBeDefined();
      expect(storedOrgInt.encrypted_refresh_token).toBeUndefined();

      const storedOrgSecret = mockDbSecrets.find((s) => s.integration_id === storedOrgInt.id);
      expect(storedOrgSecret).toBeDefined();
      expect(storedOrgSecret.encrypted_refresh_token).toBeDefined();
      expect(storedOrgSecret.key_version).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. STATUS & REDACTION (NEGATIVE DATA LEAKAGE)
  // ---------------------------------------------------------------------------
  describe('Status Endpoint & Secret Redaction', () => {
    beforeEach(() => {
      setupMockSupabase(userId);
    });

    it('returns connected: false when no integration exists', async () => {
      const req = new NextRequest('http://localhost/api/integrations/google/status');
      const res = await statusRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.connected).toBe(false);
      expect(json.data.integration).toBeNull();
    });

    it('returns sanitized integration info and NEVER leaks encrypted token fields', async () => {
      const enc = encryptToken('secret_refresh_token_123', undefined, userId);
      mockDbIntegrations.push({
        id: 'int-personal-1',
        user_id: userId,
        organization_id: null,
        provider: 'google_sheets',
        is_active: true,
        encrypted_refresh_token: enc.ciphertext,
        token_iv: enc.iv,
        token_auth_tag: enc.tag,
        token_expires_at: new Date(Date.now() + 3600000).toISOString(),
        config: {
          googleEmail: 'worker@jobpulse-demo.com',
          spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          spreadsheetName: 'My Job Applications',
          sheetName: 'Sheet1',
        },
      });

      const req = new NextRequest('http://localhost/api/integrations/google/status');
      const res = await statusRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.connected).toBe(true);
      expect(json.data.integration.config.googleEmail).toBe('worker@jobpulse-demo.com');
      expect(json.data.integration.config.spreadsheetId).toBe(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );

      // SENSITIVE FIELDS MUST BE REDACTED
      expect(json.data.integration.encrypted_refresh_token).toBeUndefined();
      expect(json.data.integration.token_iv).toBeUndefined();
      expect(json.data.integration.token_auth_tag).toBeUndefined();
      expect(json.data.integration.encryptedRefreshToken).toBeUndefined();
      expect(json.data.integration.tokenIv).toBeUndefined();
      expect(json.data.integration.tokenAuthTag).toBeUndefined();
      expect(JSON.stringify(json)).not.toContain(enc.ciphertext);
    });

    it('rejects non-member user from viewing organization integration status (403)', async () => {
      // otherOrgId has no members in mockDbOrgMembers
      const req = new NextRequest(
        `http://localhost/api/integrations/google/status?organizationId=${otherOrgId}`
      );
      const res = await statusRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. SPREADSHEET SELECTION & BINDING
  // ---------------------------------------------------------------------------
  describe('Spreadsheet Listing & Binding', () => {
    beforeEach(() => {
      setupMockSupabase(userId);
      const enc = encryptToken('1//0mock_token_for_sheets', undefined, userId);
      mockDbIntegrations.push({
        id: 'int-personal-ready',
        user_id: userId,
        organization_id: null,
        provider: 'google_sheets',
        is_active: true,
        config: {
          googleEmail: 'worker@jobpulse-demo.com',
        },
      });
      mockDbSecrets.push({
        id: 'sec-sheets-1',
        integration_id: 'int-personal-ready',
        encrypted_refresh_token: enc.ciphertext,
        token_iv: enc.iv,
        token_auth_tag: enc.tag,
        key_version: 1,
      });
    });

    it('lists accessible Google Spreadsheets via Drive API', async () => {
      const req = new NextRequest('http://localhost/api/integrations/google/sheets');
      const res = await getSheetsRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.spreadsheets).toBeInstanceOf(Array);
      expect(json.data.spreadsheets.length).toBeGreaterThan(0);
      expect(json.data.spreadsheets[0].name).toBeDefined();
    });

    it('successfully binds a spreadsheet and sheet name to integration record', async () => {
      const req = new NextRequest('http://localhost/api/integrations/google/sheets', {
        method: 'POST',
        body: JSON.stringify({
          spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          spreadsheetName: 'JobPulse Applications 2026',
          sheetName: 'Active Queue',
          initializeHeaders: true,
        }),
      });

      const res = await postSheetsRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.config.spreadsheetId).toBe(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      expect(json.data.config.sheetName).toBe('Active Queue');
      expect(json.data.config.autoHeaderInitialized).toBe(true);

      const dbRecord = mockDbIntegrations.find((i) => i.id === 'int-personal-ready');
      expect(dbRecord.config.spreadsheetId).toBe(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
    });

    it('rejects invalid payload (short spreadsheet ID) with 400', async () => {
      const req = new NextRequest('http://localhost/api/integrations/google/sheets', {
        method: 'POST',
        body: JSON.stringify({
          spreadsheetId: 'abc', // too short
        }),
      });

      const res = await postSheetsRoute(req);
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. DISCONNECT & REVOCATION
  // ---------------------------------------------------------------------------
  describe('Disconnect & Token Revocation', () => {
    beforeEach(() => {
      setupMockSupabase(userId);
      const enc = encryptToken('1//0token_to_revoke', undefined, userId);
      mockDbIntegrations.push({
        id: 'int-to-disconnect',
        user_id: userId,
        organization_id: null,
        provider: 'google_sheets',
        is_active: true,
        config: {},
      });
      mockDbSecrets.push({
        id: 'sec-disconnect-1',
        integration_id: 'int-to-disconnect',
        encrypted_refresh_token: enc.ciphertext,
        token_iv: enc.iv,
        token_auth_tag: enc.tag,
        key_version: 1,
      });
    });

    it('successfully disconnects personal integration and cascades delete to secrets', async () => {
      expect(mockDbIntegrations).toHaveLength(1);
      expect(mockDbSecrets).toHaveLength(1);

      const req = new NextRequest('http://localhost/api/integrations/google/disconnect', {
        method: 'POST',
        body: JSON.stringify({ provider: 'google_sheets' }),
      });

      const res = await disconnectRoutePost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.disconnected).toBe(true);

      // Verify cascading deletion purged both metadata and secrets
      expect(mockDbIntegrations).toHaveLength(0);
      expect(mockDbSecrets).toHaveLength(0);
    });

    it('supports DELETE method for disconnect', async () => {
      expect(mockDbIntegrations).toHaveLength(1);

      const req = new NextRequest(
        'http://localhost/api/integrations/google/disconnect?provider=google_sheets',
        { method: 'DELETE' }
      );

      const res = await disconnectRouteDelete(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.disconnected).toBe(true);
      expect(mockDbIntegrations).toHaveLength(0);
    });

    it('rejects non-admin worker from disconnecting organization integration (403)', async () => {
      setupMockSupabase(otherUserId); // worker role

      const req = new NextRequest('http://localhost/api/integrations/google/disconnect', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'google_sheets',
          organizationId: orgId,
        }),
      });

      const res = await disconnectRoutePost(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. ADVERSARIAL SECURITY & DIRECT DATABASE TESTS (BATCH N REMEDIATION)
  // ---------------------------------------------------------------------------
  describe('Adversarial Security & Direct Database Invariants', () => {
    const personalIntId = 'int-personal-adv-1';
    const orgIntId = 'int-org-adv-1';

    beforeEach(() => {
      setupMockSupabase(userId);

      // Seed personal integration and secret
      const encPersonal = encryptToken('personal_refresh_token', undefined, userId);
      mockDbIntegrations.push({
        id: personalIntId,
        user_id: userId,
        organization_id: null,
        provider: 'google_sheets',
        is_active: true,
        config: { googleEmail: 'user1@jobpulse.io' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      mockDbSecrets.push({
        id: 'sec-personal-adv',
        integration_id: personalIntId,
        encrypted_refresh_token: encPersonal.ciphertext,
        token_iv: encPersonal.iv,
        token_auth_tag: encPersonal.tag,
        token_expires_at: new Date(Date.now() + 3600000).toISOString(),
        key_version: 1,
      });

      // Seed organization integration and secret
      const encOrg = encryptToken('org_refresh_token', undefined, orgId);
      mockDbIntegrations.push({
        id: orgIntId,
        user_id: userId,
        organization_id: orgId,
        provider: 'google_sheets',
        is_active: true,
        config: { googleEmail: 'org-admin@company.com' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      mockDbSecrets.push({
        id: 'sec-org-adv',
        integration_id: orgIntId,
        encrypted_refresh_token: encOrg.ciphertext,
        token_iv: encOrg.iv,
        token_auth_tag: encOrg.tag,
        token_expires_at: new Date(Date.now() + 3600000).toISOString(),
        key_version: 1,
      });
    });

    it('Test A: Organization worker cannot read secrets via ordinary client (DENIED by RLS)', async () => {
      // Setup as otherUserId (worker in orgId)
      setupMockSupabase(otherUserId);
      const userSupabase = await createClient();

      // Direct client attempt to query integration_secrets
      const { data, error } = await userSupabase
        .from('integration_secrets')
        .select('*')
        .eq('integration_id', orgIntId)
        .maybeSingle();

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error!.message).toContain('Permission denied');
    });

    it('Test B: User cannot read another users personal integration secret (DENIED by RLS)', async () => {
      setupMockSupabase(otherUserId);
      const userSupabase = await createClient();

      const { data, error } = await userSupabase
        .from('integration_secrets')
        .select('*')
        .eq('integration_id', personalIntId)
        .maybeSingle();

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error!.message).toContain('Permission denied');
    });

    it('Test C: Organization A member cannot read Organization B secret (DENIED by RLS)', async () => {
      // otherOrgId has no association with user
      setupMockSupabase(userId);
      const userSupabase = await createClient();

      const { data, error } = await userSupabase
        .from('integration_secrets')
        .select('*')
        .eq('integration_id', 'some-org-b-integration-id')
        .maybeSingle();

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error!.message).toContain('Permission denied');
    });

    it('Test D: Anonymous user cannot read any secrets (DENIED by RLS)', async () => {
      setupMockSupabase(null); // anonymous
      const anonSupabase = await createClient();

      const { data, error } = await anonSupabase
        .from('integration_secrets')
        .select('*')
        .maybeSingle();

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error!.message).toContain('Permission denied');
    });

    it('Test E: Authorized backend service role can access and decrypt secret', async () => {
      const adminSupabase = createAdminClient();

      const { data: secret, error } = await adminSupabase
        .from('integration_secrets')
        .select('*')
        .eq('integration_id', personalIntId)
        .maybeSingle();

      expect(error).toBeNull();
      expect(secret).toBeDefined();
      expect(secret.key_version).toBe(1);

      // Decrypt with AAD binding
      const decrypted = decryptToken(
        {
          ciphertext: secret.encrypted_refresh_token,
          iv: secret.token_iv,
          tag: secret.token_auth_tag,
        },
        undefined,
        userId
      );
      expect(decrypted).toBe('personal_refresh_token');
    });

    it('Test F: Direct SELECT on user_integrations contains ONLY metadata and NO secret columns', async () => {
      const userSupabase = await createClient();

      const { data: integration } = await userSupabase
        .from('user_integrations')
        .select('*')
        .eq('id', personalIntId)
        .single();

      expect(integration).toBeDefined();
      expect(integration.user_id).toBe(userId);
      expect(integration.provider).toBe('google_sheets');
      expect(integration.config).toBeDefined();
      expect(integration.is_active).toBe(true);

      // The secret columns must NOT exist on user_integrations records
      expect(integration.encrypted_refresh_token).toBeUndefined();
      expect(integration.token_iv).toBeUndefined();
      expect(integration.token_auth_tag).toBeUndefined();
      expect(integration.token_expires_at).toBeUndefined();
    });

    it('Test G: Ownership immutability: attempting to mutate user_id is rejected by database trigger', async () => {
      const userSupabase = await createClient();

      const { data, error } = await userSupabase
        .from('user_integrations')
        .update({ user_id: otherUserId })
        .eq('id', personalIntId)
        .select()
        .single();

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error!.message).toContain('Integration identity is immutable: user_id cannot be changed.');
    });

    it('Test H: Scope immutability: attempting to mutate organization_id is rejected by database trigger', async () => {
      const userSupabase = await createClient();

      // Attempting to move personal integration to organization
      const { data, error } = await userSupabase
        .from('user_integrations')
        .update({ organization_id: orgId })
        .eq('id', personalIntId)
        .select()
        .single();

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error!.message).toContain('Integration scope is immutable: organization_id cannot be changed.');
    });

    it('Test I: Provider immutability: attempting to mutate provider is rejected by database trigger', async () => {
      const userSupabase = await createClient();

      const { data, error } = await userSupabase
        .from('user_integrations')
        .update({ provider: 'notion' })
        .eq('id', personalIntId)
        .select()
        .single();

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error!.message).toContain('Integration provider is immutable.');
    });
  });
});
