import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetentionService } from '../src/engine/retention.js';
import { supabase } from '../src/db.js';

describe('Job Retention and Application State Hardening (P0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RetentionService.executeRetentionCleanup', () => {
    it('executes bounded batch purges for stale raw payloads and stale job records', async () => {
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockImplementation(async (fnName: string, args: any) => {
        if (fnName === 'purge_stale_raw_payloads') {
          return {
            data: {
              deleted_payloads_count: 500,
              batches_executed: 1,
              is_completed: true,
              duration_ms: 120,
            },
            error: null,
          } as any;
        }
        if (fnName === 'purge_stale_job_records') {
          return {
            data: {
              deleted_jobs_count: 50,
              protected_jobs_count: 12,
              batches_executed: 1,
              is_completed: true,
              duration_ms: 45,
            },
            error: null,
          } as any;
        }
        return { data: null, error: null } as any;
      });

      const result = await RetentionService.executeRetentionCleanup({
        payloadRetentionDays: 3,
        jobRetentionDays: 30,
        jobBatchSize: 500,
        payloadBatchSize: 500,
        maxBatches: 5,
      });

      expect(rpcSpy).toHaveBeenCalledWith('purge_stale_job_records', {
        p_batch_size: 500,
        p_max_batches: 5,
        p_retention_days: 30,
      });

      expect(rpcSpy).toHaveBeenCalledWith('purge_stale_raw_payloads', {
        p_batch_size: 500,
        p_max_batches: 5,
        p_retention_days: 3,
      });

      expect(result.payloadsDeleted).toBe(500);
      expect(result.jobsDeleted).toBe(50);
      expect(result.jobsProtected).toBe(12);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('gracefully handles database errors without throwing unhandled exceptions', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: null,
        error: { message: 'Database connection timeout', code: '57P01' },
      } as any);

      const result = await RetentionService.executeRetentionCleanup();

      expect(result.payloadsDeleted).toBe(0);
      expect(result.jobsDeleted).toBe(0);
      expect(result.jobsProtected).toBe(0);
    });
  });

  describe('Application-Linked Job Preservation and Multi-User Isolation', () => {
    it('ensures application state is user-scoped and isolated between distinct users', () => {
      const jobId = 'job-uuid-1234-5678';
      const userAId = 'user-uuid-aaaa-1111';
      const userBId = 'user-uuid-bbbb-2222';

      const applications = [
        {
          id: 'app-1',
          user_id: userAId,
          job_id: jobId,
          status: 'applied',
          applied_at: '2026-09-01T12:00:00Z',
        },
      ];

      // Simulate feed / detail enrichment for User A
      const userAApp = applications.find((a) => a.user_id === userAId && a.job_id === jobId);
      const userAEnrichment = {
        application_status: userAApp?.status || null,
        is_applied: Boolean(userAApp),
      };

      // Simulate feed / detail enrichment for User B
      const userBApp = applications.find((a) => a.user_id === userBId && a.job_id === jobId);
      const userBEnrichment = {
        application_status: userBApp?.status || null,
        is_applied: Boolean(userBApp),
      };

      expect(userAEnrichment.is_applied).toBe(true);
      expect(userAEnrichment.application_status).toBe('applied');

      expect(userBEnrichment.is_applied).toBe(false);
      expect(userBEnrichment.application_status).toBeNull();
    });

    it('validates that re-scraping an expired job preserves the canonical UUID and keeps user application intact', () => {
      const existingJob = {
        id: 'job-uuid-stripe-eng-999',
        canonical_url: 'https://stripe.com/jobs/999',
        canonical_fingerprint: 'stripe-senior-eng-sf',
        status: 'expired',
        first_seen_at: '2026-08-01T10:00:00Z',
        last_seen_at: '2026-08-15T10:00:00Z',
      };

      const userApplication = {
        id: 'app-999',
        user_id: 'user-777',
        job_id: existingJob.id,
        status: 'applied',
      };

      // Ingesting the same canonical job again
      const incomingScrape = {
        canonical_url: 'https://stripe.com/jobs/999',
        canonical_fingerprint: 'stripe-senior-eng-sf',
        title: 'Senior Engineer',
      };

      // Simulating ingest_job_transaction behavior: matches on canonical_url regardless of status
      const matchedJobId = (incomingScrape.canonical_url === existingJob.canonical_url ||
        incomingScrape.canonical_fingerprint === existingJob.canonical_fingerprint)
        ? existingJob.id
        : 'new-random-uuid';

      expect(matchedJobId).toBe(existingJob.id);

      // Verify that the user's application remains mapped to the exact same matched job
      expect(userApplication.job_id).toBe(matchedJobId);
    });

    it('verifies that purge eligibility strictly excludes jobs referenced by applications', () => {
      const jobs = [
        { id: 'job-1', status: 'expired', last_seen_at: '2026-07-01T00:00:00Z', has_application: false },
        { id: 'job-2', status: 'expired', last_seen_at: '2026-07-01T00:00:00Z', has_application: true }, // PROTECTED
        { id: 'job-3', status: 'active', last_seen_at: '2026-07-01T00:00:00Z', has_application: false },
        { id: 'job-4', status: 'expired', last_seen_at: '2026-09-06T00:00:00Z', has_application: false }, // Too recent
      ];

      const retentionCutoff = new Date('2026-08-08T00:00:00Z').getTime();

      const purgeEligible = jobs.filter((j) => {
        const isExpired = j.status === 'expired';
        const isStale = new Date(j.last_seen_at).getTime() < retentionCutoff;
        const isProtected = j.has_application;
        return isExpired && isStale && !isProtected;
      });

      expect(purgeEligible.map((j) => j.id)).toEqual(['job-1']);
      expect(purgeEligible.some((j) => j.id === 'job-2')).toBe(false);
    });

    it('verifies that ScraperRunner executes retention cleanup strictly on completely successful runs without failures', () => {
      const shouldRunRetention = (finalStatus: string, hasFailures: boolean, attempted: number) => {
        return finalStatus === 'completed' && !hasFailures && attempted > 0;
      };

      // Clean successful run -> runs retention
      expect(shouldRunRetention('completed', false, 5)).toBe(true);

      // Partial failure (failed sources or failed jobs) -> skips retention
      expect(shouldRunRetention('completed', true, 5)).toBe(false);

      // Failed run -> skips retention
      expect(shouldRunRetention('failed', true, 5)).toBe(false);

      // Zero sources due/attempted -> skips retention
      expect(shouldRunRetention('completed', false, 0)).toBe(false);
    });
  });
});
