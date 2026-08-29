import { describe, it, expect } from 'vitest';
import { Normalizer, DeduplicationEngine } from '@jobpulse/domain';
import { URLResolver } from '@jobpulse/url-resolution';
import { JobValidator } from '@jobpulse/validation';
import type { RawJob } from '@jobpulse/domain';

describe('Golden Ingestion Pipeline End-to-End Simulation (V13.1)', () => {
  it('processes raw ATS candidate through full pipeline without data corruption', () => {
    // 1. Raw Candidate Payload from ATS
    const rawCandidate: RawJob = {
      sourceId: '10000000-0000-4000-8000-000000000001',
      externalJobId: 'req_golden_404',
      rawTitle: '   Senior Staff Backend Architect - Distributed Systems   ',
      rawDescription: 'We are seeking a senior engineer to lead our database infrastructure. 5+ years experience with PostgreSQL, TypeScript, and Go required.',
      rawLocations: ['San Francisco, CA'],
      rawSalary: '$180,000 - $240,000 USD / Year',
      rawEmploymentType: 'Full-time',
      rawWorkplaceType: 'Hybrid',
      rawPostedAt: '2026-08-29T00:00:00.000Z',
      rawApplyUrl: 'https://boards.greenhouse.io/stripe/jobs/req_golden_404?gh_src=linkedin',
      sourceJobUrl: 'https://stripe.com/jobs/req_golden_404',
      discoveryUrl: 'https://stripe.com/careers',
    };

    // 2. URL Resolution & Cleaning
    const resolvedUrls = URLResolver.resolve({
      discoveryUrl: rawCandidate.discoveryUrl,
      sourceJobUrl: rawCandidate.sourceJobUrl,
      candidates: [
        {
          url: rawCandidate.rawApplyUrl || '',
          sourceType: 'explicit_employer_apply',
        },
      ],
    });
    expect(resolvedUrls.urlResolutionConfidence).toBe(0.98);
    expect(resolvedUrls.applyUrl).toContain('boards.greenhouse.io/stripe/jobs/req_golden_404');
    expect(resolvedUrls.applyUrl).not.toContain('gh_src=linkedin'); // Tracking stripped

    // 3. Payload Hash
    const payloadHash = DeduplicationEngine.hashPayload(rawCandidate);
    expect(payloadHash.length).toBe(64);

    // 4. Normalization
    const normalized = Normalizer.normalize(rawCandidate, resolvedUrls, payloadHash);
    expect(normalized.canonicalTitle).toBe('Senior Staff Backend Architect - Distributed Systems');
    expect(normalized.employmentType).toBe('full_time');
    expect(normalized.workplaceType).toBe('hybrid');
    expect(normalized.salary?.min).toBe(180000);
    expect(normalized.salary?.max).toBe(240000);
    expect(normalized.salary?.currency).toBe('USD');
    expect(normalized.salary?.interval).toBe('yearly');

    // 5. Validation
    const validationResult = JobValidator.validate(normalized);
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.issues.length).toBe(0);

    // 6. Canonical Fingerprint
    const fingerprint = DeduplicationEngine.generateCanonicalFingerprint(
      'comp_stripe_uuid',
      normalized.canonicalTitle,
      normalized.locations
    );
    expect(fingerprint).toBeDefined();
    expect(fingerprint.length).toBe(64);

    // 7. Match Confidence against existing candidate
    const match = DeduplicationEngine.evaluateMatch(
      {
        sourceId: rawCandidate.sourceId,
        externalJobId: rawCandidate.externalJobId,
        canonicalUrl: resolvedUrls.canonicalUrl,
        canonicalFingerprint: fingerprint,
      },
      {
        sourceId: rawCandidate.sourceId,
        externalJobId: rawCandidate.externalJobId,
        canonicalUrl: resolvedUrls.canonicalUrl,
        canonicalFingerprint: fingerprint,
      }
    );
    expect(match.isMatch).toBe(true);
    expect(match.confidence).toBe(1.0);
  });
});
