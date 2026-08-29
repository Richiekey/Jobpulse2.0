import pLimit from 'p-limit';
import type { CompanySourceConfig } from '@jobpulse/domain';
import { getAdapterForSource } from '@jobpulse/ats';
import { logger } from '@jobpulse/shared';
import { supabase } from '../db.js';
import { IngestionPipeline } from './pipeline.js';

export interface ScrapeOptions {
  companyIdentifier?: string;
  sourceId?: string;
  concurrency?: number;
}

export class ScraperRunner {
  private readonly defaultConcurrency: number;

  constructor(options: { concurrency?: number } = {}) {
    this.defaultConcurrency = options.concurrency ?? 5;
  }

  public async run(options: ScrapeOptions = {}): Promise<string> {
    const startTime = new Date().toISOString();
    logger.info('Starting JobPulse Scraper Run...', { options });

    // 1. Create scrape_runs record
    const { data: scrapeRun, error: createRunError } = await supabase
      .from('scrape_runs')
      .insert({
        started_at: startTime,
        status: 'running',
        metadata: options as any,
      })
      .select('id')
      .single();

    if (createRunError || !scrapeRun) {
      throw new Error(`Failed to initialize scrape_runs: ${createRunError?.message}`);
    }

    const runId = scrapeRun.id;
    let attempted = 0;
    let succeeded = 0;
    let failed = 0;
    let totalDiscovered = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalRejected = 0;
    let totalFailed = 0;
    const errorSummary: Array<{ companySourceId?: string; error: string; timestamp: string }> = [];

    try {
      // 2. Query active company sources
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
      attempted = companySources.length;

      const limit = pLimit(options.concurrency ?? this.defaultConcurrency);

      // 3. Process each company source concurrently with bounded limits
      await Promise.all(
        companySources.map((csRaw: any) =>
          limit(async () => {
            const startSourceTime = Date.now();
            const sourceInfo = csRaw.sources;
            const adapter = getAdapterForSource(sourceInfo.adapter_name);

            if (!adapter) {
              logger.error(`No adapter found for source: ${sourceInfo.adapter_name}`);
              failed++;
              return;
            }

            const companySource: CompanySourceConfig = {
              id: csRaw.id,
              companyId: csRaw.company_id,
              sourceId: csRaw.source_id,
              sourceIdentifier: csRaw.source_identifier,
              sourceUrl: csRaw.source_url,
              adapterConfig: (csRaw.adapter_config as Record<string, unknown>) || {},
              isActive: csRaw.is_active,
              healthStatus: csRaw.health_status,
              consecutiveFailures: csRaw.consecutive_failures,
            };

            let discoveredCount = 0;
            let insertedCount = 0;
            let updatedCount = 0;
            let sourceStatus: 'succeeded' | 'failed' = 'succeeded';
            let sourceErrorMessage: string | null = null;

            try {
              logger.info(`Discovering jobs for ${companySource.sourceIdentifier} via ${adapter.platformSlug}...`);
              const candidates = await adapter.discover(companySource);
              discoveredCount = candidates.length;
              totalDiscovered += discoveredCount;

              logger.info(`Discovered ${candidates.length} candidates for ${companySource.sourceIdentifier}. Ingesting...`);

              // Candidate processing with sub-concurrency
              const candidateLimit = pLimit(3);
              const results = await Promise.all(
                candidates.map((c) =>
                  candidateLimit(() => IngestionPipeline.processCandidate(adapter, companySource, c))
                )
              );

              for (const res of results) {
                if (res.status === 'inserted') {
                  insertedCount++;
                  totalInserted++;
                } else if (res.status === 'updated') {
                  updatedCount++;
                  totalUpdated++;
                } else if (res.status === 'rejected') {
                  totalRejected++;
                } else if (res.status === 'failed') {
                  totalFailed++;
                }
              }

              // Update company source health to healthy
              await supabase
                .from('company_sources')
                .update({
                  health_status: 'healthy',
                  consecutive_failures: 0,
                  last_success_at: new Date().toISOString(),
                  last_error: null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', companySource.id);

              succeeded++;
            } catch (err) {
              failed++;
              sourceStatus = 'failed';
              sourceErrorMessage = err instanceof Error ? err.message : String(err);

              logger.error(`Failed to scrape company source ${companySource.sourceIdentifier}`, {
                error: sourceErrorMessage,
              });

              errorSummary.push({
                companySourceId: companySource.id,
                error: sourceErrorMessage,
                timestamp: new Date().toISOString(),
              });

              // Increment consecutive failure count
              await supabase
                .from('company_sources')
                .update({
                  health_status: companySource.consecutiveFailures >= 3 ? 'failing' : 'degraded',
                  consecutive_failures: companySource.consecutiveFailures + 1,
                  last_failure_at: new Date().toISOString(),
                  last_error: sourceErrorMessage,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', companySource.id);
            } finally {
              const durationMs = Date.now() - startSourceTime;
              // Log scrape_run_sources telemetry
              await supabase.from('scrape_run_sources').insert({
                scrape_run_id: runId,
                company_source_id: companySource.id,
                status: sourceStatus,
                jobs_discovered: discoveredCount,
                jobs_inserted: insertedCount,
                jobs_updated: updatedCount,
                error_message: sourceErrorMessage,
                duration_ms: durationMs,
              });
            }
          })
        )
      );

      // 4. Update scrape_runs final stats
      const completedTime = new Date().toISOString();
      await supabase
        .from('scrape_runs')
        .update({
          completed_at: completedTime,
          status: 'completed',
          companies_attempted: attempted,
          companies_succeeded: succeeded,
          companies_failed: failed,
          jobs_discovered: totalDiscovered,
          jobs_inserted: totalInserted,
          jobs_updated: totalUpdated,
          jobs_rejected: totalRejected,
          jobs_failed: totalFailed,
          error_summary: errorSummary as any,
        })
        .eq('id', runId);

      logger.info('JobPulse Scraper Run Finished Successfully!', {
        runId,
        attempted,
        succeeded,
        failed,
        totalDiscovered,
        totalInserted,
        totalUpdated,
        totalRejected,
      });

      return runId;
    } catch (runErr) {
      const errorMsg = runErr instanceof Error ? runErr.message : String(runErr);
      await supabase
        .from('scrape_runs')
        .update({
          completed_at: new Date().toISOString(),
          status: 'failed',
          companies_attempted: attempted,
          companies_succeeded: succeeded,
          companies_failed: failed,
          jobs_discovered: totalDiscovered,
          jobs_inserted: totalInserted,
          jobs_updated: totalUpdated,
          jobs_rejected: totalRejected,
          jobs_failed: totalFailed,
          error_summary: [{ error: errorMsg, timestamp: new Date().toISOString() }] as any,
        })
        .eq('id', runId);

      logger.error('JobPulse Scraper Run Encountered Fatal Error', { error: errorMsg });
      throw runErr;
    }
  }
}
