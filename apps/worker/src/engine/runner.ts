import pLimit from 'p-limit';
import type {
  CompanySourceConfig,
  ScrapeRunStatus,
} from '@jobpulse/domain';
import { getAdapterForSource } from '@jobpulse/ats';
import { logger } from '@jobpulse/shared';
import { supabase } from '../db.js';
import { IngestionPipeline } from './pipeline.js';

export interface ScraperRunnerOptions {
  companyIdentifier?: string;
  sourceId?: string;
  concurrency?: number;
  forceUnlock?: boolean;
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

export class ScraperRunner {
  private defaultConcurrency: number;

  constructor(options: { concurrency?: number } = {}) {
    this.defaultConcurrency = options.concurrency ?? 5;
  }

  /**
   * Acquires a distributed scrape lock to prevent overlapping runs.
   */
  private async acquireLock(forceUnlock = false): Promise<boolean> {
    if (forceUnlock) return true;

    // Check if there is an active running scrape_run started within the last 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: activeRuns } = await supabase
      .from('scrape_runs')
      .select('id, started_at')
      .eq('status', 'running')
      .gte('started_at', fifteenMinutesAgo)
      .limit(1);

    if (activeRuns && activeRuns.length > 0) {
      logger.warn(`Another scrape run is currently active (${activeRuns[0]?.id}). Lock not acquired.`);
      return false;
    }

    return true;
  }

  /**
   * Runs the complete discovery and ingestion cycle across active company sources.
   */
  public async run(options: ScraperRunnerOptions = {}): Promise<string> {
    logger.info('Starting JobPulse Scraper Run...', { options });

    // 1. Acquire distributed lock
    const lockAcquired = await this.acquireLock(options.forceUnlock);
    if (!lockAcquired) {
      throw new Error('Concurrent scrape run in progress. Aborting to avoid race conditions.');
    }

    // 2. Initialize durable scrape_runs record
    const { data: scrapeRun, error: runInitError } = await supabase
      .from('scrape_runs')
      .insert({
        started_at: new Date().toISOString(),
        status: 'running',
        companies_attempted: 0,
        companies_succeeded: 0,
        companies_failed: 0,
        jobs_discovered: 0,
        jobs_inserted: 0,
        jobs_updated: 0,
        jobs_rejected: 0,
        jobs_failed: 0,
      })
      .select('id')
      .single();

    if (runInitError || !scrapeRun) {
      throw new Error(`Failed to initialize scrape_runs: ${runInitError?.message}`);
    }

    const runId = scrapeRun.id;

    try {
      // 3. Query active company sources
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
          consecutive_failures,
          sources (
            id,
            adapter_name,
            name
          )
        `)
        .eq('is_active', true);

      if (options.companyIdentifier) {
        query = query.eq('source_identifier', options.companyIdentifier);
      }
      if (options.sourceId) {
        query = query.eq('source_id', options.sourceId);
      }

      const { data: companySources, error: fetchError } = await query;
      if (fetchError || !companySources) {
        throw new Error(`Failed to load company sources: ${fetchError?.message}`);
      }

      logger.info(`Loaded ${companySources.length} active company sources for scraping.`);

      const limit = pLimit(options.concurrency ?? this.defaultConcurrency);

      // 4. Process each company source concurrently with immutable result collection
      const sourceResults: SourceRunResult[] = await Promise.all(
        companySources.map((csRaw: any) =>
          limit(async (): Promise<SourceRunResult> => {
            const startSourceTime = Date.now();
            const sourceInfo = csRaw.sources;
            const adapter = getAdapterForSource(sourceInfo?.adapter_name || '');

            const companySource: CompanySourceConfig = {
              id: csRaw.id,
              companyId: csRaw.company_id,
              sourceId: csRaw.source_id,
              sourceIdentifier: csRaw.source_identifier,
              sourceUrl: csRaw.source_url,
              adapterConfig: (csRaw.adapter_config as Record<string, unknown>) || {},
              isActive: csRaw.is_active,
              healthStatus: csRaw.health_status,
              consecutiveFailures: csRaw.consecutive_failures || 0,
            };

            // If no adapter found, record telemetry and return failure result
            if (!adapter) {
              const durationMs = Date.now() - startSourceTime;
              const errorMsg = `No adapter registered for adapter_name: ${sourceInfo?.adapter_name}`;
              logger.error(errorMsg);

              // Update source health
              await this.updateSourceHealth(companySource, false, errorMsg);

              // Record scrape_run_sources telemetry
              await this.recordSourceTelemetry(runId, companySource, 'failed', 0, 0, 0, 0, 0, errorMsg, durationMs);

              return {
                companySourceId: companySource.id,
                companyId: companySource.companyId,
                sourceId: companySource.sourceId,
                sourceIdentifier: companySource.sourceIdentifier,
                adapterName: sourceInfo?.adapter_name || 'unknown',
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

              // Candidate processing with sub-concurrency
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

              // Update source health state machine to healthy
              await this.updateSourceHealth(companySource, true, null);

              // Record complete source telemetry
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

              // Update source health state machine with degradation
              await this.updateSourceHealth(companySource, false, errorMsg);

              // Record complete source telemetry
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
          })
        )
      );

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
        summary.failed === 0 ? 'succeeded' : summary.succeeded > 0 ? 'partially_failed' : 'failed';

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
          error_summary: errorDetails.length > 0 ? (errorDetails as any) : null,
        })
        .eq('id', runId);

      logger.info('JobPulse Scraper Run Finished Successfully!', {
        runId,
        ...summary,
        finalStatus,
      });

      return runId;
    } catch (runErr) {
      const runErrorMsg = runErr instanceof Error ? runErr.message : String(runErr);
      logger.error('Fatal crash in scraper runner execution:', { error: runErrorMsg });

      await supabase
        .from('scrape_runs')
        .update({
          completed_at: new Date().toISOString(),
          status: 'failed',
          error_summary: [{ error: runErrorMsg, timestamp: new Date().toISOString() }] as any,
        })
        .eq('id', runId);

      throw runErr;
    }
  }

  /**
   * Updates company source health state machine based on success / failure thresholds.
   */
  private async updateSourceHealth(
    companySource: CompanySourceConfig,
    isSuccess: boolean,
    errorMessage: string | null
  ): Promise<void> {
    const nowIso = new Date().toISOString();

    if (isSuccess) {
      await supabase
        .from('company_sources')
        .update({
          health_status: 'healthy',
          consecutive_failures: 0,
          last_success_at: nowIso,
          last_error: null,
          updated_at: nowIso,
        })
        .eq('id', companySource.id);
    } else {
      const newConsecutive = (companySource.consecutiveFailures || 0) + 1;
      let newHealth: 'degraded' | 'failing' | 'disabled' = 'degraded';

      if (newConsecutive >= 5) {
        newHealth = 'disabled';
      } else if (newConsecutive >= 3) {
        newHealth = 'failing';
      }

      await supabase
        .from('company_sources')
        .update({
          health_status: newHealth,
          consecutive_failures: newConsecutive,
          is_active: newHealth !== 'disabled',
          last_failure_at: nowIso,
          last_error: errorMessage,
          updated_at: nowIso,
        })
        .eq('id', companySource.id);
    }
  }

  /**
   * Records a source telemetry item in scrape_run_sources.
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
    try {
      await supabase.from('scrape_run_sources').insert({
        scrape_run_id: runId,
        source_id: companySource.sourceId,
        company_id: companySource.companyId,
        status,
        jobs_discovered: discovered,
        jobs_inserted: inserted,
        jobs_updated: updated,
        jobs_rejected: rejected,
        jobs_failed: failed,
        error_message: errorMessage,
        metadata: {
          duration_ms: durationMs,
          parser_version: parserVersion || 'unknown',
        },
        started_at: new Date(Date.now() - durationMs).toISOString(),
        completed_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.debug('Failed to insert scrape_run_sources telemetry record', { error: String(err) });
    }
  }
}
