import { DiscoveryQueueProcessor, DiscoveryScorer } from '@jobpulse/technology-checker';
import { supabase } from '../db.js';
import { logger } from '@jobpulse/shared';

/**
 * Phase 6 + 7: Discovery Queue Runner
 * Drives records through:  VERIFIED → ADAPTER_RESOLVED → CRAWL_QUEUED → SUCCESS/EMPTY/FAILED
 * Then scores all records for crawl priority ordering.
 *
 * This is completely separate from the job ingestion pipeline.
 */
export class DiscoveryQueueRunner {
  public async runQueue(options: { limit?: number; dryRun?: boolean } = {}) {
    logger.info(`Starting discovery queue processing (Limit: ${options.limit || 100}, DryRun: ${!!options.dryRun})...`);
    
    const processor = new DiscoveryQueueProcessor(supabase);
    const scorer = new DiscoveryScorer(supabase);
    const limit = options.limit || 100;

    // Step 1: VERIFIED → ADAPTER_RESOLVED
    logger.info('[Queue] Phase 5: Resolving adapters for VERIFIED records...');
    const adapterMetrics = await processor.resolveAdapters({ limit, dryRun: options.dryRun });
    logger.info('[Queue] Adapter resolution complete.', { metrics: adapterMetrics });

    // Step 2: ADAPTER_RESOLVED → CRAWL_QUEUED (Queuing only)
    logger.info('[Queue] Phase 6: Enqueuing ADAPTER_RESOLVED records for crawl...');
    const enqueueMetrics = await processor.enqueueCrawl({ limit, dryRun: options.dryRun });
    logger.info('[Queue] Crawl enqueue complete.', { metrics: enqueueMetrics });

    // Step 3: CRAWL_QUEUED → TRIAL_CRAWLING → SUCCESS/EMPTY/FAILED (trial crawl)
    logger.info('[Queue] Phase 6: Running trial crawls for CRAWL_QUEUED records...');
    const crawlMetrics = await processor.trialCrawl({ limit: Math.min(limit, 20), dryRun: options.dryRun }); // Cap trial crawls
    logger.info('[Queue] Trial crawl complete.', { metrics: crawlMetrics });

    // Step 3.5: SUCCESS → PROMOTED (promote to production company_sources)
    logger.info('[Queue] Phase 6: Promoting SUCCESS records to production...');
    const promotionMetrics = await processor.promoteSuccessfulDiscovery({ limit, dryRun: options.dryRun });
    logger.info('[Queue] Promotion complete.', { metrics: promotionMetrics });

    // Step 4: Phase 7 — Refresh priority scores
    logger.info('[Queue] Phase 7: Refreshing priority scores...');
    const scoringMetrics = await scorer.scoreAll({ dryRun: options.dryRun });
    logger.info('[Queue] Scoring complete.', { metrics: scoringMetrics });

    // Aggregate summary
    const summary = {
      adaptersResolved: adapterMetrics.adapterResolved,
      adaptersUnavailable: adapterMetrics.adapterUnavailable,
      crawlQueued: enqueueMetrics.crawlQueued,
      crawlSuccess: crawlMetrics.crawlSuccess,
      crawlEmpty: crawlMetrics.crawlEmpty,
      crawlFailed: crawlMetrics.crawlFailed + enqueueMetrics.crawlFailed,
      promoted: promotionMetrics.promoted,
      totalErrors: adapterMetrics.errors + enqueueMetrics.errors + crawlMetrics.errors + promotionMetrics.errors,
      scoring: scoringMetrics,
    };

    logger.info('[Queue] Discovery queue processing complete.', { summary });

    return summary;
  }

  /**
   * Phase 7: Score all discovery records and report breakdown.
   */
  public async runScoring() {
    logger.info('[Scoring] Starting priority score refresh...');
    const scorer = new DiscoveryScorer(supabase);
    const metrics = await scorer.scoreAll();
    logger.info('[Scoring] Complete.', { metrics });
    return metrics;
  }

  /**
   * Print funnel metrics from the discovery_registry (includes priority breakdown).
   */
  public async printFunnel() {
    const { data, error } = await supabase.rpc('get_discovery_funnel_metrics');
    
    if (error) {
      logger.error('Failed to get discovery funnel metrics', { error: error.message });
      return;
    }

    if (!data || data.length === 0) {
      logger.info('[Funnel] No discovery records found.');
      return;
    }

    logger.info('[Funnel] Discovery Pipeline Metrics:');
    for (const row of data) {
      logger.info(`  ${row.ats_provider}:`);
      logger.info(`    Pipeline: DISCOVERED=${row.discovered} VERIFYING=${row.verifying} VERIFIED=${row.verified} ADAPTER_RESOLVED=${row.adapter_resolved} CRAWL_QUEUED=${row.crawl_queued} SUCCESS=${row.success} EMPTY=${row.empty} FAILED=${row.failed}`);
      logger.info(`    Priority: avg=${row.avg_priority} high(≥60)=${row.high_priority} low(<30)=${row.low_priority}`);
    }
  }
}
