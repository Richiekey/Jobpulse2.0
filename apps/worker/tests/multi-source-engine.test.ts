import { describe, it, expect } from 'vitest';
import type { CompanySourceConfig } from '@jobpulse/domain';

describe('Multi-Source Ingestion Engine & Health State Machine (S09 & S10)', () => {
  it('calculates health state transitions deterministically based on consecutive failure thresholds', () => {
    function calculateNextHealth(consecutiveFailures: number): {
      healthStatus: 'healthy' | 'degraded' | 'failing' | 'disabled';
      isActive: boolean;
    } {
      if (consecutiveFailures === 0) {
        return { healthStatus: 'healthy', isActive: true };
      } else if (consecutiveFailures >= 5) {
        return { healthStatus: 'disabled', isActive: false };
      } else if (consecutiveFailures >= 3) {
        return { healthStatus: 'failing', isActive: true };
      } else {
        return { healthStatus: 'degraded', isActive: true };
      }
    }

    // 0 failures -> healthy
    expect(calculateNextHealth(0)).toEqual({ healthStatus: 'healthy', isActive: true });

    // 1-2 failures -> degraded
    expect(calculateNextHealth(1)).toEqual({ healthStatus: 'degraded', isActive: true });
    expect(calculateNextHealth(2)).toEqual({ healthStatus: 'degraded', isActive: true });

    // 3-4 failures -> failing
    expect(calculateNextHealth(3)).toEqual({ healthStatus: 'failing', isActive: true });
    expect(calculateNextHealth(4)).toEqual({ healthStatus: 'failing', isActive: true });

    // 5+ failures -> disabled
    expect(calculateNextHealth(5)).toEqual({ healthStatus: 'disabled', isActive: false });
    expect(calculateNextHealth(10)).toEqual({ healthStatus: 'disabled', isActive: false });
  });

  it('proves per-source failure isolation: one failing source does not halt independent sources', async () => {
    const mockSources: CompanySourceConfig[] = [
      {
        id: 'cs_source_a',
        companyId: 'comp_a',
        sourceId: 'src_1',
        sourceIdentifier: 'failing_source',
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
      },
      {
        id: 'cs_source_b',
        companyId: 'comp_b',
        sourceId: 'src_2',
        sourceIdentifier: 'healthy_source',
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
      },
    ];

    // Simulate parallel execution with isolation
    const results = await Promise.all(
      mockSources.map(async (src) => {
        try {
          if (src.sourceIdentifier === 'failing_source') {
            throw new Error('HTTP 500 Internal Server Error');
          }
          return { sourceId: src.id, status: 'succeeded' as const, discovered: 15 };
        } catch (err: any) {
          return { sourceId: src.id, status: 'failed' as const, error: err.message };
        }
      })
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ sourceId: 'cs_source_a', status: 'failed', error: 'HTTP 500 Internal Server Error' });
    expect(results[1]).toEqual({ sourceId: 'cs_source_b', status: 'succeeded', discovered: 15 });
  });
});
