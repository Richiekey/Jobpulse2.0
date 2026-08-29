import { describe, it, expect } from 'vitest';
import { JobrightAdapter } from '../src/adapters/jobright.adapter.ts';
import type { RawJobPayload } from '@jobpulse/domain';

describe('JobrightAdapter Discovery & ATS URL Extraction (P1.19)', () => {
  const adapter = new JobrightAdapter();

  it('has valid platform slug and parser version', () => {
    expect(adapter.platformSlug).toBe('jobright');
    expect(adapter.parserVersion).toBe('jobright_v1');
  });

  it('parses jobright payload and extracts underlying direct ATS application URL', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-4000-8000-000000000005',
      externalId: 'jr_998877',
      payload: {
        id: 'jr_998877',
        title: 'Senior Staff Infrastructure Engineer',
        company_name: 'Stripe',
        description: 'Lead our next-generation payments distributed compute platform.',
        location: 'Remote, US',
        employment_type: 'Full-Time',
        workplace_type: 'remote',
        salary_min: 200000,
        salary_max: 260000,
        source_job_url: 'https://jobright.ai/jobs/jr_998877',
        ats_url: 'https://boards.greenhouse.io/stripe/jobs/5512345#app',
        embedded_urls: ['https://boards.greenhouse.io/stripe/jobs/5512345#app'],
      },
      payloadHash: 'd'.repeat(64),
      parserVersion: 'jobright_v1',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    expect(rawJob.rawTitle).toBe('Senior Staff Infrastructure Engineer');
    expect(rawJob.rawLocations).toContain('Remote, US');

    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);
    expect(normalized.canonicalTitle).toBe('Senior Staff Infrastructure Engineer');
    expect(normalized.workplaceType).toBe('remote');

    // Invariant: The resolved apply URL MUST resolve to the employer/ATS form rather than Jobright
    expect(normalized.urls.applyUrl).toBe('https://boards.greenhouse.io/stripe/jobs/5512345#app');
    expect(normalized.urls.urlResolutionMethod).toBe('explicit_ats_form');
    expect(normalized.urls.urlResolutionConfidence).toBe(0.95);

    const validation = adapter.validate(normalized);
    if (!validation.isValid) {
      console.log('VALIDATION ISSUES:', validation.issues);
    }
    expect(validation.isValid).toBe(true);
  });
});
