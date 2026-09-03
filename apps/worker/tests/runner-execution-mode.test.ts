import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScraperRunner, type ScrapeExecutionMode } from '../src/engine/runner.js';
import { supabase } from '../src/db.js';
import { SourceScheduler } from '@jobpulse/domain';

describe('ScraperRunner Execution Modes & Manual Global Semantics (P0 / P1 Invariant)', () => {
  let runner: ScraperRunner;

  beforeEach(() => {
    vi.restoreAllMocks();
    runner = new ScraperRunner({ concurrency: 2 });
  });

  it('determines forceDue: true for manual_global execution mode regardless of last_checked_at', async () => {
    const filterSpy = vi.spyOn(SourceScheduler, 'filterAndOrderEligibleSources').mockReturnValue([]);

    const mockSources = [
      {
        id: 'cs-fresh-1',
        company_id: 'comp-1',
        source_id: 'src-1',
        source_identifier: 'stripe',
        is_active: true,
        health_status: 'healthy',
        schedule_interval_minutes: 360,
        last_checked_at: new Date().toISOString(), // Freshly checked 0s ago
        sources: { adapter_name: 'greenhouse', name: 'Greenhouse' },
      },
    ];

    // Mock supabase calls
    const mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'run_test_1', metadata: {} }, error: null }),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    };
    // Make query thenable returning mockSources
    (mockQueryBuilder as any).then = (resolve: any) => resolve({ data: mockSources, error: null });

    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'scrape_runs') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'run_test_1', metadata: { execution_mode: 'manual_global' } },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'run_test_1', metadata: { execution_mode: 'manual_global' } },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return mockQueryBuilder as any;
    });

    await runner.run({
      executionMode: 'manual_global',
    });

    // Invariant: filterAndOrderEligibleSources must receive forceDue: true for manual_global
    expect(filterSpy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        forceDue: true,
      })
    );
  });

  it('determines forceDue: false for scheduled execution mode', async () => {
    const filterSpy = vi.spyOn(SourceScheduler, 'filterAndOrderEligibleSources').mockReturnValue([]);

    const mockSources = [
      {
        id: 'cs-fresh-2',
        company_id: 'comp-2',
        source_id: 'src-2',
        source_identifier: 'figma',
        is_active: true,
        health_status: 'healthy',
        schedule_interval_minutes: 360,
        last_checked_at: new Date().toISOString(),
        sources: { adapter_name: 'ashby', name: 'Ashby' },
      },
    ];

    const mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
    };
    (mockQueryBuilder as any).then = (resolve: any) => resolve({ data: mockSources, error: null });

    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'scrape_runs') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'run_test_2', metadata: { execution_mode: 'scheduled' } },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        } as any;
      }
      return mockQueryBuilder as any;
    });

    await runner.run({
      executionMode: 'scheduled',
    });

    // Invariant: filterAndOrderEligibleSources must receive forceDue: false for scheduled
    expect(filterSpy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        forceDue: false,
      })
    );
  });

  it('preserves and respects execution_mode from claimed queue runs in pollAndExecutePending', async () => {
    const runSpy = vi.spyOn(runner, 'run').mockResolvedValue('run_claimed_99');

    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: [
        {
          id: 'run_claimed_99',
          started_at: new Date().toISOString(),
          status: 'running',
          metadata: {
            execution_mode: 'manual_global',
            company_identifier: 'all',
          },
        },
      ],
      error: null,
    } as any);

    const claimedId = await runner.pollAndExecutePending();

    expect(claimedId).toBe('run_claimed_99');
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_claimed_99',
        executionMode: 'manual_global',
        companyIdentifier: undefined, // 'all' mapped to undefined for full source scope
      })
    );
  });
});
