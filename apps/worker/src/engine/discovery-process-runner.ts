import {
  TechnologyCheckerVerifier,
  DiscoveryQueueProcessor,
  DiscoveryScorer,
  SupabaseStateStore,
  InMemoryStateStore,
  PipelineExecutionContext,
  type StateStore,
  type VerificationMetrics,
  type QueueProcessorMetrics,
} from '@jobpulse/technology-checker';
import { supabase } from '../db.js';
import { logger } from '@jobpulse/shared';

export type PipelineStageName =
  | 'verification'
  | 'adapter_resolution'
  | 'enqueue_crawl'
  | 'trial_crawl'
  | 'promotion'
  | 'scoring';

export interface DiscoveryProcessOptions {
  limit?: number;
  dryRun?: boolean;
  store?: StateStore;
  stages?: PipelineStageName[];
  workerId?: string;
  claimDurationMinutes?: number;
  maxVerificationAttempts?: number;
  maxTrialCrawlAttempts?: number;
}

export interface DiscoveryProcessReport {
  startTime: string;
  endTime: string;
  durationMs: number;
  dryRun: boolean;
  workerId: string;
  recoveredClaims: number;
  stagesRun: PipelineStageName[];
  verification?: VerificationMetrics;
  adapterResolution?: QueueProcessorMetrics;
  enqueueCrawl?: QueueProcessorMetrics;
  trialCrawl?: QueueProcessorMetrics;
  promotion?: QueueProcessorMetrics;
  scoring?: Record<string, any>;
  totalErrors: number;
}

/**
 * DiscoveryProcessRunner
 * Orchestrates the full automated verification and promotion pipeline:
 *   DISCOVERED → VERIFICATION → ADAPTER_RESOLUTION → TRIAL_CRAWL → ELIGIBILITY → PROMOTION
 *
 * Fully automated, idempotent, observable, retry-safe, and production-safe.
 */
export class DiscoveryProcessRunner {
  public async runPipeline(options: DiscoveryProcessOptions = {}): Promise<DiscoveryProcessReport> {
    const startTime = new Date();
    const dryRun = options.dryRun ?? false;
    const limit = options.limit ?? 50;
    const workerId = options.workerId ?? `discovery-runner-${Math.random().toString(36).substring(2, 9)}`;
    const claimDurationMinutes = options.claimDurationMinutes ?? 10;

    const stagesToRun = options.stages ?? [
      'verification',
      'adapter_resolution',
      'enqueue_crawl',
      'trial_crawl',
      'promotion',
      'scoring',
    ];

    logger.info(`Starting Discovery Pipeline Process (Limit: ${limit}, DryRun: ${dryRun}, Worker: ${workerId})...`, {
      stages: stagesToRun,
    });

    // 1. Initialize StateStore & Execution Context
    const dbStore = new SupabaseStateStore(supabase);
    const store: StateStore = options.store || (dryRun ? new InMemoryStateStore(dbStore) : dbStore);

    const context = new PipelineExecutionContext({
      store,
      dryRun,
      workerId,
      claimDurationMinutes,
      maxVerificationAttempts: options.maxVerificationAttempts ?? 3,
      maxTrialCrawlAttempts: options.maxTrialCrawlAttempts ?? 3,
    });

    // 2. Recover Stale Claims (MC-1)
    let recoveredClaims = 0;
    try {
      recoveredClaims = await store.recoverStaleClaims(claimDurationMinutes);
      if (recoveredClaims > 0) {
        logger.info(`Recovered ${recoveredClaims} stale discovery claim(s).`);
      }
    } catch (err: any) {
      logger.warn('Failed to recover stale claims during pipeline start', { error: err.message });
    }

    const verifier = new TechnologyCheckerVerifier(context);
    const processor = new DiscoveryQueueProcessor(context, supabase);
    const scorer = new DiscoveryScorer(store, supabase);

    const report: DiscoveryProcessReport = {
      startTime: startTime.toISOString(),
      endTime: '',
      durationMs: 0,
      dryRun,
      workerId,
      recoveredClaims,
      stagesRun: [],
      totalErrors: 0,
    };

    // Stage 1: Verification (DISCOVERED → VERIFYING → VERIFIED / FAILED)
    if (stagesToRun.includes('verification')) {
      logger.info('[DiscoveryPipeline] Phase 1: Running ATS Verification...');
      try {
        const vMetrics = await verifier.verifyPending({ limit, dryRun });
        report.verification = vMetrics;
        report.stagesRun.push('verification');
        report.totalErrors += vMetrics.errors;
        logger.info('[DiscoveryPipeline] Phase 1 Complete.', { metrics: vMetrics });
      } catch (err: any) {
        report.totalErrors++;
        logger.error('[DiscoveryPipeline] Phase 1 Verification encountered error', { error: err.message });
      }
    }

    // Stage 2: Adapter Resolution (VERIFIED → ADAPTER_RESOLVED)
    if (stagesToRun.includes('adapter_resolution')) {
      logger.info('[DiscoveryPipeline] Phase 2: Resolving Adapters...');
      try {
        const arMetrics = await processor.resolveAdapters({ limit, dryRun });
        report.adapterResolution = arMetrics;
        report.stagesRun.push('adapter_resolution');
        report.totalErrors += arMetrics.errors;
        logger.info('[DiscoveryPipeline] Phase 2 Complete.', { metrics: arMetrics });
      } catch (err: any) {
        report.totalErrors++;
        logger.error('[DiscoveryPipeline] Phase 2 Adapter Resolution encountered error', { error: err.message });
      }
    }

    // Stage 3: Enqueue Crawl (ADAPTER_RESOLVED → CRAWL_QUEUED)
    if (stagesToRun.includes('enqueue_crawl')) {
      logger.info('[DiscoveryPipeline] Phase 3: Enqueuing Crawl Candidates...');
      try {
        const eqMetrics = await processor.enqueueCrawl({ limit, dryRun });
        report.enqueueCrawl = eqMetrics;
        report.stagesRun.push('enqueue_crawl');
        report.totalErrors += eqMetrics.errors;
        logger.info('[DiscoveryPipeline] Phase 3 Complete.', { metrics: eqMetrics });
      } catch (err: any) {
        report.totalErrors++;
        logger.error('[DiscoveryPipeline] Phase 3 Crawl Enqueue encountered error', { error: err.message });
      }
    }

    // Stage 4: Trial Crawl (CRAWL_QUEUED → TRIAL_CRAWLING → SUCCESS / EMPTY / FAILED)
    if (stagesToRun.includes('trial_crawl')) {
      logger.info('[DiscoveryPipeline] Phase 4: Performing Trial Crawls...');
      try {
        const tcMetrics = await processor.trialCrawl({ limit: Math.min(limit, 20), dryRun });
        report.trialCrawl = tcMetrics;
        report.stagesRun.push('trial_crawl');
        report.totalErrors += tcMetrics.errors;
        logger.info('[DiscoveryPipeline] Phase 4 Complete.', { metrics: tcMetrics });
      } catch (err: any) {
        report.totalErrors++;
        logger.error('[DiscoveryPipeline] Phase 4 Trial Crawl encountered error', { error: err.message });
      }
    }

    // Stage 5: Promotion (SUCCESS → PROMOTED / NOT_PROMOTED)
    if (stagesToRun.includes('promotion')) {
      logger.info('[DiscoveryPipeline] Phase 5: Evaluating & Promoting Candidates to Production...');
      try {
        const pMetrics = await processor.promoteSuccessfulDiscovery({ limit, dryRun });
        report.promotion = pMetrics;
        report.stagesRun.push('promotion');
        report.totalErrors += pMetrics.errors;
        logger.info('[DiscoveryPipeline] Phase 5 Complete.', { metrics: pMetrics });
      } catch (err: any) {
        report.totalErrors++;
        logger.error('[DiscoveryPipeline] Phase 5 Promotion encountered error', { error: err.message });
      }
    }

    // Stage 6: Scoring (Refresh priority scores)
    if (stagesToRun.includes('scoring')) {
      logger.info('[DiscoveryPipeline] Phase 6: Refreshing Priority Scores...');
      try {
        const sMetrics = await scorer.scoreAll({ dryRun });
        report.scoring = sMetrics;
        report.stagesRun.push('scoring');
        logger.info('[DiscoveryPipeline] Phase 6 Complete.', { metrics: sMetrics });
      } catch (err: any) {
        logger.error('[DiscoveryPipeline] Phase 6 Scoring encountered error', { error: err.message });
      }
    }

    const endTime = new Date();
    report.endTime = endTime.toISOString();
    report.durationMs = endTime.getTime() - startTime.getTime();

    logger.info('[DiscoveryPipeline] Full Pipeline Execution Complete.', { report });

    return report;
  }
}
