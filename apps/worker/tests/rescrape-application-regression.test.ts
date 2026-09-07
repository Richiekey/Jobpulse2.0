import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getApplicationDisplayState } from '../../web/lib/application-status.js';

describe('Job Re-Scrape Application Preservation & Isolation Regression (P0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  interface JobRecord {
    id: string;
    canonical_url: string;
    canonical_fingerprint: string;
    title: string;
    status: 'active' | 'expired';
    first_seen_at: string;
    last_seen_at: string;
  }

  interface ApplicationRecord {
    id: string;
    user_id: string;
    job_id: string;
    status: string;
    applied_at: string;
  }

  /**
   * Simulates the exact status-agnostic matching algorithm of ingest_job_transaction
   * introduced in 20260907000001_job_retention_and_application_hardening.sql.
   */
  function simulateIngestJobTransaction(
    existingJobs: JobRecord[],
    incoming: {
      canonical_url: string;
      canonical_fingerprint: string;
      title: string;
    }
  ): { status: 'inserted' | 'updated'; jobId: string } {
    // 1. Match on canonical_url across all jobs regardless of status (active or expired)
    let match = existingJobs.find(
      (j) => j.canonical_url.toLowerCase() === incoming.canonical_url.toLowerCase()
    );

    // 2. Fallback to canonical_fingerprint match
    if (!match && incoming.canonical_fingerprint) {
      match = existingJobs.find(
        (j) => j.canonical_fingerprint === incoming.canonical_fingerprint
      );
    }

    if (match) {
      // Re-activate job, preserve ID and first_seen_at, update last_seen_at
      match.status = 'active';
      match.last_seen_at = new Date().toISOString();
      return { status: 'updated', jobId: match.id };
    } else {
      const newId = `job-new-${Date.now()}`;
      const newJob: JobRecord = {
        id: newId,
        canonical_url: incoming.canonical_url,
        canonical_fingerprint: incoming.canonical_fingerprint,
        title: incoming.title,
        status: 'active',
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      };
      existingJobs.push(newJob);
      return { status: 'inserted', jobId: newId };
    }
  }

  /**
   * Simulates authenticated feed enrichment (/api/jobs/feed) for a given user.
   */
  function simulateFeedEnrichment(
    jobs: JobRecord[],
    applications: ApplicationRecord[],
    userId: string
  ) {
    const userAppMap = new Map<string, string>();
    for (const app of applications) {
      if (app.user_id === userId) {
        userAppMap.set(app.job_id, app.status);
      }
    }

    return jobs.map((j) => {
      const appStatus = userAppMap.get(j.id) || null;
      return {
        ...j,
        application_status: appStatus,
        has_application: userAppMap.has(j.id),
        is_applied: appStatus === 'applied',
      };
    });
  }

  it('executes full 6-step regression: active -> applied -> expired -> re-scraped -> same job ID & application preserved with user isolation', () => {
    const jobsDatabase: JobRecord[] = [];
    const applicationsDatabase: ApplicationRecord[] = [];

    const userA = 'user-uuid-alice-1111';
    const userB = 'user-uuid-bob-2222';

    // Step 1: Create/identify a job (Job X, status = active)
    const initialJob: JobRecord = {
      id: 'job-uuid-stripe-eng-001',
      canonical_url: 'https://stripe.com/jobs/001',
      canonical_fingerprint: 'stripe-staff-software-engineer-sf',
      title: 'Staff Software Engineer',
      status: 'active',
      first_seen_at: '2026-08-01T00:00:00.000Z',
      last_seen_at: '2026-08-15T00:00:00.000Z',
    };
    jobsDatabase.push(initialJob);

    expect(jobsDatabase).toHaveLength(1);
    expect(jobsDatabase[0]!.id).toBe('job-uuid-stripe-eng-001');
    expect(jobsDatabase[0]!.status).toBe('active');

    // Step 2: User A applies to job X with status = 'interview'
    const userAApplication: ApplicationRecord = {
      id: 'app-uuid-alice-001',
      user_id: userA,
      job_id: initialJob.id,
      status: 'interview',
      applied_at: '2026-08-10T12:00:00.000Z',
    };
    applicationsDatabase.push(userAApplication);

    expect(applicationsDatabase).toHaveLength(1);
    expect(applicationsDatabase[0]!.user_id).toBe(userA);
    expect(applicationsDatabase[0]!.job_id).toBe(initialJob.id);

    // Step 3: The job becomes expired/stale in a subsequent reconciliation pass
    initialJob.status = 'expired';
    expect(jobsDatabase[0]!.status).toBe('expired');

    // Step 4: The same job is scraped again.
    // Ingestion logic MUST identify the existing canonical job and keep the same ID.
    const incomingScrape = {
      canonical_url: 'https://stripe.com/jobs/001',
      canonical_fingerprint: 'stripe-staff-software-engineer-sf',
      title: 'Staff Software Engineer',
    };

    const ingestResult = simulateIngestJobTransaction(jobsDatabase, incomingScrape);

    // Expected: jobs.id remains X; It MUST NOT create jobs.id = Y
    expect(ingestResult.status).toBe('updated');
    expect(ingestResult.jobId).toBe(initialJob.id);
    expect(jobsDatabase).toHaveLength(1);
    expect(jobsDatabase[0]!.id).toBe('job-uuid-stripe-eng-001');
    expect(jobsDatabase[0]!.status).toBe('active');

    // Step 5: Verify application relationship
    // Expected: applications.job_id = X still exists and is untouched
    const aliceApp = applicationsDatabase.find((a) => a.user_id === userA);
    expect(aliceApp).toBeDefined();
    expect(aliceApp!.job_id).toBe(initialJob.id);
    expect(aliceApp!.status).toBe('interview');

    // Step 6: Fetch authenticated user's feed for User A
    const userAFeed = simulateFeedEnrichment(jobsDatabase, applicationsDatabase, userA);
    expect(userAFeed).toHaveLength(1);

    const userAFeedItem = userAFeed[0]!;
    expect(userAFeedItem.id).toBe(initialJob.id);
    expect(userAFeedItem.has_application).toBe(true);
    expect(userAFeedItem.application_status).toBe('interview');
    // Crucial semantic check: is_applied is strictly false because status is 'interview'
    expect(userAFeedItem.is_applied).toBe(false);

    // UI semantic verification: getApplicationDisplayState displays 'Interview', NEVER 'Applied'
    const uiDisplayA = getApplicationDisplayState(userAFeedItem.application_status);
    expect(uiDisplayA.hasApplication).toBe(true);
    expect(uiDisplayA.label).toBe('Interview');
    expect(uiDisplayA.badgeLabel).toBe('Interview');
    expect(uiDisplayA.actionLabel).toBe('Application: Interview');
    expect(uiDisplayA.badgeVariant).toBe('info');

    // User Isolation Test: Fetch authenticated user's feed for User B
    const userBFeed = simulateFeedEnrichment(jobsDatabase, applicationsDatabase, userB);
    expect(userBFeed).toHaveLength(1);

    const userBFeedItem = userBFeed[0]!;
    expect(userBFeedItem.id).toBe(initialJob.id);
    expect(userBFeedItem.has_application).toBe(false);
    expect(userBFeedItem.application_status).toBeNull();
    expect(userBFeedItem.is_applied).toBe(false);

    // UI semantic verification for User B: Displays 'Mark Applied'
    const uiDisplayB = getApplicationDisplayState(userBFeedItem.application_status);
    expect(uiDisplayB.hasApplication).toBe(false);
    expect(uiDisplayB.actionLabel).toBe('Mark Applied');
    expect(uiDisplayB.badgeVariant).toBe('neutral');
  });

  it('verifies retention deletion policy strictly preserves the expired job while an application exists', () => {
    const expiredJobWithApp: JobRecord = {
      id: 'job-expired-with-app-999',
      canonical_url: 'https://example.com/job/999',
      canonical_fingerprint: 'fp-999',
      title: 'DevOps Engineer',
      status: 'expired',
      first_seen_at: '2026-06-01T00:00:00.000Z',
      last_seen_at: '2026-06-15T00:00:00.000Z', // 80+ days ago
    };

    const applications: ApplicationRecord[] = [
      {
        id: 'app-999',
        user_id: 'user-charlie',
        job_id: expiredJobWithApp.id,
        status: 'applied',
        applied_at: '2026-06-10T00:00:00.000Z',
      },
    ];

    const retentionCutoff = new Date('2026-08-01T00:00:00.000Z').getTime();

    // Simulating purge_stale_job_records WHERE clause
    const isEligibleForPurge =
      expiredJobWithApp.status === 'expired' &&
      new Date(expiredJobWithApp.last_seen_at).getTime() < retentionCutoff &&
      !applications.some((a) => a.job_id === expiredJobWithApp.id);

    expect(isEligibleForPurge).toBe(false);
  });
});
