import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompanySourceConfig } from '@jobpulse/domain';
import { ScraperRunner } from '../src/engine/runner.js';
import * as atsModule from '@jobpulse/ats';

describe('Multi-Source Company Integration & Concurrency (S15 & S20)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('proves a single company can have multiple sources that execute concurrently without collision', async () => {
    const runner = new ScraperRunner({ concurrency: 4 });

    const sharedCompanyId = '50000000-0000-0000-0000-000000000001';

    // Same company hosting two distinct sources (Greenhouse board + Ashby board)
    const multiSources: (CompanySourceConfig & { adapterName: string })[] = [
      {
        id: '60000000-0000-0000-0000-000000000001',
        companyId: sharedCompanyId,
        sourceId: '70000000-0000-0000-0000-000000000001',
        sourceIdentifier: 'stripe_main',
        adapterConfig: {},
        isActive: true,
        healthStatus: 'healthy',
        priority: 10,
        scheduleIntervalMinutes: 360,
        consecutiveFailures: 0,
        lastJobCount: 0,
        discoveryMethod: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        adapterName: 'greenhouse',
      },
      {
        id: '60000000-0000-0000-0000-000000000002',
        companyId: sharedCompanyId,
        sourceId: '70000000-0000-0000-0000-000000000002',
        sourceIdentifier: 'stripe_subsidiary',
        adapterConfig: {},
        isActive: true,
        healthStatus: 'healthy',
        priority: 10,
        scheduleIntervalMinutes: 360,
        consecutiveFailures: 0,
        lastJobCount: 0,
        discoveryMethod: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        adapterName: 'ashby',
      },
    ];

    // Mock adapter discovery
    vi.spyOn(atsModule, 'getAdapterForSource').mockImplementation((adapterName: string) => ({
      platformSlug: adapterName,
      parserVersion: 'v1',
      discover: vi.fn().mockResolvedValue([]),
      fetch: vi.fn(),
      parse: vi.fn(),
      normalize: vi.fn(),
      validate: vi.fn(),
      resolveApplicationUrl: vi.fn(),
    } as any));

    vi.spyOn(runner as any, 'updateSourceHealth').mockResolvedValue(undefined);
    vi.spyOn(runner as any, 'recordSourceTelemetry').mockResolvedValue(undefined);

    const runId = '00000000-0000-0000-0000-000000000100';
    const results = await runner.processSources(multiSources, runId);

    expect(results).toHaveLength(2);

    // Both results point to the same company
    expect(results[0].companyId).toBe(sharedCompanyId);
    expect(results[1].companyId).toBe(sharedCompanyId);

    // But maintain distinct source IDs and identifiers
    expect(results[0].companySourceId).toBe('60000000-0000-0000-0000-000000000001');
    expect(results[1].companySourceId).toBe('60000000-0000-0000-0000-000000000002');
    expect(results[0].sourceIdentifier).toBe('stripe_main');
    expect(results[1].sourceIdentifier).toBe('stripe_subsidiary');

    // Both succeeded
    expect(results[0].status).toBe('succeeded');
    expect(results[1].status).toBe('succeeded');
  });
});
