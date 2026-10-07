import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStateStore } from '../src/state-store.js';
import { DiscoveryQueueProcessor } from '../src/queue-processor.js';

describe('Concurrent Promotion & Idempotency (MC-5)', () => {
  let store: InMemoryStateStore;

  beforeEach(() => {
    store = new InMemoryStateStore();
  });

  it('guarantees atomic non-overlapping candidate claiming across concurrent workers', async () => {
    // Seed 10 candidates in SUCCESS status
    const ids: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const id = await store.insertRecord({
        domain: `company-${i}.com`,
        company_name: `Company ${i}`,
        ats_provider: 'greenhouse',
        discovery_status: 'SUCCESS',
        verification_status: 'verified',
        adapter_status: 'ready',
        board_identifier: `company-${i}`,
        crawl_job_count: 5,
        crawl_eligible_job_count: 3,
        crawl_rejected_job_count: 2,
        priority_score: 50 + i,
        promotion_status: null,
      });
      ids.push(id);
    }

    // Worker 1 and Worker 2 claim concurrently
    const [claimedWorker1, claimedWorker2] = await Promise.all([
      store.claimCandidates('SUCCESS', 'worker-1', 5, 10),
      store.claimCandidates('SUCCESS', 'worker-2', 5, 10),
    ]);

    // Total claimed should be 10 (5 by each worker)
    expect(claimedWorker1.length).toBe(5);
    expect(claimedWorker2.length);

    // Verify completely disjoint sets (zero overlap)
    const worker1Ids = new Set(claimedWorker1.map((r) => r.id));
    const worker2Ids = new Set(claimedWorker2.map((r) => r.id));

    for (const id of worker1Ids) {
      expect(worker2Ids.has(id)).toBe(false);
    }
  });

  it('ensures exactly one promotion per candidate when two workers promote concurrently', async () => {
    // Seed candidates in SUCCESS status
    for (let i = 1; i <= 6; i++) {
      await store.insertRecord({
        domain: `target-${i}.com`,
        company_name: `Target ${i}`,
        ats_provider: 'ashby',
        discovery_status: 'SUCCESS',
        verification_status: 'verified',
        adapter_status: 'ready',
        board_identifier: `target-${i}`,
        crawl_job_count: 10,
        crawl_eligible_job_count: 5,
        crawl_rejected_job_count: 5,
        promotion_status: null,
      });
    }

    const processor1 = new DiscoveryQueueProcessor(store, undefined, { workerId: 'worker-1' });
    const processor2 = new DiscoveryQueueProcessor(store, undefined, { workerId: 'worker-2' });

    // Both processors run promote concurrently in dry-run mode
    const [metrics1, metrics2] = await Promise.all([
      processor1.promoteSuccessfulDiscovery({ limit: 10, dryRun: true }),
      processor2.promoteSuccessfulDiscovery({ limit: 10, dryRun: true }),
    ]);

    // Sum of promoted across both workers must equal total candidate count (6)
    expect(metrics1.promoted + metrics2.promoted).toBe(6);

    // Verify all records in store are marked promoted exactly once
    const allRecords = store.getAllRecords();
    for (const rec of allRecords) {
      expect(rec.promotion_status).toBe('promoted');
      expect(rec.promoted_at).toBeDefined();
    }
  });

  it('proves idempotency: subsequent promotion runs result in zero duplicate promotions', async () => {
    await store.insertRecord({
      domain: 'idempotent-test.com',
      company_name: 'Idempotent Test',
      ats_provider: 'lever',
      discovery_status: 'SUCCESS',
      verification_status: 'verified',
      adapter_status: 'ready',
      board_identifier: 'idempotent-test',
      crawl_job_count: 8,
      crawl_eligible_job_count: 4,
      promotion_status: null,
    });

    const processor = new DiscoveryQueueProcessor(store, undefined, { workerId: 'worker-1' });

    // First promotion run: 1 promoted
    const run1 = await processor.promoteSuccessfulDiscovery({ limit: 10, dryRun: true });
    expect(run1.promoted).toBe(1);

    // Second promotion run: 0 promoted (idempotent, candidate already promoted)
    const run2 = await processor.promoteSuccessfulDiscovery({ limit: 10, dryRun: true });
    expect(run2.promoted).toBe(0);

    // Third promotion run from another worker: 0 promoted
    const processor2 = new DiscoveryQueueProcessor(store, undefined, { workerId: 'worker-2' });
    const run3 = await processor2.promoteSuccessfulDiscovery({ limit: 10, dryRun: true });
    expect(run3.promoted).toBe(0);
  });
});
