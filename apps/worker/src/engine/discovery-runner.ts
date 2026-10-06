import { TechnologyCheckerDiscovery, TechnologyCheckerClient, SupabaseStateStore, InMemoryStateStore, StateStore } from '@jobpulse/technology-checker';
import { supabase } from '../db.js';
import { logger } from '@jobpulse/shared';

export class DiscoveryRunner {
  public async runDiscovery(options: { dryRun?: boolean; store?: StateStore } = {}) {
    logger.info(`Starting ATS discovery via TechnologyChecker... (Dry Run: ${!!options.dryRun})`);
    
    // Check if API key is present
    const apiKey = process.env.TECHNOLOGY_CHECKER_API_KEY;
    if (!apiKey) {
      logger.error('TECHNOLOGY_CHECKER_API_KEY is not set in the environment');
      return;
    }

    const client = new TechnologyCheckerClient(apiKey);
    const dbStore = new SupabaseStateStore(supabase);
    const store: StateStore = options.store || (options.dryRun ? new InMemoryStateStore(dbStore) : dbStore);
    const discovery = new TechnologyCheckerDiscovery(client, store, supabase);

    // Initial technology names required by the Phase 1 specification
    const atsNames = [
      'Workable', 
      'Greenhouse', 
      'Lever', 
      'Ashby', 
      'SmartRecruiters', 
      'Workday', 
      'Teamtailor', 
      'Recruitee', 
      'iCIMS', 
      'Jobvite', 
      'BambooHR'
    ];

    try {
      const metrics = await discovery.discover(atsNames, { dryRun: options.dryRun });
      
      logger.info('Discovery completed successfully.', {
        metrics
      });
      
      return metrics;
    } catch (err) {
      logger.error('Fatal error during ATS discovery run', { error: String(err) });
      throw err;
    }
  }

  public async runSignals(options: { dryRun?: boolean; store?: StateStore } = {}) {
    logger.info(`Starting ATS discovery via TechnologyChecker Signals... (Dry Run: ${!!options.dryRun})`);
    
    // Check if API key is present
    const apiKey = process.env.TECHNOLOGY_CHECKER_API_KEY;
    if (!apiKey) {
      logger.error('TECHNOLOGY_CHECKER_API_KEY is not set in the environment');
      return;
    }

    const client = new TechnologyCheckerClient(apiKey);
    const dbStore = new SupabaseStateStore(supabase);
    const store: StateStore = options.store || (options.dryRun ? new InMemoryStateStore(dbStore) : dbStore);
    const discovery = new TechnologyCheckerDiscovery(client, store, supabase);

    try {
      const metrics = await discovery.discoverFromSignals({ dryRun: options.dryRun });
      
      logger.info('Signals processing completed successfully.', {
        metrics
      });
      
      return metrics;
    } catch (err) {
      logger.error('Fatal error during signals processing run', { error: String(err) });
      throw err;
    }
  }
}
