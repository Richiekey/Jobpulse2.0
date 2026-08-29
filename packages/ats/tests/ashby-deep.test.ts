import { describe, it, expect } from 'vitest';
import { AshbyAdapter } from '../src/adapters/ashby.adapter.js';
import type { RawJobPayload } from '@jobpulse/domain';

describe('AshbyAdapter Deep Schema & Ingestion Verification (S08)', () => {
  const adapter = new AshbyAdapter();

  it('aggregates secondary locations, postal addresses, and parses compensationTierSummary', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-0000-0000-000000000003',
      externalId: 'ash_301',
      payload: {
        id: 'ash_301',
        title: 'Member of Technical Staff - Alignment',
        location: 'San Francisco, CA',
        secondaryLocations: [
          {
            location: 'New York, NY',
            address: {
              postalAddress: {
                addressLocality: 'New York',
                addressRegion: 'NY',
                addressCountry: 'USA',
              },
            },
          },
          {
            location: 'London, UK',
          },
        ],
        department: 'Research & Superalignment',
        employmentType: 'Full-Time',
        isRemote: false,
        compensationTierSummary: '$240,000 - $320,000 USD / yr',
        jobUrl: 'https://jobs.ashbyhq.com/openai/ash_301',
        publishedAt: '2026-08-29T10:00:00Z',
        descriptionPlain: 'Train and evaluate foundational models with reinforcement learning.',
      },
      payloadHash: '6'.repeat(64),
      parserVersion: 'ashby_v2',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    expect(rawJob.rawLocations).toContain('San Francisco, CA');
    expect(rawJob.rawLocations).toContain('New York, NY');
    expect(rawJob.rawLocations).toContain('London, UK');
    expect(rawJob.rawLocations).toContain('New York, NY, USA');
    expect(rawJob.rawSalary).toBe('$240,000 - $320,000 USD / yr');

    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);
    expect(normalized.canonicalTitle).toBe('Member of Technical Staff - Alignment');
    expect(normalized.salary?.min).toBe(240000);
    expect(normalized.salary?.max).toBe(320000);
    expect(normalized.salary?.currency).toBe('USD');
    expect(normalized.salary?.interval).toBe('yearly');
  });

  it('maps isRemote flag to remote workplace type', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-0000-0000-000000000003',
      externalId: 'ash_302',
      payload: {
        id: 'ash_302',
        title: 'Product Engineer',
        isRemote: true,
        jobUrl: 'https://jobs.ashbyhq.com/linear/ash_302',
        descriptionPlain: 'Build high performance desktop and web applications.',
      },
      payloadHash: '7'.repeat(64),
      parserVersion: 'ashby_v2',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);
    expect(normalized.workplaceType).toBe('remote');
  });
});
