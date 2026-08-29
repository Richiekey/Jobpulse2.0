import { describe, it, expect } from 'vitest';
import { JobValidator } from '../src/validator.js';
import { SSRFGuard } from '../src/ssrf.js';
import type { NormalizedJob } from '@jobpulse/domain';

describe('JobValidator & SSRFGuard', () => {
  it('blocks private IP ranges and localhost in SSRFGuard', () => {
    expect(SSRFGuard.isSafeUrl('http://localhost:3000/jobs').safe).toBe(false);
    expect(SSRFGuard.isSafeUrl('http://127.0.0.1:8080/jobs').safe).toBe(false);
    expect(SSRFGuard.isSafeUrl('http://169.254.169.254/latest/meta-data').safe).toBe(false);
    expect(SSRFGuard.isSafeUrl('http://10.0.1.5/jobs').safe).toBe(false);
    expect(SSRFGuard.isSafeUrl('https://boards.greenhouse.io/stripe/jobs/123').safe).toBe(true);
  });

  it('validates a correct NormalizedJob', () => {
    const validJob: NormalizedJob = {
      sourceId: '10000000-0000-0000-0000-000000000001',
      externalJobId: '12345',
      canonicalTitle: 'Senior Backend Engineer',
      displayTitle: 'Senior Backend Engineer (Go/Rust)',
      description: 'We are seeking an experienced Senior Backend Engineer to join our distributed team.',
      descriptionHtml: null,
      employmentType: 'full_time',
      workplaceType: 'remote',
      locations: ['San Francisco, CA', 'Remote'],
      salary: { min: 150000, max: 190000, currency: 'USD', interval: 'yearly' },
      skills: ['Go', 'Rust', 'PostgreSQL'],
      postedAt: new Date().toISOString(),
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      status: 'active',
      urls: {
        discoveryUrl: 'https://boards.greenhouse.io/stripe',
        sourceJobUrl: 'https://boards.greenhouse.io/stripe/jobs/12345',
        canonicalUrl: 'https://stripe.com/jobs/12345',
        applyUrl: 'https://boards.greenhouse.io/stripe/jobs/12345#app',
        urlResolutionMethod: 'explicit_ats_form',
        urlResolutionConfidence: 0.95,
      },
      rawPayloadHash: 'a'.repeat(64),
      sourceMetadata: {},
    };

    const res = JobValidator.validate(validJob);
    expect(res.isValid).toBe(true);
    expect(res.issues).toHaveLength(0);
  });

  it('rejects bot/error page content', () => {
    const errorJob: NormalizedJob = {
      sourceId: '10000000-0000-0000-0000-000000000001',
      externalJobId: '99999',
      canonicalTitle: 'Error Page',
      displayTitle: 'Error Page',
      description: 'Attention Required! | Cloudflare Checking your browser before accessing.',
      descriptionHtml: null,
      employmentType: 'full_time',
      workplaceType: 'unspecified',
      locations: ['Unspecified'],
      skills: [],
      postedAt: new Date().toISOString(),
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      status: 'active',
      urls: {
        discoveryUrl: 'https://example.com',
        sourceJobUrl: 'https://example.com/job/1',
        canonicalUrl: 'https://example.com/job/1',
        applyUrl: 'https://example.com/job/1/apply',
        urlResolutionMethod: 'fallback',
        urlResolutionConfidence: 0.4,
      },
      rawPayloadHash: 'b'.repeat(64),
      sourceMetadata: {},
    };

    const res = JobValidator.validate(errorJob);
    expect(res.isValid).toBe(false);
    expect(res.issues.some((i) => i.field === 'description')).toBe(true);
  });
});
