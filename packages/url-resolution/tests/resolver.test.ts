import { describe, it, expect } from 'vitest';
import { URLResolver, isDomainMatch } from '../src/resolver.ts';

describe('URLResolver & Safe Domain Matching', () => {
  it('correctly matches valid ATS domains and subdomains', () => {
    expect(isDomainMatch('boards.greenhouse.io', 'greenhouse.io')).toBe(true);
    expect(isDomainMatch('job-boards.greenhouse.io', 'greenhouse.io')).toBe(true);
    expect(isDomainMatch('jobs.lever.co', 'lever.co')).toBe(true);
    expect(isDomainMatch('jobs.ashbyhq.com', 'ashbyhq.com')).toBe(true);
    expect(isDomainMatch('acme.myworkdayjobs.com', 'myworkdayjobs.com')).toBe(true);
  });

  it('strictly rejects malicious lookalike domains (P0.6 ATS domain spoofing defense)', () => {
    expect(isDomainMatch('evilgreenhouse.io', 'greenhouse.io')).toBe(false);
    expect(isDomainMatch('fake-lever.co', 'lever.co')).toBe(false);
    expect(isDomainMatch('notashbyhq.com', 'ashbyhq.com')).toBe(false);
    expect(isDomainMatch('greenhouse.io.attacker.com', 'greenhouse.io')).toBe(false);
  });

  it('authoritatively ranks candidate URLs by trust hierarchy (P1.10)', () => {
    const resolved = URLResolver.resolve({
      discoveryUrl: 'https://jobright.ai/jobs/12345',
      sourceJobUrl: 'https://jobright.ai/jobs/12345',
      candidates: [
        {
          url: 'https://jobright.ai/jobs/12345',
          sourceType: 'fallback_source',
          suggestedConfidence: 0.99, // Resolver overrides adapter-suggested scores
        },
        {
          url: 'https://boards.greenhouse.io/stripe/jobs/5678#app',
          sourceType: 'explicit_ats_form',
          suggestedConfidence: 0.50,
        },
      ],
    });

    // Authoritative ranking: explicit_ats_form (0.95) beats fallback_source (0.40)
    expect(resolved.applyUrl).toBe('https://boards.greenhouse.io/stripe/jobs/5678#app');
    expect(resolved.urlResolutionMethod).toBe('explicit_ats_form');
    expect(resolved.urlResolutionConfidence).toBe(0.95);
  });

  it('resolves explicit employer application URLs with highest confidence', () => {
    const resolved = URLResolver.resolve({
      discoveryUrl: 'https://careers.stripe.com/jobs',
      sourceJobUrl: 'https://stripe.com/jobs/999',
      candidates: [
        {
          url: 'https://stripe.com/apply/999',
          sourceType: 'explicit_employer_apply',
        },
      ],
    });

    expect(resolved.applyUrl).toBe('https://stripe.com/apply/999');
    expect(resolved.urlResolutionMethod).toBe('explicit_employer_apply');
    expect(resolved.urlResolutionConfidence).toBe(0.98);
  });
});
