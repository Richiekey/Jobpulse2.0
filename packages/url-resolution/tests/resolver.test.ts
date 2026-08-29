import { describe, it, expect } from 'vitest';
import { URLResolver } from '../src/resolver.ts';

describe('URLResolver', () => {
  it('prioritizes direct ATS application forms over fallbacks', () => {
    const resolved = URLResolver.resolve({
      discoveryUrl: 'https://jobright.ai/jobs/12345',
      sourceJobUrl: 'https://jobright.ai/jobs/12345',
      candidates: [
        {
          url: 'https://boards.greenhouse.io/stripe/jobs/5678#app',
          sourceType: 'explicit_ats_form',
          confidence: 0.95,
        },
        {
          url: 'https://jobright.ai/jobs/12345',
          sourceType: 'fallback_source',
          confidence: 0.40,
        },
      ],
    });

    expect(resolved.applyUrl).toBe('https://boards.greenhouse.io/stripe/jobs/5678#app');
    expect(resolved.urlResolutionMethod).toBe('explicit_ats_form');
    expect(resolved.urlResolutionConfidence).toBe(0.95);
  });

  it('correctly detects direct ATS URLs', () => {
    expect(URLResolver.isDirectAtsUrl('https://boards.greenhouse.io/acme/jobs/1')).toBe(true);
    expect(URLResolver.isDirectAtsUrl('https://jobs.lever.co/acme/2')).toBe(true);
    expect(URLResolver.isDirectAtsUrl('https://jobs.ashbyhq.com/acme/3')).toBe(true);
    expect(URLResolver.isDirectAtsUrl('https://random-aggregator.com/jobs/4')).toBe(false);
  });
});
