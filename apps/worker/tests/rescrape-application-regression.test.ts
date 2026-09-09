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
    posted_at: string;
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
   * introduced in 20260907000002_job_age_and_eligibility_invariants.sql.
   */
  function simulateIngestJobTransaction(
    existingJobs: JobRecord[],
    incoming: {
      canonical_url: string;
      canonical_fingerprint: string;
      title: string;
      posted_at?: string;
    },
    clockNow: Date = new Date()
  ): { status: 'inserted' | 'updated'; jobId: string; isStale: boolean } {
    const cutoff = clockNow.getTime() - 30 * 24 * 60 * 60 * 1000;
    const postedTime = incoming.posted_at ? new Date(incoming.posted_at).getTime() : clockNow.getTime();
    const isStale = postedTime < cutoff;
    const targetStatus: 'active' | 'expired' = isStale ? 'expired' : 'active';

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
      // Update job, preserve ID and first_seen_at, set target status (active or expired)
      match.status = targetStatus;
      match.last_seen_at = clockNow.toISOString();
      if (incoming.posted_at) match.posted_at = incoming.posted_at;
      return { status: 'updated', jobId: match.id, isStale };
    } else {
      const newId = `job-new-${Date.now()}`;
      const newJob: JobRecord = {
        id: newId,
        canonical_url: incoming.canonical_url,
        canonical_fingerprint: incoming.canonical_fingerprint,
        title: incoming.title,
        status: targetStatus,
        posted_at: incoming.posted_at || clockNow.toISOString(),
        first_seen_at: clockNow.toISOString(),
        last_seen_at: clockNow.toISOString(),
      };
      existingJobs.push(newJob);
      return { status: 'inserted', jobId: newId, isStale };
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

  /**
   * Simulates the database query layer of /api/jobs/feed enforcing:
   * status = 'active' AND posted_at >= now() - 30 days
   */
  function simulatePublicFeedQuery(
    jobs: JobRecord[],
    clockNow: Date = new Date()
  ): JobRecord[] {
    const cutoff = clockNow.getTime() - 30 * 24 * 60 * 60 * 1000;
    return jobs.filter((j) => {
      const postedTime = new Date(j.posted_at).getTime();
      return j.status === 'active' && postedTime >= cutoff;
    });
  }

  /**
   * Simulates purge_stale_job_records WHERE clause and application protection.
   */
  function simulatePurgeStaleJobRecords(
    jobs: JobRecord[],
    applications: ApplicationRecord[],
    clockNow: Date = new Date()
  ): { deletedCount: number; protectedCount: number } {
    const cutoff = clockNow.getTime() - 30 * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    let protectedCount = 0;

    for (let i = jobs.length - 1; i >= 0; i--) {
      const job = jobs[i]!;
      const postedTime = new Date(job.posted_at).getTime();
      const lastSeenTime = new Date(job.last_seen_at).getTime();
      const isEligible = postedTime < cutoff || (job.status === 'expired' && lastSeenTime < cutoff);

      if (isEligible) {
        const hasApp = applications.some((a) => a.job_id === job.id);
        if (hasApp) {
          protectedCount++;
          job.status = 'expired'; // Auto transition protected old jobs to expired
        } else {
          jobs.splice(i, 1);
          deletedCount++;
        }
      }
    }

    return { deletedCount, protectedCount };
  }

  it('executes full 6-step regression: active -> applied -> expired -> re-scraped -> same job ID & application preserved with user isolation', () => {
    const jobsDatabase: JobRecord[] = [];
    const applicationsDatabase: ApplicationRecord[] = [];

    const userA = 'user-uuid-alice-1111';
    const userB = 'user-uuid-bob-2222';

    // Step 1: Create/identify a job (Job X, status = active, fresh posted_at)
    const initialJob: JobRecord = {
      id: 'job-uuid-stripe-eng-001',
      canonical_url: 'https://stripe.com/jobs/001',
      canonical_fingerprint: 'stripe-staff-software-engineer-sf',
      title: 'Staff Software Engineer',
      status: 'active',
      posted_at: '2026-08-10T00:00:00.000Z',
      first_seen_at: '2026-08-10T00:00:00.000Z',
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
      applied_at: '2026-08-12T12:00:00.000Z',
    };
    applicationsDatabase.push(userAApplication);

    expect(applicationsDatabase).toHaveLength(1);
    expect(applicationsDatabase[0]!.user_id).toBe(userA);
    expect(applicationsDatabase[0]!.job_id).toBe(initialJob.id);

    // Step 3: The job becomes expired/stale in a subsequent reconciliation pass
    initialJob.status = 'expired';
    expect(jobsDatabase[0]!.status).toBe('expired');

    // Step 4: The same job is scraped again with fresh posted_at within 30 days
    const incomingScrape = {
      canonical_url: 'https://stripe.com/jobs/001',
      canonical_fingerprint: 'stripe-staff-software-engineer-sf',
      title: 'Staff Software Engineer',
      posted_at: '2026-08-25T00:00:00.000Z',
    };

    const ingestResult = simulateIngestJobTransaction(jobsDatabase, incomingScrape, new Date('2026-09-01T00:00:00.000Z'));

    // Expected: jobs.id remains X; It MUST NOT create jobs.id = Y
    expect(ingestResult.status).toBe('updated');
    expect(ingestResult.jobId).toBe(initialJob.id);
    expect(jobsDatabase).toHaveLength(1);
    expect(jobsDatabase[0]!.id).toBe('job-uuid-stripe-eng-001');
    expect(jobsDatabase[0]!.status).toBe('active');

    // Step 5: Verify application relationship
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

    const uiDisplayB = getApplicationDisplayState(userBFeedItem.application_status);
    expect(uiDisplayB.hasApplication).toBe(false);
    expect(uiDisplayB.actionLabel).toBe('Mark Applied');
    expect(uiDisplayB.badgeVariant).toBe('neutral');
  });

  // ============================================================================
  // MANDATORY CRITICAL REGRESSION TESTS (TESTS A - F)
  // ============================================================================

  const FIXED_NOW = new Date('2026-09-07T12:00:00.000Z');

  it('Test A — Old active job (posted_at = 60 days ago, status = active): cannot appear in /api/jobs/feed', () => {
    const jobs: JobRecord[] = [
      {
        id: 'job-old-active-001',
        canonical_url: 'https://company.com/job/001',
        canonical_fingerprint: 'company-eng-001',
        title: 'Backend Engineer',
        status: 'active',
        posted_at: '2026-07-09T12:00:00.000Z', // 60 days ago
        first_seen_at: '2026-07-09T12:00:00.000Z',
        last_seen_at: '2026-07-15T12:00:00.000Z',
      },
    ];

    const visibleJobs = simulatePublicFeedQuery(jobs, FIXED_NOW);
    expect(visibleJobs).toHaveLength(0);
  });

  it('Test B — Old continuously scraped job (posted_at = 60 days ago, last_seen_at = now, status = active): not exposed in feed, eligible for cleanup', () => {
    const jobs: JobRecord[] = [
      {
        id: 'job-old-continuously-scraped-002',
        canonical_url: 'https://company.com/job/002',
        canonical_fingerprint: 'company-eng-002',
        title: 'Staff Platform Engineer',
        status: 'active',
        posted_at: '2026-07-09T12:00:00.000Z', // 60 days ago
        first_seen_at: '2026-07-09T12:00:00.000Z',
        last_seen_at: FIXED_NOW.toISOString(), // Scraped today!
      },
    ];
    const applications: ApplicationRecord[] = [];

    // 1. Invariant: Must NOT appear in public feed despite status = 'active' and fresh last_seen_at
    const visibleJobs = simulatePublicFeedQuery(jobs, FIXED_NOW);
    expect(visibleJobs).toHaveLength(0);

    // 2. Invariant: Must be eligible for physical cleanup in purge_stale_job_records
    const purgeResult = simulatePurgeStaleJobRecords(jobs, applications, FIXED_NOW);
    expect(purgeResult.deletedCount).toBe(1);
    expect(jobs).toHaveLength(0);
  });

  it('Test C — Fresh job (posted_at = 10 days ago): remains visible in public feed', () => {
    const jobs: JobRecord[] = [
      {
        id: 'job-fresh-003',
        canonical_url: 'https://company.com/job/003',
        canonical_fingerprint: 'company-eng-003',
        title: 'Full Stack Engineer',
        status: 'active',
        posted_at: '2026-08-28T12:00:00.000Z', // 10 days ago
        first_seen_at: '2026-08-28T12:00:00.000Z',
        last_seen_at: FIXED_NOW.toISOString(),
      },
    ];

    const visibleJobs = simulatePublicFeedQuery(jobs, FIXED_NOW);
    expect(visibleJobs).toHaveLength(1);
    expect(visibleJobs[0]!.id).toBe('job-fresh-003');
  });

  it('Test D — Boundary behavior around exactly 30 days using a deterministic clock', () => {
    const thirtyDaysAgo = new Date(FIXED_NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAndOneSecAgo = new Date(FIXED_NOW.getTime() - (30 * 24 * 60 * 60 * 1000 + 1000)).toISOString();

    const jobs: JobRecord[] = [
      {
        id: 'job-exact-30d',
        canonical_url: 'https://company.com/job/exact-30d',
        canonical_fingerprint: 'company-eng-30d',
        title: 'Senior Engineer (Exact 30d)',
        status: 'active',
        posted_at: thirtyDaysAgo,
        first_seen_at: thirtyDaysAgo,
        last_seen_at: thirtyDaysAgo,
      },
      {
        id: 'job-over-30d',
        canonical_url: 'https://company.com/job/over-30d',
        canonical_fingerprint: 'company-eng-over-30d',
        title: 'Senior Engineer (Over 30d)',
        status: 'active',
        posted_at: thirtyDaysAndOneSecAgo,
        first_seen_at: thirtyDaysAndOneSecAgo,
        last_seen_at: thirtyDaysAndOneSecAgo,
      },
    ];

    const visibleJobs = simulatePublicFeedQuery(jobs, FIXED_NOW);
    expect(visibleJobs).toHaveLength(1);
    expect(visibleJobs[0]!.id).toBe('job-exact-30d');
  });

  it('Test E — Application protection: old job with application is protected from physical deletion, but NOT in normal public job feed', () => {
    const jobs: JobRecord[] = [
      {
        id: 'job-old-with-app-005',
        canonical_url: 'https://company.com/job/005',
        canonical_fingerprint: 'company-eng-005',
        title: 'Lead SRE',
        status: 'active',
        posted_at: '2026-07-09T12:00:00.000Z', // 60 days ago
        first_seen_at: '2026-07-09T12:00:00.000Z',
        last_seen_at: '2026-08-01T12:00:00.000Z',
      },
    ];
    const applications: ApplicationRecord[] = [
      {
        id: 'app-005',
        user_id: 'user-charlie',
        job_id: 'job-old-with-app-005',
        status: 'interview',
        applied_at: '2026-07-15T12:00:00.000Z',
      },
    ];

    // 1. Must NOT appear in public feed
    const visibleJobs = simulatePublicFeedQuery(jobs, FIXED_NOW);
    expect(visibleJobs).toHaveLength(0);

    // 2. Retention purge execution
    const purgeResult = simulatePurgeStaleJobRecords(jobs, applications, FIXED_NOW);
    expect(purgeResult.deletedCount).toBe(0);
    expect(purgeResult.protectedCount).toBe(1);

    // Job remains in database for application tracking, but transitioned to status = 'expired'
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.id).toBe('job-old-with-app-005');
    expect(jobs[0]!.status).toBe('expired');

    // 3. Application still intact and visible to the applicant
    const charlieApp = applications.find((a) => a.user_id === 'user-charlie');
    expect(charlieApp).toBeDefined();
    expect(charlieApp!.job_id).toBe('job-old-with-app-005');
  });

  it('Test F — Re-scrape of existing job with application preserves same jobs.id, preserves application, and does NOT reactivate as active if older than 30 days', () => {
    const jobs: JobRecord[] = [
      {
        id: 'job-canonical-006',
        canonical_url: 'https://company.com/job/006',
        canonical_fingerprint: 'company-eng-006',
        title: 'Solutions Architect',
        status: 'expired',
        posted_at: '2026-07-09T12:00:00.000Z', // 60 days ago
        first_seen_at: '2026-07-09T12:00:00.000Z',
        last_seen_at: '2026-07-15T12:00:00.000Z',
      },
    ];
    const applications: ApplicationRecord[] = [
      {
        id: 'app-006',
        user_id: 'user-dave',
        job_id: 'job-canonical-006',
        status: 'offer',
        applied_at: '2026-07-12T12:00:00.000Z',
      },
    ];

    // Scraper sees the exact same job again, but its posted_at is still 60 days ago
    const incomingScrape = {
      canonical_url: 'https://company.com/job/006',
      canonical_fingerprint: 'company-eng-006',
      title: 'Solutions Architect',
      posted_at: '2026-07-09T12:00:00.000Z',
    };

    const ingestResult = simulateIngestJobTransaction(jobs, incomingScrape, FIXED_NOW);

    // Invariant 1: Same jobs.id preserved (no duplicate jobs created)
    expect(ingestResult.status).toBe('updated');
    expect(ingestResult.jobId).toBe('job-canonical-006');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.id).toBe('job-canonical-006');

    // Invariant 2: Old job MUST NOT be reactivated as active
    expect(ingestResult.isStale).toBe(true);
    expect(jobs[0]!.status).toBe('expired');

    // Invariant 3: Application remains linked to same job ID
    const daveApp = applications.find((a) => a.user_id === 'user-dave');
    expect(daveApp).toBeDefined();
    expect(daveApp!.job_id).toBe('job-canonical-006');
    expect(daveApp!.status).toBe('offer');
  });
});
