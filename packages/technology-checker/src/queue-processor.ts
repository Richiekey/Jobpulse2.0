import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@jobpulse/shared';
import { ATSAdapterRegistry } from '@jobpulse/ats';
import type { CompanySourceConfig } from '@jobpulse/domain';

/**
 * Discovery queue states:
 *   DISCOVERED → VERIFYING → VERIFIED → ADAPTER_RESOLVED → CRAWL_QUEUED → CRAWLED → SUCCESS / EMPTY / FAILED
 *
 * This processor handles:
 *   VERIFIED      → ADAPTER_RESOLVED   (Phase 5 adapter mapping)
 *   ADAPTER_RESOLVED → CRAWL_QUEUED    (promote to production pipeline)
 *   CRAWL_QUEUED  → SUCCESS/EMPTY/FAILED (trial crawl results)
 *
 * Discovery failures (inaccessible, mismatch, unresolved) stay as FAILED and are
 * never mixed with job parsing failures in the ingestion pipeline.
 */

export interface QueueProcessorMetrics {
  adapterResolved: number;
  adapterUnavailable: number;
  crawlQueued: number;
  crawlSuccess: number;
  crawlEmpty: number;
  crawlFailed: number;
  errors: number;
}

export class DiscoveryQueueProcessor {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Process VERIFIED records: resolve adapters and transition to ADAPTER_RESOLVED.
   */
  public async resolveAdapters(limit: number = 100): Promise<QueueProcessorMetrics> {
    const metrics: QueueProcessorMetrics = {
      adapterResolved: 0,
      adapterUnavailable: 0,
      crawlQueued: 0,
      crawlSuccess: 0,
      crawlEmpty: 0,
      crawlFailed: 0,
      errors: 0,
    };

    const { data: records, error } = await this.db
      .from('discovery_registry')
      .select('*')
      .eq('discovery_status', 'VERIFIED')
      .limit(limit);

    if (error) {
      logger.error('Failed to fetch VERIFIED records for adapter resolution', { error: error.message });
      throw new Error(`DB Error: ${error.message}`);
    }

    if (!records || records.length === 0) {
      return metrics;
    }

    for (const record of records) {
      try {
        const atsSlug = record.ats_provider;
        const hasAdapter = ATSAdapterRegistry.hasAdapter(atsSlug);

        if (hasAdapter) {
          await this.db
            .from('discovery_registry')
            .update({
              discovery_status: 'ADAPTER_RESOLVED',
              adapter: atsSlug,
              adapter_status: 'ready',
            })
            .eq('id', record.id);
          metrics.adapterResolved++;
        } else {
          // Adapter not available — record it but don't silently discard
          await this.db
            .from('discovery_registry')
            .update({
              adapter: atsSlug,
              adapter_status: 'unavailable',
              discovery_error: `No adapter implementation for ${atsSlug}`,
            })
            .eq('id', record.id);
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
  public async enqueueCrawl(limit: number = 50): Promise<QueueProcessorMetrics> {
    const metrics: QueueProcessorMetrics = {
      adapterResolved: 0,
      adapterUnavailable: 0,
      crawlQueued: 0,
      crawlSuccess: 0,
      crawlEmpty: 0,
      crawlFailed: 0,
      errors: 0,
    };

    const { data: records, error } = await this.db
      .from('discovery_registry')
      .select('*')
      .eq('discovery_status', 'ADAPTER_RESOLVED')
      .eq('adapter_status', 'ready')
      .limit(limit);

    if (error) {
      logger.error('Failed to fetch ADAPTER_RESOLVED records', { error: error.message });
      throw new Error(`DB Error: ${error.message}`);
    }

    if (!records || records.length === 0) {
      return metrics;
    }

    for (const record of records) {
      try {
        if (!record.board_identifier) {
          await this.db
            .from('discovery_registry')
            .update({
              discovery_status: 'FAILED',
              discovery_error: 'No board_identifier resolved during verification',
            })
            .eq('id', record.id);
          metrics.crawlFailed++;
          continue;
        }

        // Look up or create the company
        const companyId = await this.resolveCompanyId(record);
        if (!companyId) {
          await this.db
            .from('discovery_registry')
            .update({
              discovery_status: 'FAILED',
              discovery_error: 'Failed to resolve or create company record',
            })
            .eq('id', record.id);
          metrics.crawlFailed++;
          continue;
        }

        // Look up ats_platform ID
        const { data: platform } = await this.db
          .from('ats_platforms')
          .select('id')
          .eq('slug', record.ats_provider)
          .maybeSingle();

        if (!platform) {
          await this.db
            .from('discovery_registry')
            .update({
              discovery_status: 'FAILED',
              discovery_error: `ATS platform '${record.ats_provider}' not found in ats_platforms table`,
            })
            .eq('id', record.id);
          metrics.crawlFailed++;
          continue;
        }

        // Check if source already exists
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
              source_url: record.detection_url,
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
              await this.db
                .from('discovery_registry')
                .update({
                  discovery_status: 'FAILED',
                  discovery_error: `Failed to create company_source: ${insertError.message}`,
                })
                .eq('id', record.id);
              metrics.crawlFailed++;
              continue;
            }
          } else {
            sourceId = inserted?.id;
          }
        }

        // Link discovery record to the production source and mark CRAWL_QUEUED
        await this.db
          .from('discovery_registry')
          .update({
            discovery_status: 'CRAWL_QUEUED',
            company_id: companyId,
            company_source_id: sourceId!,
            discovery_error: null,
          })
          .eq('id', record.id);

        metrics.crawlQueued++;
      } catch (err) {
        metrics.errors++;
        logger.error(`Error enqueuing crawl for record ${record.id}`, { error: String(err) });
        await this.db
          .from('discovery_registry')
          .update({
            discovery_status: 'FAILED',
            discovery_error: `Enqueue error: ${err instanceof Error ? err.message : String(err)}`,
          })
          .eq('id', record.id);
      }
    }

    return metrics;
  }

  /**
   * Process CRAWL_QUEUED records: perform a trial crawl to determine SUCCESS/EMPTY/FAILED.
   * This uses the adapter's discoverJobs method directly — NOT the full scraper pipeline.
   */
  public async trialCrawl(limit: number = 20): Promise<QueueProcessorMetrics> {
    const metrics: QueueProcessorMetrics = {
      adapterResolved: 0,
      adapterUnavailable: 0,
      crawlQueued: 0,
      crawlSuccess: 0,
      crawlEmpty: 0,
      crawlFailed: 0,
      errors: 0,
    };

    const { data: records, error } = await this.db
      .from('discovery_registry')
      .select('*')
      .eq('discovery_status', 'CRAWL_QUEUED')
      .limit(limit);

    if (error) {
      logger.error('Failed to fetch CRAWL_QUEUED records', { error: error.message });
      throw new Error(`DB Error: ${error.message}`);
    }

    if (!records || records.length === 0) {
      return metrics;
    }

    for (const record of records) {
      try {
        const adapter = ATSAdapterRegistry.getAdapter(record.ats_provider);

        const sourceConfig: CompanySourceConfig = {
          sourceUrl: record.detection_url || `https://${record.domain}`,
          sourceIdentifier: record.board_identifier,
          adapterConfig: {},
        } as CompanySourceConfig;

        const jobs = await adapter.discover(sourceConfig);
        const jobCount = jobs.length;

        if (jobCount > 0) {
          await this.db
            .from('discovery_registry')
            .update({
              discovery_status: 'SUCCESS',
              crawl_job_count: jobCount,
              last_crawled_at: new Date().toISOString(),
              last_success_at: new Date().toISOString(),
              discovery_error: null,
            })
            .eq('id', record.id);
          metrics.crawlSuccess++;
        } else {
          await this.db
            .from('discovery_registry')
            .update({
              discovery_status: 'EMPTY',
              crawl_job_count: 0,
              last_crawled_at: new Date().toISOString(),
              discovery_error: null,
            })
            .eq('id', record.id);
          metrics.crawlEmpty++;
        }
      } catch (err) {
        metrics.errors++;
        // This is a DISCOVERY failure, not a job parsing failure
        await this.db
          .from('discovery_registry')
          .update({
            discovery_status: 'FAILED',
            last_crawled_at: new Date().toISOString(),
            last_failure_at: new Date().toISOString(),
            discovery_error: `Trial crawl error: ${err instanceof Error ? err.message : String(err)}`,
          })
          .eq('id', record.id);
        metrics.crawlFailed++;
        logger.error(`Trial crawl failed for record ${record.id}`, { error: String(err) });
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
