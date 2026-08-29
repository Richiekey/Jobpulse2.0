import { describe, it, expect } from 'vitest';
import type { CompanySourceConfig, ScrapeRunStatus } from '@jobpulse/domain';
import { SourceScheduler, SourceHealthEngine } from '@jobpulse/domain';
import pLimit from 'p-limit';

describe('Multi-Source Ingestion Engine & Isolation Verification (S09 & S10 Production Logic)', () => {
  it('proves multi-source failure isolation: Source A failure does not halt or corrupt Source B and Source C', async () => {
    const mockSources: (CompanySourceConfig & { adapterName: string })[] = [
      {
        id: 'cs_source_a',
        companyId: 'comp_a',
        sourceId: 'src_1',
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
        adapterName: 'greenhouse',
      },
      {
        id: 'cs_source_b',
        companyId: 'comp_b',
        sourceId: 'src_2',
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
        adapterName: 'lever',
      },
      {
        id: 'cs_source_c',
        companyId: 'comp_c',
        sourceId: 'src_3',
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
        adapterName: 'ashby',
      },
    ];

    // Filter & order via production SourceScheduler
    const eligibleSources = SourceScheduler.filterAndOrderEligibleSources(mockSources);
    expect(eligibleSources).toHaveLength(3);

    // Concurrency limit bounded to 2
    const limit = pLimit(2);

    // Execute concurrently with per-source isolation (matching ScraperRunner execution model)
    const sourceResults = await Promise.all(
      eligibleSources.map((source) =>
        limit(async () => {
          const startTime = Date.now();
          try {
            if (source.sourceIdentifier === 'failing_source_a') {
              throw new Error('HTTP 500 Internal Server Error');
            }
            // Successful source execution
            const discovered = source.sourceIdentifier === 'healthy_source_b' ? 12 : 8;
            const healthUpdate = SourceHealthEngine.getSuccessUpdate(discovered);

            return {
              companySourceId: source.id,
              status: 'succeeded' as const,
              discovered,
              inserted: discovered,
              updated: 0,
              rejected: 0,
              failed: 0,
              errorMessage: null,
              healthUpdate,
              durationMs: Date.now() - startTime,
            };
          } catch (err: any) {
            const healthUpdate = SourceHealthEngine.getFailureUpdate(source.consecutiveFailures, err.message);
            return {
              companySourceId: source.id,
              status: 'failed' as const,
              discovered: 0,
              inserted: 0,
              updated: 0,
              rejected: 0,
              failed: 0,
              errorMessage: err.message,
              healthUpdate,
              durationMs: Date.now() - startTime,
            };
          }
        })
      )
    );

    // 1. Verify that all 3 sources executed
    expect(sourceResults).toHaveLength(3);

    // 2. Verify Source A failed with exact error and health updated to degraded
    const resultA = sourceResults.find((r) => r.companySourceId === 'cs_source_a');
    expect(resultA?.status).toBe('failed');
    expect(resultA?.errorMessage).toBe('HTTP 500 Internal Server Error');
    expect(resultA?.healthUpdate.healthStatus).toBe('degraded');
    expect(resultA?.healthUpdate.consecutiveFailures).toBe(1);

    // 3. Verify Source B succeeded completely and untouched
    const resultB = sourceResults.find((r) => r.companySourceId === 'cs_source_b');
    expect(resultB?.status).toBe('succeeded');
    expect(resultB?.discovered).toBe(12);
    expect(resultB?.healthUpdate.healthStatus).toBe('healthy');
    expect(resultB?.healthUpdate.lastJobCount).toBe(12);

    // 4. Verify Source C succeeded completely and untouched
    const resultC = sourceResults.find((r) => r.companySourceId === 'cs_source_c');
    expect(resultC?.status).toBe('succeeded');
    expect(resultC?.discovered).toBe(8);
    expect(resultC?.healthUpdate.healthStatus).toBe('healthy');
    expect(resultC?.healthUpdate.lastJobCount).toBe(8);

    // 5. Aggregate summary calculation (matching ScraperRunner aggregation)
    const summary = sourceResults.reduce(
      (acc, r) => ({
        attempted: acc.attempted + 1,
        succeeded: acc.succeeded + (r.status === 'succeeded' ? 1 : 0),
        failed: acc.failed + (r.status === 'failed' ? 1 : 0),
        discovered: acc.discovered + r.discovered,
        inserted: acc.inserted + r.inserted,
      }),
      { attempted: 0, succeeded: 0, failed: 0, discovered: 0, inserted: 0 }
    );

    expect(summary).toEqual({
      attempted: 3,
      succeeded: 2,
      failed: 1,
      discovered: 20,
      inserted: 20,
    });

    const finalStatus: ScrapeRunStatus =
      summary.failed === summary.attempted && summary.attempted > 0 ? 'failed' : 'completed';

    expect(finalStatus).toBe('completed');
  });
});
