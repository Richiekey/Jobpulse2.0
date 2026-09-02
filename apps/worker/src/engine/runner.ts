import pLimit from 'p-limit';
import crypto from 'node:crypto';
import type {
  CompanySourceConfig,
  ScrapeRunStatus,
} from '@jobpulse/domain';
import { SourceScheduler, SourceHealthEngine, JobLifecycleService, CrawlExecutionResult } from '@jobpulse/domain';
import { getAdapterForSource } from '@jobpulse/ats';
import { logger } from '@jobpulse/shared';
import { supabase } from '../db.js';
import { IngestionPipeline } from './pipeline.js';

export interface ScraperRunnerOptions {
  runId?: string;
  companyIdentifier?: string;
  sourceId?: string;
  concurrency?: number;
  forceUnlock?: boolean;
  workerId?: string;
  limitSources?: number;
  currentTime?: Date | string;
}

export interface SourceRunResult {
  companySourceId: string;
  companyId: string;
  sourceId: string;
  sourceIdentifier: string;
  adapterName: string;
  status: 'succeeded' | 'failed' | 'skipped';
  discovered: number;
  inserted: number;
  updated: number;
  rejected: number;
  failed: number;
  durationMs: number;
  errorMessage?: string | null;
}

const GLOBAL_SCRAPE_LOCK_KEY = 'jobpulse_scraper_global_lock';

export class ScraperRunner {
  private defaultConcurrency: number;

  constructor(options: { concurrency?: number } = {}) {
    this.defaultConcurrency = options.concurrency ?? 5;
  }

  /**
   * Acquires a distributed scrape lease lock via atomic database RPC.
   */
  private async acquireLock(workerId: string, forceUnlock = false): Promise<boolean> {
    if (forceUnlock) {
      logger.warn(`Force unlocking global scrape lock requested by ${workerId}`);
      await supabase.rpc('force_unlock_scrape', { p_lock_key: GLOBAL_SCRAPE_LOCK_KEY });
    }

    const { data: acquired, error: lockError } = await supabase.rpc(
      'try_acquire_scrape_lock',
      {
        p_lock_key: GLOBAL_SCRAPE_LOCK_KEY,
        p_holder_id: workerId,
        p_ttl_seconds: 900, // 15-minute lease with automatic TTL expiry
      }
    );

    if (lockError) {
      logger.error('Error acquiring distributed scrape lock:', { error: lockError.message });
      return false;
    }

    return Boolean(acquired);
  }

  /**
   * Releases the distributed scrape lock atomically.
   */
  private async releaseLock(workerId: string): Promise<void> {
    try {
      await supabase.rpc('release_scrape_lock', {
        p_lock_key: GLOBAL_SCRAPE_LOCK_KEY,
        p_holder_id: workerId,
      });
    } catch (err) {
      logger.warn('Failed to release distributed scrape lock:', { error: String(err) });
    }
  }

  /**
   * Executes discovery and ingestion for a single company source with complete error isolation.
   */
  public async processSource(
    companySource: CompanySourceConfig & { adapterName: string },
    runId: string
  ): Promise<SourceRunResult> {
    const startSourceTime = Date.now();
    const adapter = getAdapterForSource(companySource.adapterName);

    // If no adapter found, record failure and update source health state
    if (!adapter) {
      const durationMs = Date.now() - startSourceTime;
      const errorMsg = `No adapter registered for adapter_name: "${companySource.adapterName}"`;
      logger.error(errorMsg);

      await this.updateSourceHealth(companySource, false, errorMsg, 0);
      await this.recordSourceTelemetry(runId, companySource, 'failed', 0, 0, 0, 0, 0, errorMsg, durationMs);

      return {
        companySourceId: companySource.id,
        companyId: companySource.companyId,
        sourceId: companySource.sourceId,
        sourceIdentifier: companySource.sourceIdentifier,
        adapterName: companySource.adapterName || 'unknown',
        status: 'failed',
        discovered: 0,
        inserted: 0,
        updated: 0,
        rejected: 0,
        failed: 0,
        durationMs,
        errorMessage: errorMsg,
      };
    }

    try {
      logger.info(`Discovering jobs for ${companySource.sourceIdentifier} via ${adapter.platformSlug}...`);
      const candidates = await adapter.discover(companySource);
      const discoveredCount = candidates.length;

      logger.info(`Discovered ${discoveredCount} candidates for ${companySource.sourceIdentifier}. Ingesting...`);

      // Candidate processing with sub-concurrency (bound to 5 per source)
      const candidateLimit = pLimit(5);
      const candidateResults = await Promise.all(
        candidates.map((c) =>
          candidateLimit(() => IngestionPipeline.processCandidate(adapter, companySource, c))
        )
      );

      let inserted = 0;
      let updated = 0;
      let rejected = 0;
      let failed = 0;

      for (const res of candidateResults) {
        if (res.status === 'inserted') inserted++;
        else if (res.status === 'updated') updated++;
        else if (res.status === 'rejected') rejected++;
        else if (res.status === 'failed') failed++;
      }

      const durationMs = Date.now() - startSourceTime;

      // HARD DATA-INTEGRITY INVARIANT (P0/P1):
      // A failed, timed-out, cancelled, or incomplete crawl can NEVER cause lifecycle reconciliation or job expiration.
      const isDiscoveryComplete = (candidates as any).isComplete !== false;
      const isIngestionComplete = failed === 0;
      const isCrawlComplete = isDiscoveryComplete && isIngestionComplete;
      const crawlStatus = isCrawlComplete ? 'completed' : 'partial';

      const crawlResult: CrawlExecutionResult = {
        status: crawlStatus,
        isComplete: isCrawlComplete,
        crawledJobIds: candidateResults
          .filter((r) => r.status === 'inserted' || r.status === 'updated')
          .map((r) => r.candidateId)
          .filter(Boolean),
      };

      if (!JobLifecycleService.isEligibleForReconciliation(crawlResult)) {
        logger.warn(
          `Skipping lifecycle reconciliation for ${companySource.sourceIdentifier}: Crawl incomplete (isComplete=${isCrawlComplete}, failed=${failed}, discoveryComplete=${isDiscoveryComplete}). Active records will NOT be expired based on partial coverage.`
        );
      } else {
        try {
          const { data: reconciliationResult, error: reconcileError } = await supabase.rpc(
            'reconcile_company_source_job_lifecycle',
            {
              p_company_id: companySource.companyId,
              p_crawled_external_ids: crawlResult.crawledJobIds,
              p_scrape_time: new Date().toISOString(),
              p_consecutive_miss_threshold: JobLifecycleService.CONSECUTIVE_MISS_THRESHOLD,
              p_max_staleness_days: JobLifecycleService.MAX_STALENESS_DAYS,
            }
          );

          if (reconcileError) {
            logger.warn(`Job lifecycle reconciliation notice for ${companySource.sourceIdentifier}:`, {
              error: reconcileError.message,
            });
          } else {
            logger.info(`Job lifecycle reconciled for ${companySource.sourceIdentifier}:`, reconciliationResult);
          }
        } catch (lifecycleErr) {
          logger.warn(`Lifecycle reconciliation exception for ${companySource.sourceIdentifier}:`, {
            error: String(lifecycleErr),
          });
        }
      }

      await this.updateSourceHealth(companySource, true, null, discoveredCount);
      await this.recordSourceTelemetry(
        runId,
        companySource,
        'succeeded',
        discoveredCount,
        inserted,
        updated,
        rejected,
        failed,
        null,
        durationMs,
        adapter.parserVersion
      );

      return {
        companySourceId: companySource.id,
        companyId: companySource.companyId,
        sourceId: companySource.sourceId,
        sourceIdentifier: companySource.sourceIdentifier,
        adapterName: adapter.platformSlug,
        status: 'succeeded',
        discovered: discoveredCount,
        inserted,
        updated,
        rejected,
        failed,
        durationMs,
        errorMessage: null,
      };
    } catch (srcErr) {
      const durationMs = Date.now() - startSourceTime;
      const errorMsg = srcErr instanceof Error ? srcErr.message : String(srcErr);
      logger.error(`Failed scraping for ${companySource.sourceIdentifier}:`, { error: errorMsg });

      await this.updateSourceHealth(companySource, false, errorMsg, 0);
      await this.recordSourceTelemetry(
        runId,
        companySource,
        'failed',
        0,
        0,
        0,
        0,
        0,
        errorMsg,
        durationMs,
        adapter.parserVersion
      );

      return {
        companySourceId: companySource.id,
        companyId: companySource.companyId,
        sourceId: companySource.sourceId,
        sourceIdentifier: companySource.sourceIdentifier,
        adapterName: adapter.platformSlug,
        status: 'failed',
        discovered: 0,
        inserted: 0,
        updated: 0,
        rejected: 0,
        failed: 0,
        durationMs,
        errorMessage: errorMsg,
      };
    }
  }

  /**
   * Processes a list of eligible company sources concurrently with bounded concurrency.
   */
  public async processSources(
    eligibleSources: (CompanySourceConfig & { adapterName: string })[],
    runId: string,
    concurrency?: number
  ): Promise<SourceRunResult[]> {
    const limit = pLimit(concurrency ?? this.defaultConcurrency);
    return Promise.all(eligibleSources.map((source) => limit(() => this.processSource(source, runId))));
  }

  /**
   * Runs the complete discovery and ingestion cycle across active company sources.
   */
  public async run(options: ScraperRunnerOptions = {}): Promise<string> {
    const workerId = options.workerId || `worker_${crypto.randomBytes(6).toString('hex')}`;
    logger.info('Starting JobPulse Multi-Source Scraper Run...', { options, workerId });

    // 1. Acquire distributed lease lock
    const lockAcquired = await this.acquireLock(workerId, options.forceUnlock);
    if (!lockAcquired) {
      throw new Error('Concurrent scrape run in progress or lock held. Aborting execution.');
    }

    let runId = options.runId;

    try {
      // 2. Initialize or adopt durable scrape_runs record
      if (!runId) {
        const concurrencyScope = options.sourceId
          ? `source:${options.sourceId}`
          : options.companyIdentifier && options.companyIdentifier !== 'all'
            ? `company:${options.companyIdentifier}`
            : 'global';

        const { data: scrapeRun, error: runInitError } = await supabase
          .from('scrape_runs')
          .insert({
            started_at: new Date().toISOString(),
            status: 'running',
            concurrency_scope: concurrencyScope,
            companies_attempted: 0,
            companies_succeeded: 0,
            companies_failed: 0,
            jobs_discovered: 0,
            jobs_inserted: 0,
            jobs_updated: 0,
            jobs_rejected: 0,
            jobs_failed: 0,
            metadata: {
              worker_id: workerId,
              concurrency: options.concurrency ?? this.defaultConcurrency,
              concurrency_scope: concurrencyScope,
            },
          })
          .select('id')
          .single();

        if (runInitError || !scrapeRun) {
          throw new Error(`Failed to initialize scrape_runs: ${runInitError?.message}`);
        }
        runId = scrapeRun.id;
      } else {
        // Adopt existing pending run
        await supabase
          .from('scrape_runs')
          .update({
            status: 'running',
            started_at: new Date().toISOString(),
            metadata: { worker_id: workerId },
          })
          .eq('id', runId);
      }

      // 3. Query active company sources from database
      let query = supabase
        .from('company_sources')
        .select(`
          id,
          company_id,
          source_id,
          source_identifier,
          source_url,
          adapter_config,
          is_active,
          health_status,
          priority,
          schedule_interval_minutes,
          consecutive_failures,
          last_checked_at,
          last_success_at,
          last_failure_at,
          last_error,
          last_job_count,
          discovery_method,
          created_at,
          updated_at,
          sources (
            id,
            adapter_name,
            name
          )
        `)
        .eq('is_active', true)
        .neq('health_status', 'disabled');

      if (options.companyIdentifier) {
        query = query.eq('source_identifier', options.companyIdentifier);
      }
      if (options.sourceId) {
        query = query.eq('source_id', options.sourceId);
      }

      const { data: rawSources, error: fetchError } = await query;
      if (fetchError || !rawSources) {
        throw new Error(`Failed to load company sources: ${fetchError?.message}`);
      }

      // Map DB records to typed configs
      const allLoadedSources: (CompanySourceConfig & { adapterName: string })[] = rawSources.map((csRaw: any) => ({
        id: csRaw.id,
        companyId: csRaw.company_id,
        sourceId: csRaw.source_id,
        sourceIdentifier: csRaw.source_identifier,
        sourceUrl: csRaw.source_url,
        adapterConfig: (csRaw.adapter_config as Record<string, unknown>) || {},
        isActive: csRaw.is_active,
        healthStatus: csRaw.health_status,
        priority: csRaw.priority ?? 100,
        scheduleIntervalMinutes: csRaw.schedule_interval_minutes ?? 360,
        consecutiveFailures: csRaw.consecutive_failures || 0,
        lastCheckedAt: csRaw.last_checked_at || null,
        lastSuccessAt: csRaw.last_success_at || null,
        lastFailureAt: csRaw.last_failure_at || null,
        lastError: csRaw.last_error || null,
        lastJobCount: csRaw.last_job_count || 0,
        discoveryMethod: csRaw.discovery_method || 'manual',
        createdAt: csRaw.created_at || new Date().toISOString(),
        updatedAt: csRaw.updated_at || new Date().toISOString(),
        adapterName: csRaw.sources?.adapter_name || '',
      }));

      // Apply authoritative schedule eligibility, priority ordering, and limitSources
      const eligibleSources = SourceScheduler.filterAndOrderEligibleSources(allLoadedSources, {
        currentTime: options.currentTime,
        limitSources: options.limitSources,
        companyIdentifier: options.companyIdentifier,
        sourceId: options.sourceId,
      });

      logger.info(
        `Loaded ${rawSources.length} active sources; filtered to ${eligibleSources.length} due/eligible company sources for scraping.`
      );

      if (eligibleSources.length === 0) {
        logger.info('No company sources are currently due for scraping. Completing run cleanly.');
        await supabase
          .from('scrape_runs')
          .update({
            completed_at: new Date().toISOString(),
            status: 'completed',
            companies_attempted: 0,
            companies_succeeded: 0,
            companies_failed: 0,
            metadata: { worker_id: workerId, no_sources_due: true },
          })
          .eq('id', runId);

        return runId!;
      }

      // 4. Process each eligible company source concurrently with strict error isolation
      const sourceResults = await this.processSources(eligibleSources, runId!, options.concurrency);

      // 5. Aggregate Results deterministically
      const summary = sourceResults.reduce(
        (acc, r) => ({
          attempted: acc.attempted + 1,
          succeeded: acc.succeeded + (r.status === 'succeeded' ? 1 : 0),
          failed: acc.failed + (r.status === 'failed' ? 1 : 0),
          discovered: acc.discovered + r.discovered,
          inserted: acc.inserted + r.inserted,
          updated: acc.updated + r.updated,
          rejected: acc.rejected + r.rejected,
          failedJobs: acc.failedJobs + r.failed,
        }),
        {
          attempted: 0,
          succeeded: 0,
          failed: 0,
          discovered: 0,
          inserted: 0,
          updated: 0,
          rejected: 0,
          failedJobs: 0,
        }
      );

      const finalStatus: ScrapeRunStatus =
        summary.failed === summary.attempted && summary.attempted > 0 ? 'failed' : 'completed';

      const errorDetails = sourceResults
        .filter((r) => r.errorMessage)
        .map((r) => ({
          companySourceId: r.companySourceId,
          sourceIdentifier: r.sourceIdentifier,
          error: r.errorMessage,
        }));

      // 6. Complete scrape_runs audit record
      await supabase
        .from('scrape_runs')
        .update({
          completed_at: new Date().toISOString(),
          status: finalStatus,
          companies_attempted: summary.attempted,
          companies_succeeded: summary.succeeded,
          companies_failed: summary.failed,
          jobs_discovered: summary.discovered,
          jobs_inserted: summary.inserted,
          jobs_updated: summary.updated,
          jobs_rejected: summary.rejected,
          jobs_failed: summary.failedJobs,
          error_summary: errorDetails as any,
          metadata: {
            worker_id: workerId,
            partial_failure: summary.failed > 0,
            sources_attempted: summary.attempted,
            sources_succeeded: summary.succeeded,
            sources_failed: summary.failed,
          },
        })
        .eq('id', runId);

      logger.info('JobPulse Scraper Run Finished Successfully!', {
        runId,
        ...summary,
        finalStatus,
      });

      if (!runId) {
        throw new Error('Uninitialized run ID');
      }

      return runId;
    } catch (runErr) {
      const runErrorMsg = runErr instanceof Error ? runErr.message : String(runErr);
      logger.error('Fatal crash in scraper runner execution:', { error: runErrorMsg });

      if (runId) {
        await supabase
          .from('scrape_runs')
          .update({
            completed_at: new Date().toISOString(),
            status: 'failed',
            error_summary: [{ error: runErrorMsg, timestamp: new Date().toISOString() }] as any,
          })
          .eq('id', runId);
      }

      throw runErr;
    } finally {
      // Always release distributed lock on completion or crash
      await this.releaseLock(workerId);
    }
  }

  /**
   * Polls the durable scrape_runs queue and claims next pending job using SKIP LOCKED.
   */
  public async pollAndExecutePending(): Promise<string | null> {
    const { data: claimedRuns, error: claimError } = await supabase.rpc('claim_next_pending_scrape_run');

    if (claimError) {
      logger.error('Error claiming pending scrape run:', { error: claimError.message });
      return null;
    }

    if (!claimedRuns || claimedRuns.length === 0) {
      return null;
    }

    const claimedRun = claimedRuns[0];
    if (!claimedRun) return null;

    logger.info(`Claimed pending scrape run ${claimedRun.id} from queue. Executing...`);
    return this.run({ runId: claimedRun.id });
  }

  /**
   * Updates company source health state machine using production SourceHealthEngine.
   */
  private async updateSourceHealth(
    companySource: CompanySourceConfig,
    isSuccess: boolean,
    errorMessage: string | null,
    jobCount: number
  ): Promise<void> {
    if (isSuccess) {
      const updateData = SourceHealthEngine.getSuccessUpdate(jobCount);
      await supabase
        .from('company_sources')
        .update({
          health_status: updateData.healthStatus,
          consecutive_failures: updateData.consecutiveFailures,
          is_active: updateData.isActive,
          last_checked_at: updateData.lastCheckedAt,
          last_success_at: updateData.lastSuccessAt,
          last_job_count: updateData.lastJobCount,
          last_error: updateData.lastError,
          updated_at: new Date().toISOString(),
        })
        .eq('id', companySource.id);
    } else {
      const updateData = SourceHealthEngine.getFailureUpdate(companySource.consecutiveFailures, errorMessage);
      await supabase
        .from('company_sources')
        .update({
          health_status: updateData.healthStatus,
          consecutive_failures: updateData.consecutiveFailures,
          is_active: updateData.isActive,
          last_checked_at: updateData.lastCheckedAt,
          last_failure_at: updateData.lastFailureAt,
          last_error: updateData.lastError,
          updated_at: new Date().toISOString(),
        })
        .eq('id', companySource.id);
    }
  }

  /**
   * Records a source telemetry item in scrape_run_sources without silent error swallowing.
   */
  private async recordSourceTelemetry(
    runId: string,
    companySource: CompanySourceConfig,
    status: 'succeeded' | 'failed' | 'skipped',
    discovered: number,
    inserted: number,
    updated: number,
    rejected: number,
    failed: number,
    errorMessage: string | null,
    durationMs: number,
    parserVersion?: string
  ): Promise<void> {
    const { error: insertError } = await supabase.from('scrape_run_sources').insert({
      scrape_run_id: runId,
      company_source_id: companySource.id,
      status,
      jobs_discovered: discovered,
      jobs_inserted: inserted,
      jobs_updated: updated,
      jobs_rejected: rejected,
      jobs_failed: failed,
      error_message: errorMessage,
      metadata: {
        parser_version: parserVersion || 'unknown',
      },
      duration_ms: durationMs,
      started_at: new Date(Date.now() - durationMs).toISOString(),
      completed_at: new Date().toISOString(),
    });

    if (insertError) {
      logger.error('CRITICAL TELEMETRY FAILURE: Failed to write scrape_run_sources record', {
        runId,
        companySourceId: companySource.id,
        error: insertError.message,
      });
    }
  }
}
