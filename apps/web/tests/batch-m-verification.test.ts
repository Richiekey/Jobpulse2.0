import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET as getVerification,
  POST as postVerification,
  PATCH as patchVerification,
} from '../app/api/applications/[id]/verify/route';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';

describe('Batch M — Screenshot Verification & Storage Suite', () => {
  const appId = '11111111-1111-1111-1111-111111111111';
  const orgId = '22222222-2222-2222-2222-222222222222';
  const otherOrgId = '99999999-9999-9999-9999-999999999999';
  const workerUserId = '33333333-3333-3333-3333-333333333333';
  const adminUserId = '44444444-4444-4444-4444-444444444444';
  const attackerUserId = '55555555-5555-5555-5555-555555555555';
  const verifId = '66666666-6666-6666-6666-666666666666';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. AUTHENTICATION (401)
  // ---------------------------------------------------------------------------
  describe('Authentication Enforcement (401)', () => {
    const mockUnauthenticated = () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: new Error('Missing session'),
          }),
        },
      });
    };

    it('rejects unauthenticated GET with 401', async () => {
      mockUnauthenticated();
      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`);
      const res = await getVerification(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Authentication is required');
    });

    it('rejects unauthenticated POST with 401', async () => {
      mockUnauthenticated();
      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ screenshotUrl: 'verification-screenshots/shot.png' }),
      });
      const res = await postVerification(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it('rejects unauthenticated PATCH with 401', async () => {
      mockUnauthenticated();
      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'verified' }),
      });
      const res = await patchVerification(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. VALIDATION (400)
  // ---------------------------------------------------------------------------
  describe('Input Validation & Format Enforcement (400)', () => {
    const mockAuthUser = (userId: string) => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: userId, email: 'user@test.com' } },
          error: null,
        }),
      },
    });

    it('rejects malformed UUID in route parameter with 400', async () => {
      (createClient as any).mockResolvedValue(mockAuthUser(workerUserId));

      const req = new NextRequest('http://localhost/api/applications/invalid-uuid/verify');
      const res = await getVerification(req, { params: Promise.resolve({ id: 'invalid-uuid' }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('valid UUID');
    });

    it('rejects POST with external https or http URL with 400', async () => {
      (createClient as any).mockResolvedValue(mockAuthUser(workerUserId));

      const httpsReq = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ screenshotUrl: 'https://external-site.com/evidence.png' }),
      });
      const httpsRes = await postVerification(httpsReq, { params: Promise.resolve({ id: appId }) });
      const httpsJson = await httpsRes.json();

      expect(httpsRes.status).toBe(400);
      expect(httpsJson.error).toContain('external URLs are strictly prohibited');

      const httpReq = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ screenshotUrl: 'http://malicious.io/shot.png' }),
      });
      const httpRes = await postVerification(httpReq, { params: Promise.resolve({ id: appId }) });
      const httpJson = await httpRes.json();

      expect(httpRes.status).toBe(400);
      expect(httpJson.error).toContain('external URLs are strictly prohibited');
    });

    it('rejects POST with arbitrary storage path outside verification-screenshots/', async () => {
      (createClient as any).mockResolvedValue(mockAuthUser(workerUserId));

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ screenshotUrl: 'resumes/applicant-cv.png' }),
      });
      const res = await postVerification(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('verification-screenshots/');
    });

    it('rejects POST with unsupported screenshot extension', async () => {
      (createClient as any).mockResolvedValue(mockAuthUser(workerUserId));

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ screenshotUrl: 'verification-screenshots/evidence.pdf' }),
      });
      const res = await postVerification(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('verification-screenshots/');
    });

    it('rejects POST with path traversal attempt in storage path', async () => {
      (createClient as any).mockResolvedValue(mockAuthUser(workerUserId));

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ screenshotUrl: 'verification-screenshots/../../secret/shot.png' }),
      });
      const res = await postVerification(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('verification-screenshots/');
    });

    it('rejects PATCH with invalid review status', async () => {
      (createClient as any).mockResolvedValue(mockAuthUser(adminUserId));

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'pending' }),
      });
      const res = await patchVerification(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain("Review status must be either 'verified' or 'rejected'");
    });

    it('rejects PATCH with oversized reviewer notes (> 1000 characters)', async () => {
      (createClient as any).mockResolvedValue(mockAuthUser(adminUserId));

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected', reviewerNotes: 'x'.repeat(1001) }),
      });
      const res = await patchVerification(req, { params: Promise.resolve({ id: appId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('cannot exceed 1000 characters');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. SOFT DELETION COMPATIBILITY (404)
  // ---------------------------------------------------------------------------
  describe('Soft-Deletion Compatibility (Batch L Invariant)', () => {
    it('returns 404 for GET on soft-deleted application', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appId,
                  user_id: workerUserId,
                  organization_id: orgId,
                  deleted_at: '2026-09-04T10:00:00.000Z',
                  verification_status: 'pending',
                },
                error: null,
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`);
      const res = await getVerification(req, { params: Promise.resolve({ id: appId }) });

      expect(res.status).toBe(404);
    });

    it('returns 404 for POST on soft-deleted application', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appId,
                  user_id: workerUserId,
                  deleted_at: '2026-09-04T10:00:00.000Z',
                },
                error: null,
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ screenshotUrl: 'verification-screenshots/evidence.png' }),
      });
      const res = await postVerification(req, { params: Promise.resolve({ id: appId }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('archived or deleted');
    });

    it('returns 404 for PATCH on soft-deleted application', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appId,
                  organization_id: orgId,
                  deleted_at: '2026-09-04T10:00:00.000Z',
                },
                error: null,
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'verified' }),
      });
      const res = await patchVerification(req, { params: Promise.resolve({ id: appId }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('archived or deleted');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. AUTHORIZATION & TENANT ISOLATION (403)
  // ---------------------------------------------------------------------------
  describe('Authorization & Multi-Tenant Boundaries (403)', () => {
    it('blocks unauthorized worker from submitting verification for unassigned application', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: attackerUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appId,
                  user_id: workerUserId, // Owned by another worker
                  worker_id: null,
                  organization_id: orgId,
                  deleted_at: null,
                },
                error: null,
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { role: 'worker' }, error: null }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ screenshotUrl: 'verification-screenshots/evidence.png' }),
      });
      const res = await postVerification(req, { params: Promise.resolve({ id: appId }) });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('not authorized to submit verification');
    });

    it('blocks regular worker from reviewing verification (PATCH requires Org Admin)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appId,
                  organization_id: orgId,
                  deleted_at: null,
                },
                error: null,
              }),
            };
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'mem-1',
                  organization_id: orgId,
                  user_id: workerUserId,
                  role: 'worker', // Worker role, NOT admin/owner!
                },
                error: null,
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { role: 'worker' }, error: null }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'verified' }),
      });
      const res = await patchVerification(req, { params: Promise.resolve({ id: appId }) });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Only organization administrators or platform administrators');
    });

    it('blocks cross-tenant Org Admin from reviewing another organization application', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appId,
                  organization_id: otherOrgId, // Belongs to Other Org!
                  deleted_at: null,
                },
                error: null,
              }),
            };
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: null, // Not a member of otherOrgId!
                error: null,
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { role: 'user' }, error: null }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'verified' }),
      });
      const res = await patchVerification(req, { params: Promise.resolve({ id: appId }) });

      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. SUCCESSFUL WORKFLOWS & ATOMIC RPCS
  // ---------------------------------------------------------------------------
  describe('Successful Verification Lifecycle', () => {
    it('submits verification evidence with 201 Created and calls atomic RPC', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          id: verifId,
          application_id: appId,
          organization_id: orgId,
          worker_id: workerUserId,
          screenshot_url: 'verification-screenshots/evidence.png',
          status: 'pending',
          created_at: '2026-09-04T12:00:00.000Z',
        },
        error: null,
      });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appId,
                  user_id: workerUserId,
                  worker_id: workerUserId,
                  organization_id: orgId,
                  deleted_at: null,
                  status: 'applied',
                },
                error: null,
              }),
            };
          }
          return {};
        }),
        rpc: mockRpc,
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          screenshotUrl: 'verification-screenshots/evidence.png',
          idempotencyKey: 'key-12345',
        }),
      });
      const res = await postVerification(req, { params: Promise.resolve({ id: appId }) });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('pending');
      expect(mockRpc).toHaveBeenCalledWith('submit_application_verification', {
        p_application_id: appId,
        p_screenshot_url: 'verification-screenshots/evidence.png',
        p_idempotency_key: 'key-12345',
      });
    });

    it('approves verification with 200 OK via Org Admin review', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          id: verifId,
          application_id: appId,
          status: 'verified',
          reviewer_id: adminUserId,
          reviewer_notes: 'Evidence verified.',
          reviewed_at: '2026-09-04T12:05:00.000Z',
        },
        error: null,
      });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appId,
                  organization_id: orgId,
                  deleted_at: null,
                },
                error: null,
              }),
            };
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'mem-admin-1',
                  organization_id: orgId,
                  user_id: adminUserId,
                  role: 'admin',
                },
                error: null,
              }),
            };
          }
          if (table === 'application_verifications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: verifId,
                  application_id: appId,
                  status: 'pending', // Currently pending
                },
                error: null,
              }),
            };
          }
          return {};
        }),
        rpc: mockRpc,
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'verified',
          reviewerNotes: 'Evidence verified.',
        }),
      });
      const res = await patchVerification(req, { params: Promise.resolve({ id: appId }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('verified');
      expect(mockRpc).toHaveBeenCalledWith('review_application_verification', {
        p_verification_id: verifId,
        p_status: 'verified',
        p_reviewer_notes: 'Evidence verified.',
      });
    });

    it('rejects verification with 200 OK and reviewer explanation notes', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          id: verifId,
          application_id: appId,
          status: 'rejected',
          reviewer_id: adminUserId,
          reviewer_notes: 'Screenshot blurred and missing timestamp.',
          reviewed_at: '2026-09-04T12:10:00.000Z',
        },
        error: null,
      });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: appId, organization_id: orgId, deleted_at: null },
                error: null,
              }),
            };
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'mem-admin-1', organization_id: orgId, user_id: adminUserId, role: 'owner' },
                error: null,
              }),
            };
          }
          if (table === 'application_verifications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: verifId, application_id: appId, status: 'pending' },
                error: null,
              }),
            };
          }
          return {};
        }),
        rpc: mockRpc,
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'rejected',
          reviewerNotes: 'Screenshot blurred and missing timestamp.',
        }),
      });
      const res = await patchVerification(req, { params: Promise.resolve({ id: appId }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('rejected');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. STATE-MACHINE ATTACKS & TERMINAL LOCKS (409)
  // ---------------------------------------------------------------------------
  describe('State-Machine Invariants & Terminal State Locking (409)', () => {
    it('strictly forbids transitioning already verified record to rejected (409 Conflict)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: appId, organization_id: orgId, deleted_at: null },
                error: null,
              }),
            };
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'mem-admin-1', organization_id: orgId, user_id: adminUserId, role: 'admin' },
                error: null,
              }),
            };
          }
          if (table === 'application_verifications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: verifId,
                  application_id: appId,
                  status: 'verified', // Already terminal verified!
                },
                error: null,
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({
          verificationId: verifId,
          status: 'rejected',
        }),
      });
      const res = await patchVerification(req, { params: Promise.resolve({ id: appId }) });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('Terminal state transition prohibited: Verification is already verified');
    });

    it('strictly forbids repeated review on already rejected record (409 Conflict)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: adminUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: appId, organization_id: orgId, deleted_at: null },
                error: null,
              }),
            };
          }
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'mem-admin-1', organization_id: orgId, user_id: adminUserId, role: 'admin' },
                error: null,
              }),
            };
          }
          if (table === 'application_verifications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: verifId,
                  application_id: appId,
                  status: 'rejected', // Already terminal rejected!
                },
                error: null,
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({
          verificationId: verifId,
          status: 'verified',
        }),
      });
      const res = await patchVerification(req, { params: Promise.resolve({ id: appId }) });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('Terminal state transition prohibited: Verification is already rejected');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. PRIVATE STORAGE & SIGNED URLS
  // ---------------------------------------------------------------------------
  describe('Private Storage & Signed URL Retrieval (GET)', () => {
    it('returns verifications enriched with signed URLs for private storage screenshots', async () => {
      const mockCreateSignedUrl = vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://supabase.co/storage/v1/object/sign/verification-screenshots/org-1/app-1/shot.png?token=exp123' },
        error: null,
      });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appId,
                  user_id: workerUserId,
                  organization_id: orgId,
                  deleted_at: null,
                  verification_status: 'pending',
                },
                error: null,
              }),
            };
          }
          if (table === 'application_verifications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: verifId,
                    application_id: appId,
                    organization_id: orgId,
                    worker_id: workerUserId,
                    screenshot_url: 'verification-screenshots/org-1/app-1/shot.png',
                    status: 'pending',
                    reviewer_id: null,
                    reviewer_notes: null,
                    reviewed_at: null,
                    idempotency_key: null,
                    created_at: '2026-09-04T12:00:00.000Z',
                    updated_at: '2026-09-04T12:00:00.000Z',
                  },
                ],
                error: null,
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [{ id: workerUserId, email: 'worker@test.com', full_name: 'Worker Bob', avatar_url: null }],
                error: null,
              }),
            };
          }
          return {};
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            createSignedUrl: mockCreateSignedUrl,
          }),
        },
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`);
      const res = await getVerification(req, { params: Promise.resolve({ id: appId }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.verifications).toHaveLength(1);
      expect(json.data.verifications[0].signedUrl).toContain('token=exp123');
      expect(json.data.verifications[0].worker.fullName).toBe('Worker Bob');
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('org-1/app-1/shot.png', 3600);
    });

    it('strictly refuses to pass through external HTTP URLs as signedUrl evidence', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: workerUserId } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appId,
                  user_id: workerUserId,
                  organization_id: orgId,
                  deleted_at: null,
                  verification_status: 'pending',
                },
                error: null,
              }),
            };
          }
          if (table === 'application_verifications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: verifId,
                    application_id: appId,
                    organization_id: orgId,
                    worker_id: workerUserId,
                    screenshot_url: 'https://attacker.io/fake-proof.png', // legacy or malformed record
                    status: 'pending',
                    reviewer_id: null,
                    reviewer_notes: null,
                    reviewed_at: null,
                    idempotency_key: null,
                    created_at: '2026-09-04T12:00:00.000Z',
                    updated_at: '2026-09-04T12:00:00.000Z',
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
        storage: {
          from: vi.fn().mockReturnValue({
            createSignedUrl: vi.fn(),
          }),
        },
      });

      const req = new NextRequest(`http://localhost/api/applications/${appId}/verify`);
      const res = await getVerification(req, { params: Promise.resolve({ id: appId }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      // Evidence must NOT echo raw external URL as signedUrl!
      expect(json.data.verifications[0].signedUrl).toBeNull();
    });
  });
});
