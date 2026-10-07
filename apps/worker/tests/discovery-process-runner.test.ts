import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscoveryProcessRunner } from '../src/engine/discovery-process-runner.js';
import { InMemoryStateStore } from '@jobpulse/technology-checker';
import { httpClient } from '@jobpulse/shared';
import { ATSAdapterRegistry, type ATSAdapter } from '@jobpulse/ats';

describe('DiscoveryProcessRunner End-to-End Orchestration', () => {
  let store: InMemoryStateStore;
  let runner: DiscoveryProcessRunner;

  beforeEach(() => {
    store = new InMemoryStateStore();
    runner = new DiscoveryProcessRunner();

    // Mock HTTP client to prevent external calls and timeouts
    vi.spyOn(httpClient, 'get').mockResolvedValue({
      data: '<html><div id="grnhse_app"></div></html>',
      status: 200,
      headers: {},
      url: 'https://boards.greenhouse.io/sample',
    });

    // Mock Adapter discover/validate
    const mockAdapter = {
      platformSlug: 'ashby',
      validateSource: vi.fn().mockResolvedValue({ isValid: true }),
      discover: vi.fn().mockResolvedValue([]),
    };
    vi.spyOn(ATSAdapterRegistry, 'getAdapter').mockReturnValue(mockAdapter as unknown as ATSAdapter);
  });

  it('runs the full pipeline on InMemoryStateStore in dry-run mode and outputs a complete report', async () => {
    // Seed records across stages
    await store.insertRecord({
      domain: 'sample-verified.com',
      company_name: 'Sample Verified',
      ats_provider: 'ashby',
      discovery_status: 'VERIFIED',
      board_identifier: 'sample',
      priority_score: 85,
    });

    await store.insertRecord({
      domain: 'sample-success.com',
      company_name: 'Sample Success',
      ats_provider: 'lever',
      discovery_status: 'SUCCESS',
      verification_status: 'verified',
      adapter_status: 'ready',
      board_identifier: 'sample',
      crawl_job_count: 5,
      crawl_eligible_job_count: 3,
      crawl_rejected_job_count: 2,
      promotion_status: null,
      priority_score: 90,
    });

    const report = await runner.runPipeline({
      dryRun: true,
      limit: 10,
      store,
    });

    expect(report.dryRun).toBe(true);
    expect(report.workerId).toBeDefined();
    expect(report.stagesRun).toEqual([
      'verification',
      'adapter_resolution',
      'enqueue_crawl',
      'trial_crawl',
      'promotion',
      'scoring',
    ]);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.promotion?.promoted).toBe(1);

    // Verify the SUCCESS record was promoted in store
    const records = store.getAllRecords();
    const promotedRecord = records.find((r) => r.domain === 'sample-success.com');
    expect(promotedRecord?.promotion_status).toBe('promoted');
    expect(promotedRecord?.promoted_at).toBeDefined();
  });

  it('allows executing specific selective stages', async () => {
    await store.insertRecord({
      domain: 'sample-verified.com',
      company_name: 'Sample Verified',
      ats_provider: 'ashby',
      discovery_status: 'VERIFIED',
      priority_score: 75,
    });

    const report = await runner.runPipeline({
      dryRun: true,
      limit: 10,
      store,
      stages: ['adapter_resolution'],
    });

    expect(report.stagesRun).toEqual(['adapter_resolution']);
    expect(report.adapterResolution?.adapterResolved).toBe(1);
    expect(report.verification).toBeUndefined();
    expect(report.promotion).toBeUndefined();
  });
});
