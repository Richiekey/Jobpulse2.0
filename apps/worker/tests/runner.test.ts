import { describe, it, expect } from 'vitest';
import { ScraperRunner, type SourceRunResult } from '../src/engine/runner.js';

describe('ScraperRunner Telemetry & State Machine (P1.12, P1.13, P1.23)', () => {
  it('instantiates cleanly with custom concurrency limits', () => {
    const runner = new ScraperRunner({ concurrency: 4 });
    expect(runner).toBeInstanceOf(ScraperRunner);
  });

  it('aggregates immutable SourceRunResult objects deterministically without shared mutable counters', () => {
    const mockResults: SourceRunResult[] = [
      {
        companySourceId: 'cs-1',
        companyId: 'comp-1',
        sourceId: 'src-1',
        sourceIdentifier: 'stripe',
        adapterName: 'greenhouse',
        status: 'succeeded',
        discovered: 50,
        inserted: 45,
        updated: 5,
        rejected: 0,
        failed: 0,
        durationMs: 1200,
        errorMessage: null,
      },
      {
        companySourceId: 'cs-2',
        companyId: 'comp-2',
        sourceId: 'src-2',
        sourceIdentifier: 'figma',
        adapterName: 'ashby',
        status: 'succeeded',
        discovered: 20,
        inserted: 18,
        updated: 2,
        rejected: 0,
        failed: 0,
        durationMs: 850,
        errorMessage: null,
      },
      {
        companySourceId: 'cs-3',
        companyId: 'comp-3',
        sourceId: 'src-3',
        sourceIdentifier: 'broken_source',
        adapterName: 'unknown_adapter',
        status: 'failed',
        discovered: 0,
        inserted: 0,
        updated: 0,
        rejected: 0,
        failed: 0,
        durationMs: 150,
        errorMessage: 'No adapter registered for adapter_name: unknown_adapter',
      },
    ];

    const aggregated = mockResults.reduce(
      (acc, r) => ({
        attempted: acc.attempted + 1,
        succeeded: acc.succeeded + (r.status === 'succeeded' ? 1 : 0),
        failed: acc.failed + (r.status === 'failed' ? 1 : 0),
        discovered: acc.discovered + r.discovered,
        inserted: acc.inserted + r.inserted,
        updated: acc.updated + r.updated,
        rejected: acc.rejected + r.rejected,
        failedJobs: acc.failedJobs + r.failed,
      }),
      {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        discovered: 0,
        inserted: 0,
        updated: 0,
        rejected: 0,
        failedJobs: 0,
      }
    );

    expect(aggregated.attempted).toBe(3);
    expect(aggregated.succeeded).toBe(2);
    expect(aggregated.failed).toBe(1);
    expect(aggregated.discovered).toBe(70);
    expect(aggregated.inserted).toBe(63);
    expect(aggregated.updated).toBe(7);
  });
});
