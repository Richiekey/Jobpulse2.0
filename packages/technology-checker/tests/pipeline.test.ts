import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryStateStore, DiscoveryQueueProcessor, TechnologyCheckerVerifier, DiscoveryScorer } from '../src/index.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { ATSAdapterRegistry } from '@jobpulse/ats';

// Mock dependencies
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  upsert: vi.fn(),
  update: vi.fn(),
  select: vi.fn(),
} as unknown as SupabaseClient;

describe('TechnologyChecker Pipeline Regression Tests', () => {
  let store: InMemoryStateStore;
  let verifier: TechnologyCheckerVerifier;
  let queueProcessor: DiscoveryQueueProcessor;
  let scorer: DiscoveryScorer;

  beforeEach(() => {
    store = new InMemoryStateStore();
    verifier = new TechnologyCheckerVerifier(store);
    queueProcessor = new DiscoveryQueueProcessor(store, mockSupabase);
    scorer = new DiscoveryScorer(store, mockSupabase);
  });

  it('Phase 4: Promotion Regression Test', async () => {
    // A SUCCESS record should be promoted to production
    const id = await store.insertRecord({
      domain: 'example.com',
      company_name: 'Example Corp',
      ats_provider: 'workable',
      discovery_status: 'SUCCESS',
      verification_status: 'verified',
      adapter_status: 'ready',
      detection_url: 'https://apply.workable.com/example',
      board_identifier: 'example',
      crawl_job_count: 5,
      crawl_eligible_job_count: 5,
      promotion_status: null,
    });

    const queryMock = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'test-id' }, error: null })
    };

    const insertMock = {
      select: vi.fn().mockReturnValue(queryMock)
    };

    const fromMock = {
      select: vi.fn().mockReturnValue(queryMock),
      insert: vi.fn().mockReturnValue(insertMock),
      upsert: vi.fn().mockResolvedValue({ error: null })
    };

    mockSupabase.from = vi.fn().mockReturnValue(fromMock) as any;

    const metrics = await queueProcessor.promoteSuccessfulDiscovery({ limit: 10, dryRun: false });
    
    expect(metrics.promoted).toBe(1);
    const updated = await store.findRecord({ id });
    expect(updated?.discovery_status).toBe('SUCCESS');
    expect(updated?.promotion_status).toBe('promoted');
  });

  it('Phase 5: Adapter Unavailable Coverage', async () => {
    // A VERIFIED record with an unsupported ATS provider should become ADAPTER_RESOLVED but adapter_status=unavailable
    const id = await store.insertRecord({
      domain: 'example2.com',
      company_name: 'Example2 Corp',
      ats_provider: 'unsupported_ats',
      discovery_status: 'VERIFIED',
      verification_status: 'verified',
    });

    const metrics = await queueProcessor.resolveAdapters({ limit: 10, dryRun: false });
    
    expect(metrics.adapterUnavailable).toBe(1);
    const updated = await store.findRecord({ id });
    expect(updated?.discovery_status).toBe('VERIFIED');
    expect(updated?.adapter_status).toBe('unavailable');
  });

  it('Phase 6: Trial Crawl Validation & Funnel Integrity', async () => {
    // A CRAWL_QUEUED record should become SUCCESS or EMPTY after trial crawl
    const id = await store.insertRecord({
      domain: 'example3.com',
      company_name: 'Example3 Corp',
      ats_provider: 'workable',
      discovery_status: 'CRAWL_QUEUED',
      verification_status: 'verified',
      adapter_status: 'ready',
      board_identifier: 'example3',
    });

    // Mock ATSAdapterRegistry to return a mock adapter
    const mockAdapter = {
      discover: vi.fn().mockResolvedValue([{ externalJobId: 'job1' }]),
      fetch: vi.fn().mockResolvedValue({ payloadHash: 'hash', data: {} }),
      parse: vi.fn().mockResolvedValue({}),
      normalize: vi.fn().mockResolvedValue({
        displayTitle: 'Mock Job',
        canonicalTitle: 'Mock Job',
        // Make sure it fails eligibility to simulate EMPTY, e.g. lack of description or bad title
        description: '',
      }),
    };
    
    vi.spyOn(ATSAdapterRegistry, 'getAdapter').mockReturnValue(mockAdapter as any);

    const metrics = await queueProcessor.trialCrawl({ limit: 10, dryRun: false });
    
    // It should be EMPTY since it has 0 eligible jobs
    expect(metrics.crawlEmpty).toBe(1);
    const updated = await store.findRecord({ id });
    expect(updated?.discovery_status).toBe('EMPTY');
    
    // Restore spy
    vi.restoreAllMocks();
  });

  it('Phase 8: Missing Detection URL Handling', async () => {
    // Queue should still be able to enqueue crawls even if detection_url is null (for providers that dont need it, or we construct it)
    const id = await store.insertRecord({
      domain: 'example4.com',
      company_name: 'Example4 Corp',
      ats_provider: 'workable',
      discovery_status: 'ADAPTER_RESOLVED',
      verification_status: 'verified',
      adapter_status: 'ready',
      detection_url: null, // MISSING
      board_identifier: 'example4',
    });

    const metrics = await queueProcessor.enqueueCrawl({ limit: 10, dryRun: false });
    
    expect(metrics.crawlQueued).toBe(1);
    const updated = await store.findRecord({ id });
    expect(updated?.discovery_status).toBe('CRAWL_QUEUED');
  });
});
