import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScraperRunner } from '../src/engine/runner.js';
import * as atsModule from '@jobpulse/ats';
import { supabase } from '../src/db.js';
import { IngestionPipeline } from '../src/engine/pipeline.js';
import { JobLifecycleService } from '@jobpulse/domain';

describe('ScraperRunner & JobLifecycle Ingestion Integration (S26/S27 P0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleCompanySource = {
    id: 'cs_123',
    companyId: 'comp_123',
    sourceId: 'src_123',
    sourceIdentifier: 'stripe',
    adapterName: 'greenhouse',
    isActive: true,
    scheduleIntervalMinutes: 60,
    healthStatus: 'healthy' as const,
    consecutiveFailures: 0,
    lastCheckedAt: null,
  };

  it('triggers atomic job lifecycle reconciliation upon a complete, successful crawl', async () => {
    const mockAdapter = {
      platformSlug: 'greenhouse',
      parserVersion: '1.0.0',
      discover: vi.fn().mockResolvedValue([
        { externalJobId: 'job_active_1', title: 'Software Engineer' },
        { externalJobId: 'job_active_2', title: 'Product Manager' },
      ]),
    };

    vi.spyOn(atsModule, 'getAdapterForSource').mockReturnValue(mockAdapter as any);
    vi.spyOn(IngestionPipeline, 'processCandidate').mockResolvedValue({
      candidateId: 'job_active_1',
      status: 'inserted',
      jobId: 'job_1',
    } as any);

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: { observed_count: 2, missed_count: 1, expired_count: 0 },
      error: null,
    } as any);

    const runner = new ScraperRunner();
    (runner as any).updateSourceHealth = vi.fn().mockResolvedValue(undefined);
    (runner as any).recordSourceTelemetry = vi.fn().mockResolvedValue(undefined);

    const result = await runner.processSource(sampleCompanySource as any, 'run_123');

    expect(result.status).toBe('succeeded');
    expect(result.discovered).toBe(2);

    // Verify reconcile_company_source_job_lifecycle RPC was invoked with discovered external IDs
    expect(rpcSpy).toHaveBeenCalledWith('reconcile_company_source_job_lifecycle', {
      p_company_id: 'comp_123',
      p_crawled_external_ids: ['job_active_1', 'job_active_1'],
      p_scrape_time: expect.any(String),
      p_consecutive_miss_threshold: 3,
      p_max_staleness_days: 30,
    });
  });

  it('strictly skips lifecycle reconciliation when crawl is partial/incomplete (P1 Invariant)', async () => {
    const partialCandidates = [
      { externalJobId: 'job_part_1', title: 'Software Engineer' },
      { externalJobId: 'job_part_2', title: 'Product Manager' },
    ];
    (partialCandidates as any).isComplete = false;

    const mockAdapter = {
      platformSlug: 'smartrecruiters',
      parserVersion: '1.0.0',
      discover: vi.fn().mockResolvedValue(partialCandidates),
    };

    vi.spyOn(atsModule, 'getAdapterForSource').mockReturnValue(mockAdapter as any);
    vi.spyOn(IngestionPipeline, 'processCandidate').mockResolvedValue({
      candidateId: 'job_part_1',
      status: 'inserted',
      jobId: 'job_1',
    } as any);

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as any);

    const runner = new ScraperRunner();
    (runner as any).updateSourceHealth = vi.fn().mockResolvedValue(undefined);
    (runner as any).recordSourceTelemetry = vi.fn().mockResolvedValue(undefined);

    const result = await runner.processSource(sampleCompanySource as any, 'run_123');

    expect(result.status).toBe('succeeded');
    expect(result.discovered).toBe(2);

    // Hard Invariant: Partial crawl MUST NOT trigger reconciliation or job expiration
    expect(rpcSpy).not.toHaveBeenCalledWith(
      'reconcile_company_source_job_lifecycle',
      expect.anything()
    );
  });

  it('strictly skips lifecycle reconciliation when candidate ingestion experiences fetch failures', async () => {
    const candidates = [
      { externalJobId: 'job_ok', title: 'Software Engineer' },
      { externalJobId: 'job_failed', title: 'Product Manager' },
    ];

    const mockAdapter = {
      platformSlug: 'workday',
      parserVersion: '1.0.0',
      discover: vi.fn().mockResolvedValue(candidates),
    };

    vi.spyOn(atsModule, 'getAdapterForSource').mockReturnValue(mockAdapter as any);
    vi.spyOn(IngestionPipeline, 'processCandidate')
      .mockResolvedValueOnce({
        candidateId: 'job_ok',
        status: 'inserted',
        jobId: 'job_1',
      } as any)
      .mockResolvedValueOnce({
        candidateId: 'job_failed',
        status: 'failed',
        error: 'HTTP 429 Too Many Requests',
      } as any);

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as any);

    const runner = new ScraperRunner();
    (runner as any).updateSourceHealth = vi.fn().mockResolvedValue(undefined);
    (runner as any).recordSourceTelemetry = vi.fn().mockResolvedValue(undefined);

    const result = await runner.processSource(sampleCompanySource as any, 'run_123');

    expect(result.status).toBe('succeeded');
    expect(result.failed).toBe(1);

    // Ingestion failed for 1 candidate -> crawl is incomplete -> reconciliation skipped
    expect(rpcSpy).not.toHaveBeenCalledWith(
      'reconcile_company_source_job_lifecycle',
      expect.anything()
    );
  });

  it('strictly skips lifecycle reconciliation when crawl fails with an error (P0 Invariant)', async () => {
    const mockAdapter = {
      platformSlug: 'greenhouse',
      parserVersion: '1.0.0',
      discover: vi.fn().mockRejectedValue(new Error('Greenhouse API 500 Internal Server Error')),
    };

    vi.spyOn(atsModule, 'getAdapterForSource').mockReturnValue(mockAdapter as any);
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as any);

    const runner = new ScraperRunner();
    (runner as any).updateSourceHealth = vi.fn().mockResolvedValue(undefined);
    (runner as any).recordSourceTelemetry = vi.fn().mockResolvedValue(undefined);

    const result = await runner.processSource(sampleCompanySource as any, 'run_123');

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('Greenhouse API 500 Internal Server Error');

    // Hard Invariant: reconcile_company_source_job_lifecycle must NOT be called on failed crawl
    expect(rpcSpy).not.toHaveBeenCalledWith(
      'reconcile_company_source_job_lifecycle',
      expect.anything()
    );
  });

  it('strictly skips lifecycle reconciliation when crawl times out', async () => {
    const mockAdapter = {
      platformSlug: 'greenhouse',
      parserVersion: '1.0.0',
      discover: vi.fn().mockRejectedValue(new Error('ETIMEDOUT: Connect timeout after 10000ms')),
    };

    vi.spyOn(atsModule, 'getAdapterForSource').mockReturnValue(mockAdapter as any);
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as any);

    const runner = new ScraperRunner();
    (runner as any).updateSourceHealth = vi.fn().mockResolvedValue(undefined);
    (runner as any).recordSourceTelemetry = vi.fn().mockResolvedValue(undefined);

    const result = await runner.processSource(sampleCompanySource as any, 'run_123');

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('ETIMEDOUT');

    // Hard Invariant: reconcile_company_source_job_lifecycle must NOT be called on timeout
    expect(rpcSpy).not.toHaveBeenCalledWith(
      'reconcile_company_source_job_lifecycle',
      expect.anything()
    );
  });

  it('strictly skips lifecycle reconciliation when crawl is cancelled or aborted', async () => {
    const mockAdapter = {
      platformSlug: 'greenhouse',
      parserVersion: '1.0.0',
      discover: vi.fn().mockRejectedValue(new Error('AbortError: Scrape run was cancelled by operator')),
    };

    vi.spyOn(atsModule, 'getAdapterForSource').mockReturnValue(mockAdapter as any);
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as any);

    const runner = new ScraperRunner();
    (runner as any).updateSourceHealth = vi.fn().mockResolvedValue(undefined);
    (runner as any).recordSourceTelemetry = vi.fn().mockResolvedValue(undefined);

    const result = await runner.processSource(sampleCompanySource as any, 'run_123');

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('AbortError');

    // Hard Invariant: reconcile_company_source_job_lifecycle must NOT be called on cancellation
    expect(rpcSpy).not.toHaveBeenCalledWith(
      'reconcile_company_source_job_lifecycle',
      expect.anything()
    );
  });

  it('strictly skips lifecycle reconciliation when complete-crawl contract is not satisfied', async () => {
    const mockAdapter = {
      platformSlug: 'greenhouse',
      parserVersion: '1.0.0',
      discover: vi.fn().mockResolvedValue([{ externalJobId: 'job_1', title: 'Eng' }]),
    };

    vi.spyOn(atsModule, 'getAdapterForSource').mockReturnValue(mockAdapter as any);
    vi.spyOn(IngestionPipeline, 'processCandidate').mockResolvedValue({
      candidateId: 'job_1',
      status: 'inserted',
      jobId: 'job_1',
    } as any);

    // Mock isEligibleForReconciliation to return false
    vi.spyOn(JobLifecycleService, 'isEligibleForReconciliation').mockReturnValue(false);

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as any);

    const runner = new ScraperRunner();
    (runner as any).updateSourceHealth = vi.fn().mockResolvedValue(undefined);
    (runner as any).recordSourceTelemetry = vi.fn().mockResolvedValue(undefined);

    const result = await runner.processSource(sampleCompanySource as any, 'run_123');

    expect(result.status).toBe('succeeded');
    expect(rpcSpy).not.toHaveBeenCalledWith(
      'reconcile_company_source_job_lifecycle',
      expect.anything()
    );
  });
});
