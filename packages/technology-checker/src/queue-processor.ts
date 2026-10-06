import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@jobpulse/shared';
import { ATSAdapterRegistry } from '@jobpulse/ats';
import type { CompanySourceConfig } from '@jobpulse/domain';

/**
 * Discovery queue states:
 *   DISCOVERED → VERIFYING → VERIFIED → ADAPTER_RESOLVED → CRAWL_QUEUED → TRIAL_CRAWLING → SUCCESS / EMPTY / FAILED → PROMOTED
 *
 * This processor handles:
 *   VERIFIED      → ADAPTER_RESOLVED   (Phase 5 adapter mapping)
 *   ADAPTER_RESOLVED → CRAWL_QUEUED    (Queuing)
 *   CRAWL_QUEUED  → TRIAL_CRAWLING → SUCCESS/EMPTY/FAILED (trial crawl results with eligibility validation)
 *   SUCCESS       → PROMOTED (Promotion to production pipeline)
 *
 * Discovery failures (inaccessible, mismatch, unresolved) stay as FAILED and are
 * never mixed with job parsing failures in the ingestion pipeline.
 */

import { JobEligibilityPolicy, type JobCandidateData } from '@jobpulse/domain';
import { StateStore, DiscoveryRecord } from './state-store.js';

export interface QueueProcessorMetrics {
  adapterResolved: number;
  adapterUnavailable: number;
  crawlQueued: number;
  crawlSuccess: number;
  crawlEmpty: number;
  crawlFailed: number;
  promoted: number;
  errors: number;
}

export class DiscoveryQueueProcessor {
  constructor(
    private readonly store: StateStore,
    private readonly db: SupabaseClient
  ) {}

  /**
   * Process VERIFIED records: resolve adapters and transition to ADAPTER_RESOLVED.
   */
  public async resolveAdapters(options: { limit?: number; dryRun?: boolean } = {}): Promise<QueueProcessorMetrics> {
    const limit = options.limit || 100;
    const metrics: QueueProcessorMetrics = {
      adapterResolved: 0,
      adapterUnavailable: 0,
      crawlQueued: 0,
      crawlSuccess: 0,
      crawlEmpty: 0,
      crawlFailed: 0,
      promoted: 0,
      errors: 0,
    };

    let records: DiscoveryRecord[];
    try {
      records = await this.store.queryByStatus('VERIFIED', {}, limit);
    } catch (error: any) {
      logger.error('Failed to fetch VERIFIED records for adapter resolution', { error: error.message });
      throw new Error(`Store Error: ${error.message}`);
    }

    if (!records || records.length === 0) {
      return metrics;
    }

    for (const record of records) {
      try {
        const atsSlug = record.ats_provider;
        const hasAdapter = ATSAdapterRegistry.hasAdapter(atsSlug);

        if (hasAdapter) {
          await this.store.updateRecord(record.id, {
            discovery_status: 'ADAPTER_RESOLVED',
            adapter: atsSlug,
            adapter_status: 'ready',
          });
          metrics.adapterResolved++;
        } else {
          // Adapter not available — record it but don't silently discard
          await this.store.updateRecord(record.id, {
            adapter: atsSlug,
            adapter_status: 'unavailable',
            discovery_error: `No adapter implementation for ${atsSlug}`,
          });
          metrics.adapterUnavailable++;
          // NOTE: discovery_status stays VERIFIED — it can be re-processed when adapter is implemented
        }
      } catch (err) {
        metrics.errors++;
        logger.error(`Error resolving adapter for record ${record.id}`, { error: String(err) });
      }
    }

    return metrics;
  }

  /**
   * Process ADAPTER_RESOLVED records: promote to production company_sources and mark CRAWL_QUEUED.
   */
  public async enqueueCrawl(options: { limit?: number; dryRun?: boolean } = {}): Promise<QueueProcessorMetrics> {
    const limit = options.limit || 50;
    const metrics: QueueProcessorMetrics = {
      adapterResolved: 0,
      adapterUnavailable: 0,
      crawlQueued: 0,
      crawlSuccess: 0,
      crawlEmpty: 0,
      crawlFailed: 0,
      promoted: 0,
      errors: 0,
    };

    let records: DiscoveryRecord[];
    try {
      records = await this.store.queryByStatus('ADAPTER_RESOLVED', { adapter_status: 'ready' }, limit);
    } catch (error: any) {
      logger.error('Failed to fetch ADAPTER_RESOLVED records', { error: error.message });
      throw new Error(`Store Error: ${error.message}`);
    }

    if (!records || records.length === 0) {
      return metrics;
    }

    for (const record of records) {
      try {
        if (!record.board_identifier) {
          await this.store.updateRecord(record.id, {
            discovery_status: 'FAILED',
            discovery_error: 'No board_identifier resolved during verification',
          });
          metrics.crawlFailed++;
          continue;
        }

        // Only mark CRAWL_QUEUED here. Do NOT promote to production company_sources yet!
        await this.store.updateRecord(record.id, {
          discovery_status: 'CRAWL_QUEUED',
          discovery_error: null,
        });

        metrics.crawlQueued++;
      } catch (err) {
        metrics.errors++;
        logger.error(`Error enqueuing crawl for record ${record.id}`, { error: String(err) });
        await this.store.updateRecord(record.id, {
          discovery_status: 'FAILED',
          discovery_error: `Enqueue error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    return metrics;
  }

  /**
   * Process CRAWL_QUEUED records: perform a trial crawl to determine SUCCESS/EMPTY/FAILED.
   * This uses the adapter's discoverJobs method directly, and validates results using real eligibility checks.
   */
  public async trialCrawl(options: { limit?: number; dryRun?: boolean } = {}): Promise<QueueProcessorMetrics> {
    const limit = options.limit || 20;
    const metrics: QueueProcessorMetrics = {
      adapterResolved: 0,
      adapterUnavailable: 0,
      crawlQueued: 0,
      crawlSuccess: 0,
      crawlEmpty: 0,
      crawlFailed: 0,
      promoted: 0,
      errors: 0,
    };

    let records: DiscoveryRecord[];
    try {
      records = await this.store.queryByStatus('CRAWL_QUEUED', {}, limit);
    } catch (error: any) {
      logger.error('Failed to fetch CRAWL_QUEUED records', { error: error.message });
      throw new Error(`Store Error: ${error.message}`);
    }

    if (!records || records.length === 0) {
      return metrics;
    }

    for (const record of records) {
      try {
        // Transition to TRIAL_CRAWLING
        await this.store.updateRecord(record.id, { discovery_status: 'TRIAL_CRAWLING' });

        const adapter = ATSAdapterRegistry.getAdapter(record.ats_provider);

        const sourceConfig: CompanySourceConfig = {
          sourceUrl: record.detection_url || `https://${record.domain}`,
          sourceIdentifier: record.board_identifier,
          adapterConfig: {},
        } as CompanySourceConfig;

        const candidates = await adapter.discover(sourceConfig);
        const rawJobCount = candidates.length;

        // Sample up to 10 candidates for trial crawl (don't fetch entire board)
        const trialSample = candidates.slice(0, 10);
        let eligibleCount = 0;
        let rejectedCount = 0;

        for (const candidate of trialSample) {
          try {
            // Full pipeline: fetch → parse → normalize → eligibility
            const rawPayload = await adapter.fetch(candidate);
            const rawJob = await adapter.parse(rawPayload);
            const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

            // Construct eligibility candidate
            const eligibilityInput: JobCandidateData = {
              title: normalized.canonicalTitle || normalized.displayTitle,
              displayTitle: normalized.displayTitle,
              canonicalTitle: normalized.canonicalTitle,
              description: normalized.description,
              locations: normalized.locations,
              workplaceType: normalized.workplaceType,
              postedAt: normalized.postedAt,
              skills: normalized.skills,
              sourceMetadata: normalized.sourceMetadata as Record<string, any>,
            };

            const result = JobEligibilityPolicy.evaluate(eligibilityInput);
            if (result.eligible) {
              eligibleCount++;
            } else {
              rejectedCount++;
            }
          } catch (fetchErr) {
            // Individual job fetch failure — count as rejected but don't fail the whole trial
            rejectedCount++;
            logger.warn(`Trial crawl: failed to fetch/parse candidate ${candidate.externalJobId}`, { error: String(fetchErr) });
          }
        }

        if (eligibleCount > 0) {
          await this.store.updateRecord(record.id, {
            discovery_status: 'SUCCESS',
            crawl_job_count: rawJobCount,
            crawl_eligible_job_count: eligibleCount,
            crawl_rejected_job_count: rejectedCount,
            last_crawled_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            discovery_error: null,
          });
          metrics.crawlSuccess++;
        } else {
          await this.store.updateRecord(record.id, {
            discovery_status: 'EMPTY',
            crawl_job_count: rawJobCount,
            crawl_eligible_job_count: 0,
            crawl_rejected_job_count: rejectedCount,
            last_crawled_at: new Date().toISOString(),
            discovery_error: 'Trial crawl produced 0 eligible jobs',
          });
          metrics.crawlEmpty++;
        }
      } catch (err) {
        metrics.errors++;
        metrics.crawlFailed++;
        logger.error(`Trial crawl failed for record ${record.id}`, { error: String(err) });
        
        await this.store.updateRecord(record.id, {
          discovery_status: 'FAILED',
          last_crawled_at: new Date().toISOString(),
          last_failure_at: new Date().toISOString(),
          discovery_error: `Trial crawl error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    return metrics;
  }

  /**
   * Process SUCCESS records: safely promote them to the production `company_sources` pipeline.
   * If a source already exists, it is preserved and linked. Only actually creates a new production
   * record after the trial crawl passes.
   */
  public async promoteSuccessfulDiscovery(options: { limit?: number; dryRun?: boolean } = {}): Promise<QueueProcessorMetrics> {
    const limit = options.limit || 20;
    const metrics: QueueProcessorMetrics = {
      adapterResolved: 0,
      adapterUnavailable: 0,
      crawlQueued: 0,
      crawlSuccess: 0,
      crawlEmpty: 0,
      crawlFailed: 0,
      promoted: 0,
      errors: 0,
    };

    let records: DiscoveryRecord[];
    try {
      records = await this.store.queryByStatus('SUCCESS', { promotion_status: null }, limit);
    } catch (error: any) {
      logger.error('Failed to fetch SUCCESS records for promotion', { error: error.message });
      throw new Error(`Store Error: ${error.message}`);
    }

    if (!records || records.length === 0) {
      return metrics;
    }

    for (const record of records) {
      try {
        if (!record.board_identifier) {
          logger.error(`Cannot promote ${record.id} without board_identifier`);
          continue;
        }

        if (options.dryRun) {
          logger.info(`[DryRun] Would promote ${record.domain} to production company_sources.`);
          await this.store.updateRecord(record.id, { promotion_status: 'promoted', promoted_at: new Date().toISOString() });
          metrics.promoted++;
          continue;
        }

        // Look up or create the company
        const companyId = await this.resolveCompanyId(record);
        if (!companyId) {
          await this.store.updateRecord(record.id, {
            promotion_status: 'not_promoted',
            discovery_error: 'Failed to resolve or create company record during promotion',
          });
          metrics.errors++;
          continue;
        }

        // Look up ats_platform ID
        const { data: platform } = await this.db
          .from('ats_platforms')
          .select('id')
          .eq('slug', record.ats_provider)
          .maybeSingle();

        if (!platform) {
          await this.store.updateRecord(record.id, {
            promotion_status: 'not_promoted',
            discovery_error: `ATS platform '${record.ats_provider}' not found in ats_platforms table`,
          });
          metrics.errors++;
          continue;
        }

        // Check if source already exists (preserve existing sources!)
        const { data: existingSource } = await this.db
          .from('company_sources')
          .select('id')
          .eq('company_id', companyId)
          .eq('source_id', platform.id)
          .eq('source_identifier', record.board_identifier)
          .maybeSingle();

        let sourceId: string;
        if (existingSource) {
          sourceId = existingSource.id;
        } else {
          // Create the company_source in the production pipeline
          const { data: inserted, error: insertError } = await this.db
            .from('company_sources')
            .insert({
              company_id: companyId,
              source_id: platform.id,
              source_identifier: record.board_identifier,
              source_url: record.detection_url || record.domain,
              discovery_method: 'technology-checker',
              is_active: true,
              priority: 50,
              schedule_interval_minutes: 1440,
              health_status: 'healthy',
            })
            .select('id')
            .maybeSingle();

          if (insertError) {
            if (insertError.code === '23505') {
              // Already exists via constraint — look it up
              const { data: found } = await this.db
                .from('company_sources')
                .select('id')
                .eq('company_id', companyId)
                .eq('source_id', platform.id)
                .eq('source_identifier', record.board_identifier)
                .maybeSingle();
              sourceId = found?.id;
            } else {
              await this.store.updateRecord(record.id, {
                promotion_status: 'not_promoted',
                discovery_error: `Failed to create company_source: ${insertError.message}`,
              });
              metrics.errors++;
              continue;
            }
          } else {
            sourceId = inserted?.id;
          }
        }

        // Link discovery record to the production source and mark PROMOTED
        await this.store.updateRecord(record.id, {
          promotion_status: 'promoted',
          promoted_at: new Date().toISOString(),
          company_id: companyId,
          company_source_id: sourceId!,
          discovery_error: null,
        });

        metrics.promoted++;
      } catch (err) {
        metrics.errors++;
        logger.error(`Error promoting record ${record.id}`, { error: String(err) });
        await this.store.updateRecord(record.id, {
          promotion_status: 'not_promoted',
          discovery_error: `Promotion error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    return metrics;
  }

  /**
   * Resolve a company ID from a discovery registry record.
   * Either finds an existing company by domain or creates one.
   */
  private async resolveCompanyId(record: any): Promise<string | null> {
    // Try to find existing company by domain
    const { data: existing } = await this.db
      .from('companies')
      .select('id')
      .eq('domain', record.domain)
      .maybeSingle();

    if (existing) return existing.id;

    // Create a new company
    const { data: inserted, error } = await this.db
      .from('companies')
      .insert({
        name: record.company_name,
        normalized_name: record.company_name.toLowerCase(),
        slug: record.domain.replace(/\./g, '-'),
        domain: record.domain,
        industry: record.industry,
        company_size: record.employees,
        status: 'active',
        verified: false,
        metadata: {
          source: 'technology-checker',
          country: record.country,
        },
      })
      .select('id')
      .maybeSingle();

    if (error) {
      // Handle race condition where another process inserted concurrently
      if (error.code === '23505') {
        const { data: found } = await this.db
          .from('companies')
          .select('id')
          .eq('domain', record.domain)
          .maybeSingle();
        return found?.id || null;
      }
      logger.error(`Failed to create company for ${record.domain}`, { error: error.message });
      return null;
    }

    return inserted?.id || null;
  }
}
