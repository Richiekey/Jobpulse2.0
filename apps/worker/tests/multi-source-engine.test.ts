import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompanySourceConfig } from '@jobpulse/domain';
import { ScraperRunner } from '../src/engine/runner.js';
import * as atsModule from '@jobpulse/ats';

describe('Multi-Source Ingestion Engine & Real ScraperRunner Orchestration (S09 & S10)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('proves multi-source failure isolation via real ScraperRunner orchestration: Source A failure does not halt or corrupt Source B and Source C', async () => {
    const runner = new ScraperRunner({ concurrency: 2 });

    const mockSources: (CompanySourceConfig & { adapterName: string })[] = [
      {
        id: '10000000-0000-0000-0000-000000000001',
        companyId: '20000000-0000-0000-0000-000000000001',
        sourceId: '30000000-0000-0000-0000-000000000001',
        sourceIdentifier: 'failing_source_a',
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
        adapterName: 'mock_failing',
      },
      {
        id: '10000000-0000-0000-0000-000000000002',
        companyId: '20000000-0000-0000-0000-000000000002',
        sourceId: '30000000-0000-0000-0000-000000000002',
        sourceIdentifier: 'healthy_source_b',
        adapterConfig: {},
        isActive: true,
        healthStatus: 'healthy',
        priority: 20,
        scheduleIntervalMinutes: 360,
        consecutiveFailures: 0,
        lastJobCount: 0,
        discoveryMethod: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        adapterName: 'mock_healthy_b',
      },
      {
        id: '10000000-0000-0000-0000-000000000003',
        companyId: '20000000-0000-0000-0000-000000000003',
        sourceId: '30000000-0000-0000-0000-000000000003',
        sourceIdentifier: 'healthy_source_c',
        adapterConfig: {},
        isActive: true,
        healthStatus: 'healthy',
        priority: 30,
        scheduleIntervalMinutes: 360,
        consecutiveFailures: 0,
        lastJobCount: 0,
        discoveryMethod: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        adapterName: 'mock_healthy_c',
      },
    ];

    // Mock adapter lookup to return a failing adapter for source A, and valid adapters for B & C
    vi.spyOn(atsModule, 'getAdapterForSource').mockImplementation((adapterName: string) => {
      if (adapterName === 'mock_failing') {
        return {
          platformSlug: 'mock_failing',
          parserVersion: 'v1',
          discover: vi.fn().mockRejectedValue(new Error('HTTP 500 Internal Server Error')),
          fetch: vi.fn(),
          parse: vi.fn(),
          normalize: vi.fn(),
          validate: vi.fn(),
          resolveApplicationUrl: vi.fn(),
        } as any;
      }
      if (adapterName === 'mock_healthy_b' || adapterName === 'mock_healthy_c') {
        return {
          platformSlug: adapterName,
          parserVersion: 'v1',
          discover: vi.fn().mockResolvedValue([]), // Discovers 0 candidate jobs
          fetch: vi.fn(),
          parse: vi.fn(),
          normalize: vi.fn(),
          validate: vi.fn(),
          resolveApplicationUrl: vi.fn(),
        } as any;
      }
      return undefined;
    });

    // Mock database update functions on ScraperRunner to avoid remote DB mutation during unit test
    vi.spyOn(runner as any, 'updateSourceHealth').mockResolvedValue(undefined);
    vi.spyOn(runner as any, 'recordSourceTelemetry').mockResolvedValue(undefined);

    // Execute real ScraperRunner orchestration
    const runId = '00000000-0000-0000-0000-000000000099';
    const results = await runner.processSources(mockSources, runId, 2);

    // 1. Verify that all 3 sources were processed by the runner
    expect(results).toHaveLength(3);

    // 2. Verify Source A failed with exact error message and did not throw or halt execution
    const resultA = results.find((r) => r.companySourceId === '10000000-0000-0000-0000-000000000001');
    expect(resultA?.status).toBe('failed');
    expect(resultA?.errorMessage).toBe('HTTP 500 Internal Server Error');

    // 3. Verify Source B succeeded completely
    const resultB = results.find((r) => r.companySourceId === '10000000-0000-0000-0000-000000000002');
    expect(resultB?.status).toBe('succeeded');
    expect(resultB?.errorMessage).toBeNull();

    // 4. Verify Source C succeeded completely
    const resultC = results.find((r) => r.companySourceId === '10000000-0000-0000-0000-000000000003');
    expect(resultC?.status).toBe('succeeded');
    expect(resultC?.errorMessage).toBeNull();
  });
});
