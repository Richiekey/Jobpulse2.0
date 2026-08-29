import { describe, it, expect } from 'vitest';
import { DeduplicationEngine } from '../src/deduplication.ts';

describe('DeduplicationEngine Multi-Level Match Evaluation (M08)', () => {
  it('identifies Level 1 exact deterministic identity match', () => {
    const jobA = {
      sourceId: '10000000-0000-4000-8000-000000000001',
      externalJobId: 'job_123',
      canonicalUrl: 'https://stripe.com/jobs/123',
      canonicalFingerprint: 'fp_abc',
    };
    const jobB = {
      sourceId: '10000000-0000-4000-8000-000000000001',
      externalJobId: 'job_123',
      canonicalUrl: 'https://stripe.com/jobs/123?utm_source=custom',
      canonicalFingerprint: 'fp_abc',
    };

    const match = DeduplicationEngine.evaluateMatch(jobA, jobB);
    expect(match.isMatch).toBe(true);
    expect(match.matchLevel).toBe('level_1_source_identity');
    expect(match.confidence).toBe(1.0);
  });

  it('identifies Level 2 canonical URL match across different sources', () => {
    const jobA = {
      sourceId: '10000000-0000-4000-8000-000000000001',
      externalJobId: 'gh_555',
      canonicalUrl: 'https://boards.greenhouse.io/stripe/jobs/555#app',
      canonicalFingerprint: 'fp_stripe_dev',
    };
    const jobB = {
      sourceId: '10000000-0000-4000-8000-000000000005', // Aggregator source
      externalJobId: 'jr_999',
      canonicalUrl: 'https://boards.greenhouse.io/stripe/jobs/555?gh_src=linkedin#app',
      canonicalFingerprint: 'fp_stripe_dev',
    };

    const match = DeduplicationEngine.evaluateMatch(jobA, jobB);
    expect(match.isMatch).toBe(true);
    expect(match.matchLevel).toBe('level_2_canonical_url');
    expect(match.confidence).toBe(0.98);
  });

  it('identifies Level 3 canonical fingerprint candidate match for separate requisitions', () => {
    const jobA = {
      sourceId: '10000000-0000-4000-8000-000000000001',
      externalJobId: 'req_1',
      canonicalUrl: 'https://stripe.com/jobs/req_1',
      canonicalFingerprint: 'identical_hash_123',
    };
    const jobB = {
      sourceId: '10000000-0000-4000-8000-000000000001',
      externalJobId: 'req_2',
      canonicalUrl: 'https://stripe.com/jobs/req_2',
      canonicalFingerprint: 'identical_hash_123',
    };

    const match = DeduplicationEngine.evaluateMatch(jobA, jobB);
    expect(match.isMatch).toBe(true);
    expect(match.matchLevel).toBe('level_3_canonical_fingerprint');
    expect(match.confidence).toBe(0.85);
  });

  it('returns no match for distinct job requisitions', () => {
    const jobA = {
      sourceId: '10000000-0000-4000-8000-000000000001',
      externalJobId: 'req_1',
      canonicalUrl: 'https://stripe.com/jobs/1',
      canonicalFingerprint: 'fp_stripe_swe',
    };
    const jobB = {
      sourceId: '10000000-0000-4000-8000-000000000002',
      externalJobId: 'req_2',
      canonicalUrl: 'https://airbnb.com/jobs/2',
      canonicalFingerprint: 'fp_airbnb_pm',
    };

    const match = DeduplicationEngine.evaluateMatch(jobA, jobB);
    expect(match.isMatch).toBe(false);
    expect(match.matchLevel).toBe('none');
    expect(match.confidence).toBe(0.0);
  });
});
