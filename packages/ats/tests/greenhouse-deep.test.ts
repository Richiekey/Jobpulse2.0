import { describe, it, expect } from 'vitest';
import { GreenhouseAdapter } from '../src/adapters/greenhouse.adapter.js';
import type { RawJobPayload } from '@jobpulse/domain';

describe('GreenhouseAdapter Deep Schema & Ingestion Verification (S06)', () => {
  const adapter = new GreenhouseAdapter();

  it('aggregates multi-location offices and deduplicates location names', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-0000-0000-000000000001',
      externalId: 'gh_101',
      payload: {
        id: 101,
        title: 'Staff Distributed Systems Engineer',
        updated_at: '2026-08-29T10:00:00Z',
        absolute_url: 'https://boards.greenhouse.io/stripe/jobs/101',
        location: { name: 'San Francisco, CA' },
        offices: [
          { id: 1, name: 'San Francisco HQ', location: 'San Francisco, CA' },
          { id: 2, name: 'New York Tech Hub', location: 'New York, NY' },
          { id: 3, name: 'Dublin Engineering Hub', location: 'Dublin, Ireland' },
        ],
        departments: [{ id: 10, name: 'Core Infrastructure' }],
        content: '<p>Join our team to build high-throughput payment rails.</p>',
      },
      payloadHash: '1'.repeat(64),
      parserVersion: 'greenhouse_v2',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    expect(rawJob.rawLocations).toContain('San Francisco, CA');
    expect(rawJob.rawLocations).toContain('New York, NY');
    expect(rawJob.rawLocations).toContain('Dublin, Ireland');
    expect(rawJob.rawLocations).toContain('San Francisco HQ');
    expect(rawJob.sourceMetadata?.departments).toEqual(['Core Infrastructure']);

    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);
    expect(normalized.canonicalTitle).toBe('Staff Distributed Systems Engineer');
    expect(normalized.locations.length).toBeGreaterThanOrEqual(3);
  });

  it('cleans rich HTML content and decodes standard HTML entities', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-0000-0000-000000000001',
      externalId: 'gh_102',
      payload: {
        id: 102,
        title: 'Security Lead & Architect',
        updated_at: '2026-08-29T10:00:00Z',
        absolute_url: 'https://boards.greenhouse.io/figma/jobs/102',
        location: { name: 'Remote, US' },
        content: `
          <h3>About the Role &amp; Responsibilities</h3>
          <p>We&#39;re searching for a &quot;World-Class&quot; Security Architect.</p>
          <ul>
            <li>Lead zero-trust network boundaries &lt;Tier 1&gt;</li>
            <li>Collaborate with engineering &amp; leadership</li>
          </ul>
        `,
      },
      payloadHash: '2'.repeat(64),
      parserVersion: 'greenhouse_v2',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    expect(rawJob.rawDescription).toContain("We're searching for a \"World-Class\" Security Architect.");
    expect(rawJob.rawDescription).toContain('About the Role & Responsibilities');
    expect(rawJob.rawDescription).toContain('Lead zero-trust network boundaries <Tier 1>');
    expect(rawJob.rawDescription).not.toContain('&amp;');
    expect(rawJob.rawDescription).not.toContain('&quot;');
    expect(rawJob.rawDescription).not.toContain('&#39;');

    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);
    expect(normalized.workplaceType).toBe('remote');
  });

  it('infers hybrid and onsite workplace types from title and location', async () => {
    const hybridPayload: RawJobPayload = {
      sourceId: '10000000-0000-0000-0000-000000000001',
      externalId: 'gh_103',
      payload: {
        id: 103,
        title: 'Backend Engineer (Hybrid)',
        updated_at: '2026-08-29T10:00:00Z',
        absolute_url: 'https://boards.greenhouse.io/discord/jobs/103',
        location: { name: 'San Francisco, CA' },
        content: '<p>Hybrid role with 2 days in office.</p>',
      },
      payloadHash: '3'.repeat(64),
      parserVersion: 'greenhouse_v2',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(hybridPayload);
    const normalized = await adapter.normalize(rawJob, hybridPayload.payloadHash);
    expect(normalized.workplaceType).toBe('hybrid');
  });
});
