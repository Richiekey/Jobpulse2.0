import { describe, it, expect } from 'vitest';
import { JobLifecycleService } from '../src/job-lifecycle';

describe('JobLifecycleService Data Lifecycle Invariants (S26/S27)', () => {
  it('keeps job active when consecutive misses are below threshold and within staleness window', () => {
    const res = JobLifecycleService.evaluateJobStatus({
      jobId: 'job_1',
      externalId: 'ext_1',
      lastSeenAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      consecutiveMisses: 2, // below threshold of 3
      currentStatus: 'active',
    });

    expect(res.shouldExpire).toBe(false);
    expect(res.newStatus).toBe('active');
  });

  it('marks job expired when consecutive misses reach threshold of 3', () => {
    const res = JobLifecycleService.evaluateJobStatus({
      jobId: 'job_1',
      externalId: 'ext_1',
      lastSeenAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      consecutiveMisses: 3, // threshold reached
      currentStatus: 'active',
    });

    expect(res.shouldExpire).toBe(true);
    expect(res.newStatus).toBe('expired');
    expect(res.reason).toContain('3 consecutive successful scrape cycles');
  });

  it('marks job expired when last seen exceeds max staleness window of 30 days', () => {
    const res = JobLifecycleService.evaluateJobStatus({
      jobId: 'job_1',
      externalId: 'ext_1',
      lastSeenAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
      consecutiveMisses: 1,
      currentStatus: 'active',
    });

    expect(res.shouldExpire).toBe(true);
    expect(res.newStatus).toBe('expired');
    expect(res.reason).toContain('30 day max window');
  });

  it('preserves already expired status without re-expiring', () => {
    const res = JobLifecycleService.evaluateJobStatus({
      jobId: 'job_1',
      externalId: 'ext_1',
      lastSeenAt: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000),
      consecutiveMisses: 10,
      currentStatus: 'expired',
    });

    expect(res.shouldExpire).toBe(false);
    expect(res.newStatus).toBe('expired');
  });

  it('correctly reconciles crawl results, resetting seen jobs and expiring missed jobs', () => {
    const existingJobs = [
      { id: 'job_seen', externalId: 'ext_1', lastSeenAt: new Date() },
      { id: 'job_miss_1', externalId: 'ext_2', lastSeenAt: new Date() },
      { id: 'job_to_expire', externalId: 'ext_3', lastSeenAt: new Date() },
    ];

    const crawledExternalIds = new Set(['ext_1']);
    const missMap = new Map([
      ['job_seen', 2],
      ['job_miss_1', 0],
      ['job_to_expire', 2], // will become 3 on this miss -> expire
    ]);

    const result = JobLifecycleService.reconcileCrawlJobs(
      existingJobs,
      crawledExternalIds,
      missMap
    );

    expect(result.seenJobIds).toEqual(['job_seen']);
    expect(result.missedJobIds).toEqual(['job_miss_1', 'job_to_expire']);
    expect(result.expiredJobIds).toEqual(['job_to_expire']);

    // Check updated miss counts
    expect(result.updatedMissMap.get('job_seen')).toBe(0); // reset
    expect(result.updatedMissMap.get('job_miss_1')).toBe(1); // incremented
    expect(result.updatedMissMap.get('job_to_expire')).toBe(3); // reached 3
  });
});
