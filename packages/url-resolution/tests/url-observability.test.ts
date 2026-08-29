import { describe, it, expect } from 'vitest';
import { URLResolver, isDomainMatch } from '../src/resolver.js';

describe('URLResolver Observability & Safety Guarantees (M09)', () => {
  it('correctly resolves and scores direct ATS URL with 0.98 confidence', () => {
    const result = URLResolver.resolve({
      discoveryUrl: 'https://stripe.com/careers',
      sourceJobUrl: 'https://stripe.com/jobs/123456',
      candidates: [
        {
          url: 'https://boards.greenhouse.io/stripe/jobs/123456?gh_src=linkedin',
          sourceType: 'explicit_employer_apply',
        },
      ],
    });

    expect(result.urlResolutionConfidence).toBe(0.98);
    expect(result.urlResolutionMethod).toBe('explicit_employer_apply');
    expect(result.applyUrl).toContain('boards.greenhouse.io/stripe/jobs/123456');
    expect(result.canonicalUrl).toContain('boards.greenhouse.io/stripe/jobs/123456');
  });

  it('detects direct ATS domains accurately', () => {
    expect(URLResolver.isDirectAtsUrl('https://boards.greenhouse.io/stripe/jobs/123')).toBe(true);
    expect(URLResolver.isDirectAtsUrl('https://jobs.lever.co/figma/abc-123')).toBe(true);
    expect(URLResolver.isDirectAtsUrl('https://jobs.ashbyhq.com/openai/xyz')).toBe(true);
    expect(URLResolver.isDirectAtsUrl('https://www.linkedin.com/jobs/view/123')).toBe(false);
  });

  it('rejects lookalike domain spoofing attempts', () => {
    expect(isDomainMatch('stripe.com', 'stripe.com')).toBe(true);
    expect(isDomainMatch('jobs.stripe.com', 'stripe.com')).toBe(true);
    expect(isDomainMatch('stripe.com.evil-spoof.io', 'stripe.com')).toBe(false);
    expect(isDomainMatch('evilgreenhouse.io', 'greenhouse.io')).toBe(false);
  });
});
