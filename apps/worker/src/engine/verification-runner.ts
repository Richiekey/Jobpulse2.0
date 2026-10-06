import { TechnologyCheckerVerifier, SupabaseStateStore, InMemoryStateStore, StateStore } from '@jobpulse/technology-checker';
import { supabase } from '../db.js';
import { logger } from '@jobpulse/shared';

export class VerificationRunner {
  public async runVerification(options: { limit?: number; dryRun?: boolean } = {}) {
    logger.info(`Starting ATS verification for pending discovery registry candidates (Limit: ${options.limit || 100}, DryRun: ${!!options.dryRun})...`);
    
    const dbStore = new SupabaseStateStore(supabase);
    const store: StateStore = options.dryRun ? new InMemoryStateStore(dbStore) : dbStore;
    const verifier = new TechnologyCheckerVerifier(store);

    try {
      const metrics = await verifier.verifyPending({ limit: options.limit || 100, dryRun: options.dryRun });
      
      logger.info('Verification run completed.', {
        metrics
      });
      
      return metrics;
    } catch (err) {
      logger.error('Fatal error during ATS verification run', { error: String(err) });
      throw err;
    }
  }
}
