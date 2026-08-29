import { describe, it, expect } from 'vitest';
import { LeverAdapter } from '../src/adapters/lever.adapter.js';
import type { RawJobPayload } from '@jobpulse/domain';

describe('LeverAdapter Deep Schema & Ingestion Verification (S07)', () => {
  const adapter = new LeverAdapter();

  it('aggregates allLocations, commitment, department, and salaryRange', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-0000-0000-000000000002',
      externalId: 'lev_201',
      payload: {
        id: 'lev_201',
        text: 'Senior Full Stack Engineer',
        createdAt: 1772300000000,
        hostedUrl: 'https://jobs.lever.co/netflix/lev_201',
        categories: {
          location: 'Los Gatos, CA',
          allLocations: ['Los Gatos, CA', 'San Jose, CA', 'Remote - US'],
          commitment: 'Full time',
          team: 'Studio Core Engineering',
          department: 'Product & Technology',
        },
        descriptionPlain: 'Design scalable streaming toolchains.',
        additionalPlain: 'Requirements: TypeScript, React, GraphQL.',
        salaryRange: {
          min: 190000,
          max: 250000,
          currency: 'USD',
          interval: 'per-year-salary',
        },
      },
      payloadHash: '4'.repeat(64),
      parserVersion: 'lever_v2',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    expect(rawJob.rawTitle).toBe('Senior Full Stack Engineer');
    expect(rawJob.rawLocations).toContain('Los Gatos, CA');
    expect(rawJob.rawLocations).toContain('San Jose, CA');
    expect(rawJob.rawLocations).toContain('Remote - US');
    expect(rawJob.rawEmploymentType).toBe('Full time');
    expect(rawJob.rawDescription).toContain('Design scalable streaming toolchains.');
    expect(rawJob.rawDescription).toContain('Requirements: TypeScript, React, GraphQL.');

    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);
    expect(normalized.canonicalTitle).toBe('Senior Full Stack Engineer');
    expect(normalized.employmentType).toBe('full_time');
    expect(normalized.workplaceType).toBe('remote');
    expect(normalized.salary?.min).toBe(190000);
    expect(normalized.salary?.max).toBe(250000);
    expect(normalized.salary?.currency).toBe('USD');
  });

  it('classifies hybrid workplace type from workplaceType field or description', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-0000-0000-000000000002',
      externalId: 'lev_202',
      payload: {
        id: 'lev_202',
        text: 'Product Designer',
        createdAt: 1772300000000,
        hostedUrl: 'https://jobs.lever.co/spotify/lev_202',
        workplaceType: 'hybrid',
        categories: {
          location: 'Stockholm, Sweden',
          commitment: 'Full-time',
        },
        descriptionPlain: 'Join the Core Experience team in our Stockholm office with hybrid flexibility.',
      },
      payloadHash: '5'.repeat(64),
      parserVersion: 'lever_v2',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);
    expect(normalized.workplaceType).toBe('hybrid');
  });
});
