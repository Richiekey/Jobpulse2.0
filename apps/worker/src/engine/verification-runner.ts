import { TechnologyCheckerVerifier } from '@jobpulse/technology-checker';
import { supabase } from '../db.js';
import { logger } from '@jobpulse/shared';

export class VerificationRunner {
  public async runVerification(options: { limit?: number } = {}) {
    logger.info(`Starting ATS verification for pending discovery registry candidates (Limit: ${options.limit || 100})...`);
    
    const verifier = new TechnologyCheckerVerifier(supabase);

    try {
      const metrics = await verifier.verifyPending(options.limit || 100);
      
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
