import { TechnologyCheckerClient } from './client.js';
import { logger } from '@jobpulse/shared';
import { SupabaseClient } from '@supabase/supabase-js';
import { CompanySourceNormalizer, CompanyNormalizer, CompanySourceConfig } from '@jobpulse/domain';
import { ATSAdapterRegistry, ATSDetector } from '@jobpulse/ats';

export interface DiscoveryOptions {
  dryRun?: boolean;
}

export interface DiscoveryMetrics {
  technologiesResolved: number;
  apiRequests: number;
  companiesFetched: number;
  atsCandidatesDetected: number;
  sourcesVerified: number;
  sourcesInserted: number;
  companiesInserted: number;
  domainsRemoved: number;
  signalsProcessed: number;
  errors: number;
}

export class TechnologyCheckerDiscovery {
  constructor(
    private readonly client: TechnologyCheckerClient,
    private readonly db: SupabaseClient
  ) {}

  /**
   * Run discovery for specific ATS technology names (e.g., 'Workable', 'Greenhouse').
   */
  public async discover(technologyNames: string[], options: DiscoveryOptions = {}): Promise<DiscoveryMetrics> {
    const metrics: DiscoveryMetrics = {
      technologiesResolved: 0,
      apiRequests: 0,
      companiesFetched: 0,
      atsCandidatesDetected: 0,
      sourcesVerified: 0,
      sourcesInserted: 0,
      companiesInserted: 0,
      domainsRemoved: 0,
      signalsProcessed: 0,
      errors: 0,
    };

    for (const techName of technologyNames) {
      try {
        const id = await this.client.getTechnologyId(techName);
        metrics.apiRequests++;
        if (!id) {
          logger.warn(`TechnologyChecker: Technology '${techName}' not found`);
          continue;
        }
        metrics.technologiesResolved++;

        await this.processTechnology(id, techName, options, metrics);
      } catch (err) {
        metrics.errors++;
        logger.error(`Error resolving technology ${techName}`, { error: String(err) });
      }
    }

    return metrics;
  }

  /**
   * Run discovery based on TechnologyChecker adoption and churn signals.
   */
  public async discoverFromSignals(options: DiscoveryOptions = {}): Promise<DiscoveryMetrics> {
    const metrics: DiscoveryMetrics = {
      technologiesResolved: 0,
      apiRequests: 0,
      companiesFetched: 0,
      atsCandidatesDetected: 0,
      sourcesVerified: 0,
      sourcesInserted: 0,
      companiesInserted: 0,
      domainsRemoved: 0,
      signalsProcessed: 0,
      errors: 0,
    };

    try {
      logger.info('Processing TechnologyChecker signals for recent ATS adoptions...');
      
      const limit = 100;
      let offset = 0;
      let hasMore = true;
      const days = 7; // look back 7 days

      // 1. Process adoptions
      while (hasMore) {
        const res = await this.client.getAdoptionSignals({ limit, offset, days });
        metrics.apiRequests++;
        metrics.signalsProcessed += res.signals.length;

        for (const signal of res.signals) {
          const techName = signal.technology.name.toLowerCase();
          
          const companyInfo = signal.company || {
            name: signal.domain,
            industry: 'Unknown',
            industry_code: 0,
            employees: 'Unknown',
            country: 'Unknown',
            company_type: 'Unknown'
          };
          
          await this.processCompany(
            { domain: signal.domain, ...companyInfo },
            signal.technology.id,
            techName,
            options,
            metrics
          );
        }

        hasMore = offset + limit < res.total;
        offset += limit;
      }

      // 2. Process churns
      logger.info('Processing TechnologyChecker signals for recent ATS churns...');
      offset = 0;
      hasMore = true;

      while (hasMore) {
        const res = await this.client.getChurnSignals({ limit, offset, days });
        metrics.apiRequests++;
        metrics.signalsProcessed += res.signals.length;

        for (const signal of res.signals) {
          const techName = signal.technology.name.toLowerCase();
          const normalizedDomain = CompanyNormalizer.extractRegistrableDomain(`https://${signal.domain}`) || signal.domain;

          if (!options.dryRun) {
            const { data: existing } = await this.db
              .from('discovery_registry')
              .select('id')
              .eq('domain', normalizedDomain)
              .eq('ats_provider', techName)
              .maybeSingle();

            if (existing) {
              await this.db
                .from('discovery_registry')
                .update({
                  discovery_status: 'FAILED',
                  verification_status: 'stale',
                  discovery_error: 'Received churn signal from TechnologyChecker'
                })
                .eq('id', existing.id);
              metrics.domainsRemoved++;
              logger.info(`Marked ${normalizedDomain} as stale for ${techName} due to churn signal`);
            }
          }
        }

        hasMore = offset + limit < res.total;
        offset += limit;
      }

    } catch (err) {
      metrics.errors++;
      logger.error('Error processing signals', { error: String(err) });
    }

    return metrics;
  }

  private async processTechnology(
    techId: number,
    techName: string,
    options: DiscoveryOptions,
    metrics: DiscoveryMetrics
  ) {
    const normalizedTech = techName.toLowerCase();
    
    // Check sync state
    const { data: syncState } = await this.db
      .from('discovery_sync_state')
      .select('*')
      .eq('ats_provider', normalizedTech)
      .maybeSingle();

    const isInitialSeed = !syncState || !syncState.last_full_sync_at;
    logger.info(`Starting sync for ${techName} (Initial: ${isInitialSeed})`);

    const limit = 100;
    let offset = 0;
    let hasMore = true;
    let syncSuccess = true;
    let syncErrorMsg = '';
    const fetchedDomains = new Set<string>();

    if (!options.dryRun) {
      await this.db.from('discovery_sync_state').upsert({
        ats_provider: normalizedTech,
        technology_checker_id: techId,
        sync_status: 'running',
        sync_error: null,
      }, { onConflict: 'ats_provider' });
    }

    while (hasMore) {
      try {
        const res = await this.client.getCompaniesByTechnology(techId, { limit, offset });
        metrics.apiRequests++;
        const companies = res.companies;
        metrics.companiesFetched += companies.length;

        for (const company of companies) {
          const domain = company.domain;
          const normalizedDomain = CompanyNormalizer.extractRegistrableDomain(`https://${domain}`) || domain;
          fetchedDomains.add(normalizedDomain);
          await this.processCompany(company, techId, techName, options, metrics);
        }

        hasMore = offset + limit < res.total;
        offset += limit;
      } catch (err) {
        metrics.errors++;
        syncSuccess = false;
        syncErrorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Error fetching companies for tech ${techName} (offset ${offset})`, { error: syncErrorMsg });
        break; 
      }
    }

    if (!options.dryRun) {
      if (syncSuccess && fetchedDomains.size > 0) {
        // Detect removed domains ONLY IF FULL SYNC COMPLETED SAFELY
        const { data: dbRecords } = await this.db
          .from('discovery_registry')
          .select('id, domain')
          .eq('ats_provider', normalizedTech);

        if (dbRecords && dbRecords.length > 0) {
          const removedIds: string[] = [];
          for (const record of dbRecords) {
            if (!fetchedDomains.has(record.domain)) {
              removedIds.push(record.id);
            }
          }

          if (removedIds.length > 0) {
            // Mark as stale/failed
            await this.db
              .from('discovery_registry')
              .update({
                discovery_status: 'FAILED',
                verification_status: 'stale',
                discovery_error: 'Domain removed from TechnologyChecker dataset in latest sync'
              })
              .in('id', removedIds);
            
            metrics.domainsRemoved += removedIds.length;
            logger.info(`Marked ${removedIds.length} domains as stale for ${techName}`);
          }
        }

        // Update sync state
        await this.db
          .from('discovery_sync_state')
          .upsert({
            ats_provider: normalizedTech,
            technology_checker_id: techId,
            last_sync_at: new Date().toISOString(),
            last_full_sync_at: new Date().toISOString(), // Safe to update because full sync succeeded
            total_companies: fetchedDomains.size,
            sync_status: 'success',
            sync_error: null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'ats_provider' });
      } else if (!syncSuccess) {
        // Abort reconciliation! Sync failed!
        logger.warn(`Aborting stale reconciliation for ${techName} due to partial sync failure.`);
        await this.db
          .from('discovery_sync_state')
          .upsert({
            ats_provider: normalizedTech,
            technology_checker_id: techId,
            sync_status: 'failed',
            sync_error: syncErrorMsg,
            updated_at: new Date().toISOString()
          }, { onConflict: 'ats_provider' });
      }
    }
  }

  private async processCompany(
    company: { domain: string; name: string; industry: string; industry_code: number; employees: string; country: string; city?: string; state?: string; founded?: number; company_type: string },
    techId: number,
    techName: string,
    options: DiscoveryOptions,
    metrics: DiscoveryMetrics
  ) {
    try {
      const domain = company.domain;
      const normalizedDomain = CompanyNormalizer.extractRegistrableDomain(`https://${domain}`) || domain;
      const normalizedTech = techName.toLowerCase();
      
      if (options.dryRun) {
        logger.info(`[Dry Run] Would persist source ${normalizedTech} for company ${company.name}`);
        return;
      }

      // Phase 2 + Phase 6: Persist into discovery registry with DISCOVERED queue state
      const { error } = await this.db
        .from('discovery_registry')
        .insert({
          domain: normalizedDomain,
          company_name: company.name,
          ats_provider: normalizedTech,
          technology_checker_id: techId,
          detection_domain: domain,
          country: company.country,
          industry: company.industry,
          employees: company.employees,
          discovery_source: 'technology-checker',
          discovery_status: 'DISCOVERED',
          verification_status: 'pending',
          first_discovered_at: new Date().toISOString()
        })
        .select('id')
        .maybeSingle();

      if (error) {
        if (error.code === '23505') {
          // Unique constraint violation (domain, ats_provider)
          // Reverifying stale mappings if necessary
          const { data: existing } = await this.db
            .from('discovery_registry')
            .select('id, verification_status')
            .eq('domain', normalizedDomain)
            .eq('ats_provider', normalizedTech)
            .maybeSingle();
            
          if (existing && existing.verification_status === 'stale') {
            await this.db
              .from('discovery_registry')
              .update({
                discovery_status: 'DISCOVERED',
                verification_status: 'pending',
                discovery_error: null,
              })
              .eq('id', existing.id);
            logger.info(`Re-queued stale discovery for ${normalizedDomain}`);
          }
        } else {
          metrics.errors++;
          logger.error(`Failed to insert discovery registry for company ${company.name}`, { error: error.message });
        }
      } else {
        metrics.companiesInserted++;
      }
    } catch (err) {
      metrics.errors++;
      logger.error(`Error processing company ${company.domain}`, { error: String(err) });
    }
  }
}
