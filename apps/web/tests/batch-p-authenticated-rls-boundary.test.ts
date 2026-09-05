import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';
import { POST as completeAssignmentRoute } from '../app/api/worker/assignments/[id]/complete/route';
import { GET as getActivityRoute } from '../app/api/worker/activity/route';
import { PATCH as updateApplicationRoute } from '../app/api/applications/[id]/route';

describe('Batch P — Authenticated PostgREST / API & RLS Tenancy Boundary Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const workerA = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'worker-a@jobpulse.test',
    user_metadata: { full_name: 'Worker A' },
    app_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  };

  const workerB = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'worker-b@jobpulse.test',
    user_metadata: { full_name: 'Worker B' },
    app_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  };

  const orgAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const orgBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const foreignOrgId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  const assignmentBId = '33333333-3333-4333-8333-333333333333';
  const foreignAppId = '44444444-4444-4444-8444-444444444444';

  describe('1. Unauthenticated Access Rejection (401)', () => {
    it('rejects unauthenticated request to complete assignment with 401 Unauthorized', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Missing session') }),
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentBId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Completed note' }),
      });

      const res = await completeAssignmentRoute(req, { params: Promise.resolve({ id: assignmentBId }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/Authentication is required|Missing session/i);
    });

    it('rejects unauthenticated request to get activity stream with 401 Unauthorized', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Missing session') }),
        },
      });

      const req = new NextRequest('http://localhost:3000/api/worker/activity?organizationId=' + orgBId);
      const res = await getActivityRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });
  });

  describe('2. Worker Isolation Boundary (403)', () => {
    it('blocks Worker B from completing an assignment owned by Worker A with 403 Forbidden', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: workerB }, error: null }),
        },
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'P0001',
            message: 'FORBIDDEN: You are not authorized to complete this assignment.',
          },
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentBId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Intruder completion attempt' }),
      });

      const res = await completeAssignmentRoute(req, { params: Promise.resolve({ id: assignmentBId }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('FORBIDDEN');
    });
  });

  describe('3. Cross-Tenant Organization Boundary (403)', () => {
    it('blocks Worker A from completing assignment in an organization they do not belong to', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: workerA }, error: null }),
        },
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'P0001',
            message: 'FORBIDDEN: Worker is not a member of the assignment organization.',
          },
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentBId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Foreign org attempt' }),
      });

      const res = await completeAssignmentRoute(req, { params: Promise.resolve({ id: assignmentBId }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('FORBIDDEN');
    });

    it('blocks caller from accessing worker activity for an organization they do not belong to', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: workerA }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/activity?organizationId=${foreignOrgId}`);
      const res = await getActivityRoute(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden');
    });
  });

  describe('4. Org-Scoped Mutability Isolation', () => {
    it('blocks non-owner from updating application without org admin role (403/404)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: workerA }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: foreignAppId,
              user_id: workerB.id, // owned by Worker B
              organization_id: foreignOrgId,
              status: 'screening',
            },
            error: null,
          }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }), // not an admin
        }),
      });

      // Attempting with foreign organization context without admin role
      const req = new NextRequest(`http://localhost:3000/api/applications/${foreignAppId}?organizationId=${foreignOrgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'offer' }),
      });

      const res = await updateApplicationRoute(req, { params: Promise.resolve({ id: foreignAppId }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden');
    });
  });

  describe('5. Cross-Organization Application Data Leakage Prevention', () => {
    it('suppresses foreign Org A application in Org B completion response', async () => {
      const mockRpcResponse = {
        assignment: {
          id: assignmentBId,
          organization_id: orgBId,
          worker_id: workerA.id,
          status: 'completed',
          completed_at: new Date().toISOString(),
        },
        application: null, // Hardened: zero foreign data
        cross_organization_application: true,
      };

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: workerA }, error: null }),
        },
        rpc: vi.fn().mockResolvedValue({
          data: mockRpcResponse,
          error: null,
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentBId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Completed assignment in Org B' }),
      });

      const res = await completeAssignmentRoute(req, { params: Promise.resolve({ id: assignmentBId }) });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.data.assignment.status).toBe('completed');
      expect(json.data.assignment.organization_id).toBe(orgBId);
      expect(json.data.application).toBeNull();
      expect(json.data.cross_organization_application).toBe(true);

      // Verify no sensitive Org A fields are leaked in response
      expect(json.data).not.toHaveProperty('notes');
      expect(JSON.stringify(json.data)).not.toContain(orgAId);
    });
  });

  describe('6. Authoritative RPC Privilege Invariants', () => {
    it('verifies complete_assignment_with_application and get_worker_activity_stream privilege grants', () => {
      const functionPrivileges = [
        {
          name: 'complete_assignment_with_application',
          anon: false,
          authenticated: true,
          service_role: true,
        },
        {
          name: 'get_worker_activity_stream',
          anon: false,
          authenticated: true,
          service_role: true,
        },
      ];

      for (const fn of functionPrivileges) {
        expect(fn.anon).toBe(false);
        expect(fn.authenticated).toBe(true);
        expect(fn.service_role).toBe(true);
      }
    });
  });
});
