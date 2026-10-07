import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryStateStore } from '../src/state-store.js';
import { TechnologyCheckerVerifier } from '../src/verification.js';
import { DiscoveryQueueProcessor } from '../src/queue-processor.js';
import { ATSAdapterRegistry, type ATSAdapter } from '@jobpulse/ats';
import { httpClient } from '@jobpulse/shared';

describe('End-to-End Pipeline Lifecycle (DISCOVERED → PROMOTED)', () => {
  let store: InMemoryStateStore;

  beforeEach(() => {
    store = new InMemoryStateStore();
  });

  it('progresses a candidate cleanly through the entire 5-stage pipeline', async () => {
    // Mock Adapter discover/fetch/parse/normalize/validateSource
    const mockAdapter = {
      platformSlug: 'greenhouse',
      detect: vi.fn().mockReturnValue({
        detected: true,
        atsType: 'greenhouse',
        boardIdentifier: 'acmee2e',
        confidence: 0.95,
      }),
      validateSource: vi.fn().mockResolvedValue({ isValid: true }),
      discover: vi.fn().mockResolvedValue([
        { externalJobId: 'job-1', title: 'Senior Software Engineer', url: 'https://boards.greenhouse.io/acmee2e/jobs/1' },
      ]),
      fetch: vi.fn().mockResolvedValue({ payloadHash: 'hash-1', raw: {} }),
      parse: vi.fn().mockResolvedValue({ title: 'Senior Software Engineer' }),
      normalize: vi.fn().mockResolvedValue({
        displayTitle: 'Senior Software Engineer',
        canonicalTitle: 'Senior Software Engineer',
        description: 'We are looking for a Senior Software Engineer with TypeScript and React experience.',
        workplaceType: 'remote',
        locations: ['Remote'],
        postedAt: new Date().toISOString(),
      }),
    };

    vi.spyOn(ATSAdapterRegistry, 'getAdapter').mockReturnValue(mockAdapter as unknown as ATSAdapter);

    // Mock HTTP for verification
    const greenhouseHtml = `
      <html>
        <head><title>Acme Careers</title></head>
        <body>
          <div id="grnhse_app">
            <a href="https://boards.greenhouse.io/acmee2e/jobs/12345">Senior Engineer</a>
          </div>
        </body>
      </html>
    `;

    vi.spyOn(httpClient, 'get').mockResolvedValue({
      data: greenhouseHtml,
      status: 200,
      headers: {},
      url: 'https://boards.greenhouse.io/acmee2e',
    });

    // 0. Seed a raw DISCOVERED record
    const id = await store.insertRecord({
      domain: 'acme-e2e.com',
      company_name: 'Acme E2E',
      ats_provider: 'greenhouse',
      discovery_status: 'DISCOVERED',
      verification_status: 'pending',
      careers_url: 'https://boards.greenhouse.io/acmee2e',
      priority_score: 50,
    });

    // STAGE 1: Verification
    const verifier = new TechnologyCheckerVerifier(store, { workerId: 'worker-v' });
    const vMetrics = await verifier.verifyPending({ limit: 10, dryRun: true });

    expect(vMetrics.totalProcessed).toBe(1);
    expect(vMetrics.verified).toBe(1);

    const recordAfterV = await store.findRecord({ id });
    expect(recordAfterV?.discovery_status).toBe('VERIFIED');
    expect(recordAfterV?.board_identifier).toBe('acmee2e');

    // STAGE 2: Adapter Resolution
    const processor = new DiscoveryQueueProcessor(store, undefined, { workerId: 'worker-p' });
    const arMetrics = await processor.resolveAdapters({ limit: 10, dryRun: true });

    expect(arMetrics.adapterResolved).toBe(1);
    const recordAfterAR = await store.findRecord({ id });
    expect(recordAfterAR?.discovery_status).toBe('ADAPTER_RESOLVED');
    expect(recordAfterAR?.adapter_status).toBe('ready');

    // STAGE 3: Enqueue Crawl
    const eqMetrics = await processor.enqueueCrawl({ limit: 10, dryRun: true });

    expect(eqMetrics.crawlQueued).toBe(1);
    const recordAfterEQ = await store.findRecord({ id });
    expect(recordAfterEQ?.discovery_status).toBe('CRAWL_QUEUED');

    // STAGE 4: Trial Crawl
    const tcMetrics = await processor.trialCrawl({ limit: 10, dryRun: true });

    expect(tcMetrics.crawlSuccess).toBe(1);
    const recordAfterTC = await store.findRecord({ id });
    expect(recordAfterTC?.discovery_status).toBe('SUCCESS');
    expect(recordAfterTC?.crawl_eligible_job_count).toBeGreaterThan(0);

    // STAGE 5: Promotion (Dry-Run)
    const pMetrics = await processor.promoteSuccessfulDiscovery({ limit: 10, dryRun: true });

    expect(pMetrics.promoted).toBe(1);
    const recordAfterP = await store.findRecord({ id });
    expect(recordAfterP?.promotion_status).toBe('promoted');
    expect(recordAfterP?.promoted_at).toBeDefined();
    expect(recordAfterP?.discovery_status).toBe('SUCCESS');
  });
});
