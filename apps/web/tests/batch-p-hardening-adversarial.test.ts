import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as completeAssignment } from '../app/api/worker/assignments/[id]/complete/route';
import { PATCH as updateAssignmentStatus } from '../app/api/worker/assignments/[id]/route';
import { GET as getWorkerActivity } from '../app/api/worker/activity/route';
import { GET as getWorkerAssignments } from '../app/api/worker/assignments/route';
import { POST as verifyApplication } from '../app/api/applications/[id]/verify/route';
import { PATCH as updateApplication } from '../app/api/applications/[id]/route';

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../lib/supabase/server';

describe('Batch P — Production Hardening & Adversarial Suite (P-01 to P-08)', () => {
  const orgA = '11111111-1111-1111-1111-111111111111';
  const orgB = '22222222-2222-2222-2222-222222222222';
  const workerA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const workerB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const assignmentA = '33333333-3333-3333-3333-333333333333';
  const assignmentB = '44444444-4444-4444-4444-444444444444';
  const appA = '55555555-5555-5555-5555-555555555555';
  const appB = '66666666-6666-6666-6666-666666666666';
  const jobId = '77777777-7777-7777-7777-777777777777';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. P-01 & P-08: Atomic Assignment Completion & Idempotency
  // =========================================================================
  describe('P-01 & P-08: Atomic Assignment Completion & Idempotency', () => {
    it('successfully and atomically completes assignment and logs application', async () => {
      const mockAssignment = {
        id: assignmentA,
        organization_id: orgA,
        job_id: jobId,
        worker_id: workerA,
        status: 'in_progress',
        notes: null,
      };

      const mockCompletedAssignment = {
        ...mockAssignment,
        status: 'completed',
        notes: 'Applied via Greenhouse',
      };

      const mockApplication = {
        id: appA,
        user_id: workerA,
        job_id: jobId,
        company_name: 'Acme Inc',
        job_title: 'Senior Engineer',
        status: 'applied',
        organization_id: orgA,
      };

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        rpc: vi.fn().mockResolvedValue({
          data: {
            assignment: mockCompletedAssignment,
            application: mockApplication,
            idempotent: false,
          },
          error: null,
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'Applied via Greenhouse',
          companyName: 'Acme Inc',
          jobTitle: 'Senior Engineer',
        }),
      });

      const res = await completeAssignment(req, { params: Promise.resolve({ id: assignmentA }) });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.assignment.status).toBe('completed');
      expect(json.data.application.status).toBe('applied');
      expect(json.data.idempotent).toBe(false);
    });

    it('repeated requests are idempotent and do not create duplicates', async () => {
      const mockCompletedAssignment = {
        id: assignmentA,
        organization_id: orgA,
        job_id: jobId,
        worker_id: workerA,
        status: 'completed',
        notes: 'Applied via Greenhouse',
      };

      const mockApplication = {
        id: appA,
        user_id: workerA,
        job_id: jobId,
        company_name: 'Acme Inc',
        job_title: 'Senior Engineer',
        status: 'applied',
      };

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        rpc: vi.fn().mockResolvedValue({
          data: {
            assignment: mockCompletedAssignment,
            application: mockApplication,
            idempotent: true,
          },
          error: null,
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'Applied via Greenhouse',
        }),
      });

      const res = await completeAssignment(req, { params: Promise.resolve({ id: assignmentA }) });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.idempotent).toBe(true);
      expect(json.data.assignment.status).toBe('completed');
    });

    it('rejects attempt to complete a skipped assignment (409 Conflict)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'CONFLICT: Cannot complete an assignment with status skipped.' },
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Trying to complete skipped' }),
      });

      const res = await completeAssignment(req, { params: Promise.resolve({ id: assignmentA }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('CONFLICT');
    });
  });

  // =========================================================================
  // 2. P-02: Assignment FSM Concurrency & TOCTOU Hardening
  // =========================================================================
  describe('P-02: Assignment FSM Concurrency & TOCTOU Hardening', () => {
    it('returns 409 Conflict when concurrent request mutates assignment before update commits', async () => {
      const maybeSingleMock = vi.fn()
        .mockResolvedValueOnce({
          // 1st call: read observation sees 'assigned'
          data: { id: assignmentA, worker_id: workerA, status: 'assigned' },
          error: null,
        })
        .mockResolvedValueOnce({
          // 2nd call: after update returns null, DB check finds it transitioned to 'skipped'!
          data: { id: assignmentA, worker_id: workerA, status: 'skipped' },
          error: null,
        });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'job_assignments') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: maybeSingleMock,
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                          data: null, // 0 rows modified because status was no longer 'assigned'!
                          error: { message: '0 rows updated' },
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });

      const res = await updateAssignmentStatus(req, { params: Promise.resolve({ id: assignmentA }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('State conflict');
    });

    it('idempotently returns 200 when assignment is already in targetStatus', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: assignmentA, worker_id: workerA, status: 'in_progress' },
            error: null,
          }),
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });

      const res = await updateAssignmentStatus(req, { params: Promise.resolve({ id: assignmentA }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe('in_progress');
    });
  });

  // =========================================================================
  // 3. P-07: Adversarial Multi-Tenant & Worker Isolation
  // =========================================================================
  describe('P-07: Adversarial Security & Isolation', () => {
    it('Worker A cannot complete Worker B assignment (403 Forbidden)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'FORBIDDEN: You are not authorized to complete this assignment.' },
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentB}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Attacking Worker B assignment' }),
      });

      const res = await completeAssignment(req, { params: Promise.resolve({ id: assignmentB }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('FORBIDDEN');
    });

    it('Worker A cannot mutate Worker B assignment via PATCH (404 Not Found due to row scoping)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null, // Scoped to worker_id = workerA -> returns null
            error: null,
          }),
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentB}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });

      const res = await updateAssignmentStatus(req, { params: Promise.resolve({ id: assignmentB }) });
      expect(res.status).toBe(404);
    });

    it('Worker A cannot submit verification for Worker B application (403 Forbidden)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appB,
                  user_id: workerB, // Belongs to Worker B
                  worker_id: workerB,
                  organization_id: orgA,
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
              single: vi.fn().mockResolvedValue({
                data: { role: 'worker' }, // Caller is regular worker, not platform admin
                error: null,
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/applications/${appB}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenshotUrl: `verification-screenshots/${orgA}/${appB}/evidence.png`,
        }),
      });

      const res = await verifyApplication(req, { params: Promise.resolve({ id: appB }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden');
    });

    it('Org A worker cannot query Org B activity stream (403 Forbidden)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: null, // Worker A is not in Org B
                error: null,
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { role: 'worker' }, // Regular worker, not platform superadmin
                error: null,
              }),
            };
          }
          return {};
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/activity?organizationId=${orgB}`);
      const res = await getWorkerActivity(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden');
    });

    it('rejects unauthenticated requests to complete endpoint (401 Unauthorized)', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}/complete`, {
        method: 'POST',
      });

      const res = await completeAssignment(req, { params: Promise.resolve({ id: assignmentA }) });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 4. P-06: Verification Upload Consistency & Storage Cleanup
  // =========================================================================
  describe('P-06: Verification Upload Consistency & Storage Cleanup', () => {
    it('cleans up uploaded storage file when verification RPC fails', async () => {
      const mockRemove = vi.fn().mockResolvedValue({ data: [], error: null });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'applications') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: appA,
                  user_id: workerA,
                  worker_id: workerA,
                  organization_id: orgA,
                  deleted_at: null,
                },
                error: null,
              }),
            };
          }
          return {};
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            remove: mockRemove,
          }),
        },
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database constraint violation during verification insert' },
        }),
      });

      const screenshotUrl = `verification-screenshots/${orgA}/${appA}/uploaded-proof.png`;
      const req = new NextRequest(`http://localhost:3000/api/applications/${appA}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screenshotUrl }),
      });

      const res = await verifyApplication(req, { params: Promise.resolve({ id: appA }) });
      expect(res.status).toBe(500);

      // Verify storage removal was triggered to prevent orphan file
      expect(mockRemove).toHaveBeenCalledTimes(1);
      expect(mockRemove).toHaveBeenCalledWith([`${orgA}/${appA}/uploaded-proof.png`]);
    });
  });

  // =========================================================================
  // 5. P-03 & P-04: Authoritative Activity Stream & Pagination
  // =========================================================================
  describe('P-03 & P-04: Authoritative Activity Stream & Pagination', () => {
    it('uses database-backed RPC pagination when available', async () => {
      const mockItems = [
        {
          id: 'asgn-ev-1',
          category: 'assignment',
          eventType: 'completed',
          title: 'Completed: Senior Engineer',
          description: 'Acme assignment marked as completed',
          occurredAt: '2026-09-05T08:00:00Z',
        },
      ];

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organization_members') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { role: 'worker', user_id: workerA, organization_id: orgA },
                error: null,
              }),
            };
          }
          return {};
        }),
        rpc: vi.fn().mockResolvedValue({
          data: {
            items: mockItems,
            total: 1,
            limit: 20,
            offset: 0,
            hasMore: false,
          },
          error: null,
        }),
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/activity?organizationId=${orgA}&limit=20&offset=0`);
      const res = await getWorkerActivity(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.data.items).toHaveLength(1);
      expect(json.data.items[0].eventType).toBe('completed');
      expect(json.data.total).toBe(1);
      expect(json.data.hasMore).toBe(false);
    });
  });

  // =========================================================================
  // 6. P-H01 to P-H04: Final Production Hardening & Tenancy Verification
  // =========================================================================
  describe('P-H01 to P-H04: Final Production Hardening & Tenancy Suite', () => {
    // -----------------------------------------------------------------------
    // Test A: Success — Atomically complete assignment & log application
    // -----------------------------------------------------------------------
    it('Test A (Success): Valid worker completes assigned job atomically', async () => {
      const mockCompletedAssignment = {
        id: assignmentA,
        organization_id: orgA,
        job_id: jobId,
        worker_id: workerA,
        status: 'completed',
        notes: 'Submitted via company portal',
      };
      const mockApplication = {
        id: appA,
        user_id: workerA,
        job_id: jobId,
        company_name: 'Tech Corp',
        job_title: 'Staff Architect',
        status: 'applied',
        organization_id: orgA,
      };

      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          assignment: mockCompletedAssignment,
          application: mockApplication,
          idempotent: false,
        },
        error: null,
      });

      const mockFrom = vi.fn();

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        rpc: mockRpc,
        from: mockFrom,
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'Submitted via company portal',
          companyName: 'Tech Corp',
          jobTitle: 'Staff Architect',
        }),
      });

      const res = await completeAssignment(req, { params: Promise.resolve({ id: assignmentA }) });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.assignment.status).toBe('completed');
      expect(json.data.application.status).toBe('applied');
      expect(json.data.idempotent).toBe(false);

      // Verify authoritative single-transaction call
      expect(mockRpc).toHaveBeenCalledWith('complete_assignment_with_application', {
        p_assignment_id: assignmentA,
        p_notes: 'Submitted via company portal',
        p_company_name: 'Tech Corp',
        p_job_title: 'Staff Architect',
      });

      // Crucial: No separate non-atomic table mutations were executed
      expect(mockFrom).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Test B: Transaction Failure — No partial mutation & no unsafe fallback (P-H01)
    // -----------------------------------------------------------------------
    it('Test B (Transaction Failure): RPC failure returns 500 without performing non-atomic fallback', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Transaction deadlock or serialized isolation failure' },
      });

      const mockFrom = vi.fn();

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        rpc: mockRpc,
        from: mockFrom,
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'Failing transaction test',
        }),
      });

      const res = await completeAssignment(req, { params: Promise.resolve({ id: assignmentA }) });
      expect(res.status).toBe(500);
      const json = await res.json();

      expect(json.success).toBe(false);
      expect(json.error).toContain('Failed to complete assignment atomically');

      // CRITICAL P-H01 INVARIANT:
      // The API MUST NOT fall back to manually mutating job_assignments or applications
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('Test B (PATCH route): PATCH with completed status refuses non-atomic fallback on RPC failure', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database constraint violation during application upsert' },
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: assignmentA, worker_id: workerA, status: 'in_progress' },
          error: null,
        }),
        update: vi.fn(), // Should NEVER be called for status: 'completed'
      });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        rpc: mockRpc,
        from: mockFrom,
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          notes: 'PATCH attempt that fails RPC',
        }),
      });

      const res = await updateAssignmentStatus(req, { params: Promise.resolve({ id: assignmentA }) });
      expect(res.status).toBe(500);
      const json = await res.json();

      expect(json.success).toBe(false);
      expect(json.error).toContain('Failed to complete assignment atomically');

      // Verify that update was never called on job_assignments table
      const fromResult = mockFrom('job_assignments');
      expect(fromResult.update).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Test C: Retry Idempotency — Re-running completion returns idempotent result
    // -----------------------------------------------------------------------
    it('Test C (Retry Idempotency): Repeating completion request returns idempotent state without duplicate records', async () => {
      const mockCompletedAssignment = {
        id: assignmentA,
        organization_id: orgA,
        job_id: jobId,
        worker_id: workerA,
        status: 'completed',
        notes: 'Original note',
      };
      const mockExistingApplication = {
        id: appA,
        user_id: workerA,
        job_id: jobId,
        status: 'applied',
        organization_id: orgA,
      };

      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          assignment: mockCompletedAssignment,
          application: mockExistingApplication,
          idempotent: true,
        },
        error: null,
      });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        rpc: mockRpc,
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Retried completion' }),
      });

      const res = await completeAssignment(req, { params: Promise.resolve({ id: assignmentA }) });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.idempotent).toBe(true);
      expect(json.data.assignment.status).toBe('completed');
    });

    // -----------------------------------------------------------------------
    // Test D: Concurrency — Concurrent completion attempts resolve safely
    // -----------------------------------------------------------------------
    it('Test D (Concurrent Completion): Race condition resolves with one primary mutation and one idempotent response', async () => {
      const mockCompletedAssignment = {
        id: assignmentA,
        organization_id: orgA,
        job_id: jobId,
        worker_id: workerA,
        status: 'completed',
      };
      const mockApplication = {
        id: appA,
        user_id: workerA,
        job_id: jobId,
        status: 'applied',
        organization_id: orgA,
      };

      // In Postgres, the first transaction acquires FOR UPDATE and commits idempotent: false.
      // The second transaction acquires the lock next, observes status = 'completed', and commits idempotent: true.
      let callCount = 0;
      const mockRpc = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          data: {
            assignment: mockCompletedAssignment,
            application: mockApplication,
            idempotent: callCount > 1,
          },
          error: null,
        });
      });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        rpc: mockRpc,
      });

      const req1 = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Thread 1' }),
      });
      const req2 = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Thread 2' }),
      });

      const [res1, res2] = await Promise.all([
        completeAssignment(req1, { params: Promise.resolve({ id: assignmentA }) }),
        completeAssignment(req2, { params: Promise.resolve({ id: assignmentA }) }),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const json1 = await res1.json();
      const json2 = await res2.json();

      expect(json1.data.assignment.status).toBe('completed');
      expect(json2.data.assignment.status).toBe('completed');

      // Exactly one was the primary completion and the other was acknowledged idempotently
      const idempotentResults = [json1.data.idempotent, json2.data.idempotent];
      expect(idempotentResults).toContain(false);
      expect(idempotentResults).toContain(true);
    });

    // -----------------------------------------------------------------------
    // P-H02: Anonymous Access Rejection
    // -----------------------------------------------------------------------
    it('P-H02 (Anonymous Access): Rejects unauthenticated caller with 401 at the API layer', async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Unauthorized') }),
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Anon attack' }),
      });

      const res = await completeAssignment(req, { params: Promise.resolve({ id: assignmentA }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    // -----------------------------------------------------------------------
    // P-H03: Application Tenancy Invariant — Multi-Org Conflict Behavior
    // -----------------------------------------------------------------------
    it('P-H03 (Application Tenancy): Respects global candidate (user, job) uniqueness while attributing or preserving organization provenance', async () => {
      // Invariant: Candidate applications represent 1:1 job application records for a real-world position.
      // If Worker A was assigned Job X under Org A, the application is associated with Org A.
      // If Worker A previously applied under Org B, Org B provenance is preserved.
      const mockCompletedAssignment = {
        id: assignmentA,
        organization_id: orgA,
        job_id: jobId,
        worker_id: workerA,
        status: 'completed',
      };
      const mockPreservedApplication = {
        id: appA,
        user_id: workerA,
        job_id: jobId,
        status: 'applied',
        organization_id: orgB, // Preserved pre-existing Org B provenance
      };

      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          assignment: mockCompletedAssignment,
          application: mockPreservedApplication,
          idempotent: false,
        },
        error: null,
      });

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: workerA } }, error: null }),
        },
        rpc: mockRpc,
      });

      const req = new NextRequest(`http://localhost:3000/api/worker/assignments/${assignmentA}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Cross-org resolution check' }),
      });

      const res = await completeAssignment(req, { params: Promise.resolve({ id: assignmentA }) });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.data.assignment.organization_id).toBe(orgA);
      expect(json.data.application.organization_id).toBe(orgB);
      expect(mockRpc).toHaveBeenCalledWith('complete_assignment_with_application', {
        p_assignment_id: assignmentA,
        p_notes: 'Cross-org resolution check',
        p_company_name: null,
        p_job_title: null,
      });
    });
  });
});
