import {
  DiscoveryOrchestrator,
  formatMetricsSummary,
  DiscoveryRunMetrics,
  DiscoveryProvider,
  HackerNewsHiringProvider,
  AtsDirectoryProvider,
  DefaultDiscoveryEnricher,
  DefaultDiscoveryScorer,
} from '@jobpulse/discovery-engine';
import { SupabaseStateStore, InMemoryStateStore, StateStore } from '@jobpulse/shared-state';
import { supabase } from '../db.js';
import { logger } from '@jobpulse/shared';

export interface DiscoveryEngineRunnerOptions {
  provider?: string;
  limit?: number;
  dryRun?: boolean;
  verbose?: boolean;
  store?: StateStore;
}

export class DiscoveryEngineRunner {
  public async run(options: DiscoveryEngineRunnerOptions = {}): Promise<DiscoveryRunMetrics> {
    const isDryRun = Boolean(options.dryRun);
    logger.info(`Starting Discovery Engine V1 run... (Dry Run: ${isDryRun})`, {
      provider: options.provider || 'all',
      limit: options.limit || 'unlimited',
    });

    const dbStore = new SupabaseStateStore(supabase);
    const store = options.store || (isDryRun ? new InMemoryStateStore(dbStore) : dbStore);

    const providers = this.resolveProviders(options.provider);
    const enricher = new DefaultDiscoveryEnricher();
    const scorer = new DefaultDiscoveryScorer();
    const orchestrator = new DiscoveryOrchestrator(providers, store, enricher, scorer);

    try {
      const metrics = await orchestrator.run({
        provider: options.provider,
        limit: options.limit,
        dryRun: isDryRun,
        verbose: options.verbose,
      });

      const report = formatMetricsSummary(metrics, isDryRun);
      console.log('\n' + report + '\n');
      logger.info('Discovery Engine V1 run completed successfully.', { metrics });

      return metrics;
    } catch (err) {
      logger.error('Fatal error during Discovery Engine V1 run:', { error: String(err) });
      throw err;
    }
  }

  private resolveProviders(providerName?: string): DiscoveryProvider[] {
    const all: DiscoveryProvider[] = [
      new HackerNewsHiringProvider(),
      new AtsDirectoryProvider(),
    ];

    if (providerName) {
      const filtered = all.filter((p) => p.name.toLowerCase() === providerName.toLowerCase());
      if (filtered.length > 0) return filtered;
    }
    return all;
  }
}
