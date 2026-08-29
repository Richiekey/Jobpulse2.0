import { describe, it, expect } from 'vitest';
import { GreenhouseAdapter } from '../src/adapters/greenhouse.adapter.js';
import type { RawJobPayload } from '@jobpulse/domain';
import fixture from './fixtures/greenhouse_board.json';

describe('GreenhouseAdapter Contract & Parser Tests', () => {
  const adapter = new GreenhouseAdapter();

  it('has valid platform slug and parser version', () => {
    expect(adapter.platformSlug).toBe('greenhouse');
    expect(adapter.parserVersion).toBe('greenhouse_v2');
  });

  it('correctly parses raw Greenhouse payload into RawJob', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-0000-0000-000000000001',
      externalId: '5512345',
      payload: {
        ...fixture.jobs[0],
        content: '<p>Join our team to build scalable payment infrastructure.</p>',
      },
      payloadHash: 'c'.repeat(64),
      parserVersion: 'greenhouse_v1',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    expect(rawJob.rawTitle).toBe('Senior Staff Software Engineer - Infrastructure (Remote)');
    expect(rawJob.rawDescription).toContain('Join our team to build scalable payment infrastructure.');
    expect(rawJob.rawLocations).toContain('San Francisco, CA, USA');
    expect(rawJob.rawLocations).toContain('Remote - US');

    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);
    expect(normalized.canonicalTitle).toBe('Senior Staff Software Engineer - Infrastructure');
    expect(normalized.workplaceType).toBe('remote');
    expect(normalized.urls.applyUrl).toBe('https://boards.greenhouse.io/stripe/jobs/5512345');

    const validation = adapter.validate(normalized);
    expect(validation.isValid).toBe(true);
  });
});
