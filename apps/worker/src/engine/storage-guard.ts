import { supabase } from '../db.js';
import { logger } from '@jobpulse/shared';
import { RetentionService } from './retention.js';

export class StorageGuard {
  public static WARNING_MB = 400;
  public static AGGRESSIVE_MB = 425;
  public static EMERGENCY_MB = 450;
  public static HARD_LIMIT_MB = 475;

  private static async getDatabaseSizeMB(): Promise<number> {
    const { data: metricsData, error } = await supabase.rpc('get_retention_and_storage_metrics');
    if (error) {
      throw new Error(`Failed to read database storage metrics: ${error.message}`);
    }

    const bytes = metricsData?.storage?.database_size_bytes;
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) {
      throw new Error('Storage metrics returned no valid database_size_bytes value');
    }

    return bytes / (1024 * 1024);
  }

  public static async executePreScrapeGuard(): Promise<void> {
    let dbSizeMB = await this.getDatabaseSizeMB();

    if (dbSizeMB > this.EMERGENCY_MB) {
      logger.warn(
        `Emergency cleanup triggered: Database size ${dbSizeMB.toFixed(2)}MB exceeds ${this.EMERGENCY_MB}MB threshold.`
      );
      const cleanup = await RetentionService.executeRetentionCleanup({
        jobRetentionDays: 7,
        payloadRetentionDays: 1,
        maxBatches: 20,
      });

      if (cleanup.status === 'failed' || cleanup.status === 'partial_failure') {
        throw new Error(
          `Storage emergency cleanup did not complete successfully: ${cleanup.errors.join('; ')}`
        );
      }

      dbSizeMB = await this.getDatabaseSizeMB();
    } else if (dbSizeMB > this.AGGRESSIVE_MB) {
      logger.warn(
        `Aggressive cleanup triggered: Database size ${dbSizeMB.toFixed(2)}MB exceeds ${this.AGGRESSIVE_MB}MB threshold.`
      );
      const cleanup = await RetentionService.executeRetentionCleanup({ maxBatches: 20 });

      if (cleanup.status === 'failed' || cleanup.status === 'partial_failure') {
        throw new Error(
          `Storage aggressive cleanup did not complete successfully: ${cleanup.errors.join('; ')}`
        );
      }

      dbSizeMB = await this.getDatabaseSizeMB();
    } else if (dbSizeMB > this.WARNING_MB) {
      logger.warn(
        `Storage warning: Database size ${dbSizeMB.toFixed(2)}MB exceeds ${this.WARNING_MB}MB warning threshold.`
      );
    }

    if (dbSizeMB > this.HARD_LIMIT_MB) {
      throw new Error(
        `Storage circuit breaker triggered: Database size ${dbSizeMB.toFixed(2)}MB exceeds hard limit of ${this.HARD_LIMIT_MB}MB despite cleanup.`
      );
    }
  }

  public static async executePostScrapeGuard(): Promise<void> {
    const dbSizeMB = await this.getDatabaseSizeMB();

    if (dbSizeMB > this.WARNING_MB) {
      logger.info(
        `Post-scrape storage check: Database size is ${dbSizeMB.toFixed(2)}MB (above ${this.WARNING_MB}MB warning). Executing normal cleanup.`
      );
      const cleanup = await RetentionService.executeRetentionCleanup();

      if (cleanup.status !== 'success') {
        logger.error('Post-scrape retention cleanup did not complete successfully', {
          status: cleanup.status,
          errors: cleanup.errors,
        });
      }
    }
  }
}
