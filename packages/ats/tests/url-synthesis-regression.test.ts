import { describe, it, expect } from 'vitest';
import { GreenhouseAdapter, LeverAdapter, AshbyAdapter, JobrightAdapter } from '../src/index.js';
import type { RawJobPayload } from '@jobpulse/domain';

describe('Application URL Non-Fabrication Regression Tests (Section 7-10 Audit)', () => {
  const gh = new GreenhouseAdapter();
  const lever = new LeverAdapter();
  const ashby = new AshbyAdapter();
  const jobright = new JobrightAdapter();

  it('Greenhouse: does NOT synthesize #app when only absolute_url is present', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-0000-0000-000000000001',
      externalId: '12345',
      payload: {
        id: 12345,
        title: 'Backend Engineer',
        absolute_url: 'https://boards.greenhouse.io/stripe/jobs/12345',
        updated_at: '2026-08-29T00:00:00Z',
      },
      payloadHash: 'a'.repeat(64),
      parserVersion: 'greenhouse_v1',
      fetchedAt: new Date().toISOString(),
    };

    const raw = await gh.parse(rawPayload);
    // Explicit assertion: No synthesized suffix
    expect(raw.rawApplyUrl).toBe('https://boards.greenhouse.io/stripe/jobs/12345');
    expect(raw.rawApplyUrl).not.toContain('#app');

    const appUrl = await gh.resolveApplicationUrl(
      { sourceId: raw.sourceId, externalJobId: raw.externalJobId, discoveryUrl: raw.discoveryUrl, sourceJobUrl: raw.sourceJobUrl },
      raw
    );
    expect(appUrl).toBe('https://boards.greenhouse.io/stripe/jobs/12345');
    expect(appUrl).not.toContain('#app');
  });

  it('Lever: does NOT synthesize /apply when applyUrl is not in payload', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-0000-0000-000000000002',
      externalId: 'lev_999',
      payload: {
        id: 'lev_999',
        text: 'Product Designer',
        hostedUrl: 'https://jobs.lever.co/netflix/lev_999',
        createdAt: Date.now(),
      },
      payloadHash: 'b'.repeat(64),
      parserVersion: 'lever_v1',
      fetchedAt: new Date().toISOString(),
    };

    const raw = await lever.parse(rawPayload);
    expect(raw.rawApplyUrl).toBeUndefined(); // Missing in ATS -> undefined

    const appUrl = await lever.resolveApplicationUrl(
      { sourceId: raw.sourceId, externalJobId: raw.externalJobId, discoveryUrl: raw.discoveryUrl, sourceJobUrl: raw.sourceJobUrl },
      raw
    );
    // Fallback must be sourceJobUrl without synthetic /apply
    expect(appUrl).toBe('https://jobs.lever.co/netflix/lev_999');
    expect(appUrl).not.toContain('/apply');
  });

  it('Ashby: does NOT synthesize /application when jobUrl is present', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-0000-0000-000000000003',
      externalId: 'ash_888',
      payload: {
        id: 'ash_888',
        title: 'Research Scientist',
        jobUrl: 'https://jobs.ashbyhq.com/openai/ash_888',
      },
      payloadHash: 'c'.repeat(64),
      parserVersion: 'ashby_v1',
      fetchedAt: new Date().toISOString(),
    };

    const raw = await ashby.parse(rawPayload);
    expect(raw.rawApplyUrl).toBe('https://jobs.ashbyhq.com/openai/ash_888');
    expect(raw.rawApplyUrl).not.toContain('/application');

    const appUrl = await ashby.resolveApplicationUrl(
      { sourceId: raw.sourceId, externalJobId: raw.externalJobId, discoveryUrl: raw.discoveryUrl, sourceJobUrl: raw.sourceJobUrl },
      raw
    );
    expect(appUrl).toBe('https://jobs.ashbyhq.com/openai/ash_888');
    expect(appUrl).not.toContain('/application');
  });
});
