import { DiscoveryRunner } from './discovery-runner.js';
import { VerificationRunner } from './verification-runner.js';
import { DiscoveryQueueRunner } from './discovery-queue-runner.js';
import { logger } from '@jobpulse/shared';
import { supabase } from '../db.js';

export class FullSyncRunner {
  public async runFullSync(options: { dryRun?: boolean, limit?: number } = {}) {
    logger.info('Starting Full TechnologyChecker Synchronization...');

    const discoveryRunner = new DiscoveryRunner();
    const verificationRunner = new VerificationRunner();
    const queueRunner = new DiscoveryQueueRunner();

    // 1. Discovery
    const discoveryMetrics = await discoveryRunner.runDiscovery({ dryRun: options.dryRun });
    
    // 2. Verification
    const verificationMetrics = await verificationRunner.runVerification({ limit: options.limit });

    // 3. Queue Processing (Adapters & Trial Crawls) & Scoring
    const queueMetrics = await queueRunner.runQueue({ limit: options.limit });

    // 4. Observability Report
    this.printSyncReport({
      discovery: discoveryMetrics || {},
      verification: verificationMetrics || {},
      queue: queueMetrics || {}
    });

    // 5. Funnel Report
    await this.printAtsFunnel();
  }

  private printSyncReport(metrics: any) {
    logger.info('==================================================');
    logger.info('TECHNOLOGY CHECKER SYNC OBSERVABILITY REPORT');
    logger.info('==================================================');
    
    // Discovery
    logger.info(`Technologies Processed:   ${metrics.discovery.technologiesResolved || 0}`);
    logger.info(`Companies Discovered:     ${metrics.discovery.companiesFetched || 0}`);
    logger.info(`New Companies:            ${metrics.discovery.companiesInserted || 0}`);
    logger.info(`Existing Companies:       ${(metrics.discovery.companiesFetched || 0) - (metrics.discovery.companiesInserted || 0)}`);
    logger.info(`Duplicates/Skipped:       ${metrics.discovery.domainsRemoved || 0} (Removed/Stale)`);
    logger.info(`API Credits Consumed:     ${Math.ceil((metrics.discovery.companiesFetched || 0) / 100)}`);
    logger.info(`API Errors:               ${metrics.discovery.errors || 0}`);
    logger.info(`Pagination Failures:      ${metrics.discovery.errors || 0}`);

    // Verification
    logger.info(`Verification Attempts:    ${metrics.verification.processed || 0}`);
    logger.info(`Verified:                 ${metrics.verification.verified || 0}`);
    logger.info(`Probable:                 ${metrics.verification.probable || 0}`);
    logger.info(`Mismatches:               ${metrics.verification.mismatch || 0}`);
    logger.info(`Unresolved:               ${metrics.verification.unresolved || 0}`);

    // Queue / Adapters
    logger.info(`Adapters Resolved:        ${metrics.queue.adaptersResolved || 0}`);
    logger.info(`Crawl Candidates Created: ${metrics.queue.crawlQueued || 0}`);
    
    logger.info('==================================================');
  }

  public async printAtsFunnel() {
    const { data, error } = await supabase.rpc('get_ats_observability_funnel');
    
    if (error) {
      logger.error('Failed to get ATS observability funnel', { error: error.message });
      return;
    }

    if (!data || data.length === 0) {
      logger.info('No ATS funnel data available.');
      return;
    }

    logger.info('==================================================');
    logger.info('PER-ATS OBSERVABILITY FUNNEL');
    logger.info('==================================================');

    for (const row of data) {
      logger.info(`${row.technology.toUpperCase()}`);
      logger.info(`  → discovered:      ${row.discovered}`);
      logger.info(`  → verified:        ${row.verified}`);
      logger.info(`  → adapter-ready:   ${row.adapter_ready}`);
      logger.info(`  → crawl attempted: ${row.crawl_attempted}`);
      logger.info(`  → jobs discovered: ${row.jobs_discovered}`);
      logger.info(`  → jobs accepted:   ${row.jobs_accepted}`);
      logger.info(`  → jobs rejected:   ${row.jobs_rejected}`);
      logger.info(`  → jobs inserted:   ${row.jobs_inserted}`);
      logger.info(`  → jobs updated:    ${row.jobs_updated}`);
      logger.info('--------------------------------------------------');
    }
  }
}
