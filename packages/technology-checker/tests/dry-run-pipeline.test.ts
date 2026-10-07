import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStateStore, DiscoveryQueueProcessor, DiscoveryScorer } from '../src/index.js';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Dry-run pipeline integration test.
 *
 * Verifies that when InMemoryStateStore is used:
 * 1. Records inserted by discovery are visible to downstream phases
 * 2. State transitions persist across phases (discovery → verification → queue)
 * 3. Zero Supabase calls are made (no real DB mutations)
 * 4. Metrics report >0 records processed
 */

const mockSupabase = {} as unknown as SupabaseClient;

describe('Dry-Run Pipeline via InMemoryStateStore', () => {
  let store: InMemoryStateStore;
  let queueProcessor: DiscoveryQueueProcessor;
  let scorer: DiscoveryScorer;

  beforeEach(() => {
    store = new InMemoryStateStore();
    queueProcessor = new DiscoveryQueueProcessor(store, mockSupabase);
    scorer = new DiscoveryScorer(store, mockSupabase);
  });

  it('downstream phases see records inserted by earlier phases', async () => {
    // Simulate what discovery would do: insert DISCOVERED records
    await store.insertRecord({
      domain: 'company-a.com',
      company_name: 'Company A',
      ats_provider: 'workable',
      discovery_status: 'DISCOVERED',
      verification_status: 'pending',
    });

    await store.insertRecord({
      domain: 'company-b.com',
      company_name: 'Company B',
      ats_provider: 'greenhouse',
      discovery_status: 'DISCOVERED',
      verification_status: 'pending',
    });

    // Verify DISCOVERED records are findable
    const discovered = await store.queryByStatus('DISCOVERED');
    expect(discovered.length).toBe(2);
  });

  it('VERIFIED records flow through adapter resolution', async () => {
    // Seed the store with VERIFIED records (skipping the verification phase)
    await store.insertRecord({
      domain: 'flow-test.com',
      company_name: 'Flow Test Corp',
      ats_provider: 'workable',
      discovery_status: 'VERIFIED',
      verification_status: 'verified',
    });

    const metrics = await queueProcessor.resolveAdapters({ limit: 10, dryRun: false });

    // workable has an adapter, so it should be resolved
    expect(metrics.adapterResolved).toBe(1);

    // Now check the record transitioned to ADAPTER_RESOLVED
    const resolved = await store.queryByStatus('ADAPTER_RESOLVED');
    expect(resolved.length).toBe(1);
    expect(resolved[0].adapter_status).toBe('ready');
  });

  it('ADAPTER_RESOLVED records flow through crawl enqueue', async () => {
    await store.insertRecord({
      domain: 'crawl-test.com',
      company_name: 'Crawl Test Corp',
      ats_provider: 'workable',
      discovery_status: 'ADAPTER_RESOLVED',
      verification_status: 'verified',
      adapter_status: 'ready',
      board_identifier: 'crawl-test',
    });

    const metrics = await queueProcessor.enqueueCrawl({ limit: 10, dryRun: false });
    expect(metrics.crawlQueued).toBe(1);

    const queued = await store.queryByStatus('CRAWL_QUEUED');
    expect(queued.length).toBe(1);
  });

  it('SUCCESS records flow through promotion (dryRun)', async () => {
    await store.insertRecord({
      domain: 'promote-test.com',
      company_name: 'Promote Test Corp',
      ats_provider: 'workable',
      discovery_status: 'SUCCESS',
      verification_status: 'verified',
      adapter_status: 'ready',
      board_identifier: 'promote-test',
      crawl_job_count: 5,
      crawl_eligible_job_count: 5,
      promotion_status: null,
    });

    const metrics = await queueProcessor.promoteSuccessfulDiscovery({ limit: 10, dryRun: true });
    expect(metrics.promoted).toBe(1);

    // Verify the promotion decision was recorded in the store
    const records = store.getAllRecords();
    const promoted = records.find(r => r.domain === 'promote-test.com');
    expect(promoted?.promotion_status).toBe('promoted');
  });

  it('scoring processes all records in the store', async () => {
    await store.insertRecord({
      domain: 'score-1.com',
      company_name: 'Score 1',
      ats_provider: 'workable',
      discovery_status: 'SUCCESS',
      verification_status: 'verified',
      adapter_status: 'ready',
      crawl_job_count: 10,
      first_discovered_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      detection_url: 'https://apply.workable.com/score-1',
      board_identifier: 'score-1',
    });

    await store.insertRecord({
      domain: 'score-2.com',
      company_name: 'Score 2',
      ats_provider: 'greenhouse',
      discovery_status: 'FAILED',
      verification_status: 'mismatch',
      adapter_status: null,
      crawl_job_count: null,
      first_discovered_at: new Date().toISOString(),
    });

    const metrics = await scorer.scoreAll({ dryRun: false });
    expect(metrics.totalScored).toBe(2);

    // High-scoring record should be highPriority
    const records = store.getAllRecords();
    const score1 = records.find(r => r.domain === 'score-1.com');
    const score2 = records.find(r => r.domain === 'score-2.com');

    expect(score1!.priority_score).toBeGreaterThan(50);
    expect(score2!.priority_score).toBeLessThan(30);
  });

  it('multi-phase pipeline: VERIFIED → ADAPTER_RESOLVED → CRAWL_QUEUED all via InMemoryStateStore', async () => {
    // Seed with 3 VERIFIED workable records
    for (let i = 0; i < 3; i++) {
      await store.insertRecord({
        domain: `multi-${i}.com`,
        company_name: `Multi ${i}`,
        ats_provider: 'workable',
        discovery_status: 'VERIFIED',
        verification_status: 'verified',
        board_identifier: `multi-${i}`,
      });
    }

    // Phase 1: Resolve adapters
    const adapterMetrics = await queueProcessor.resolveAdapters({ limit: 10 });
    expect(adapterMetrics.adapterResolved).toBe(3);

    // Phase 2: Enqueue crawls
    const crawlMetrics = await queueProcessor.enqueueCrawl({ limit: 10 });
    expect(crawlMetrics.crawlQueued).toBe(3);

    // Verify all 3 are now CRAWL_QUEUED
    const queued = await store.queryByStatus('CRAWL_QUEUED');
    expect(queued.length).toBe(3);

    // Verify no Supabase calls were made (the mock has no methods — any call would throw)
    // The fact that we got here without errors proves zero DB mutations.
  });
});
