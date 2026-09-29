import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '../db.js';
import { logger } from '@jobpulse/shared';

export interface RetentionCleanupOptions {
  jobRetentionDays?: number;
  payloadRetentionDays?: number;
  jobBatchSize?: number;
  payloadBatchSize?: number;
  maxBatches?: number;
  supabaseClient?: SupabaseClient | any;
}

export interface RetentionCleanupResult {
  status: 'success' | 'partial_failure' | 'failed';
  jobsDeleted: number;
  jobsProtected: number;
  orphansDeleted: number;
  payloadsDeleted: number;
  durationMs: number;
  errors: string[];
  storageMetrics?: Record<string, any>;
}

export class RetentionService {
  public static DEFAULT_JOB_RETENTION_DAYS = 14;
  public static DEFAULT_PAYLOAD_RETENTION_DAYS = 1;
  public static DEFAULT_JOB_BATCH_SIZE = 500;
  public static DEFAULT_PAYLOAD_BATCH_SIZE = 1000;
  public static DEFAULT_MAX_BATCHES = 10;

  /**
   * Executes database-side batched retention cleanup for expired jobs and staging raw payloads.
   * Strictly preserves jobs linked to user applications or active assignments.
   */
  public static async executeRetentionCleanup(
    options: RetentionCleanupOptions = {}
  ): Promise<RetentionCleanupResult> {
    const startTime = Date.now();
    const jobRetentionDays = options.jobRetentionDays ?? this.DEFAULT_JOB_RETENTION_DAYS;
    const payloadRetentionDays = options.payloadRetentionDays ?? this.DEFAULT_PAYLOAD_RETENTION_DAYS;
    const jobBatchSize = options.jobBatchSize ?? this.DEFAULT_JOB_BATCH_SIZE;
    const payloadBatchSize = options.payloadBatchSize ?? this.DEFAULT_PAYLOAD_BATCH_SIZE;
    const maxBatches = options.maxBatches ?? this.DEFAULT_MAX_BATCHES;
    const supabase = options.supabaseClient || defaultSupabase;

    if (!supabase) {
      const error = 'Retention cleanup skipped: Supabase client unavailable.';
      logger.error(error);
      return {
        status: 'failed',
        jobsDeleted: 0,
        jobsProtected: 0,
        orphansDeleted: 0,
        payloadsDeleted: 0,
        durationMs: 0,
        errors: [error],
      };
    }

    logger.info('Retention cleanup started', {
      jobRetentionDays,
      payloadRetentionDays,
      jobBatchSize,
      payloadBatchSize,
      maxBatches,
    });

    let jobsDeleted = 0;
    let jobsProtected = 0;
    let orphansDeleted = 0;
    let protectedApplicationLinkedCount = 0;
    let protectedAssignmentLinkedCount = 0;
    let payloadsDeleted = 0;
    const errors: string[] = [];

    // 1. Purge stale jobs (Application-aware)
    try {
      const { data: jobPurgeData, error: jobPurgeError } = await supabase.rpc(
        'purge_stale_job_records',
        {
          p_batch_size: jobBatchSize,
          p_max_batches: maxBatches,
          p_retention_days: jobRetentionDays,
        }
      );

      if (jobPurgeError) {
        const message = `stale jobs purge failed: ${jobPurgeError.message}`;
        errors.push(message);
        logger.error(message);
      } else if (jobPurgeData) {
        jobsDeleted = jobPurgeData.deleted_jobs_count || 0;
        jobsProtected = jobPurgeData.protected_jobs_count || 0;
        protectedApplicationLinkedCount = jobPurgeData.protected_application_linked_count || 0;
        protectedAssignmentLinkedCount = jobPurgeData.protected_assignment_linked_count || 0;
      }
    } catch (err) {
      const message = `stale jobs purge exception: ${String(err)}`;
      errors.push(message);
      logger.error(message);
    }

    // 1.5 Purge old orphaned jobs only; never delete a recent/active orphan.
    try {
      const { data: orphanPurgeData, error: orphanPurgeError } = await supabase.rpc(
        'purge_orphaned_jobs',
        {
          p_batch_size: jobBatchSize,
          p_max_batches: maxBatches,
          p_retention_days: jobRetentionDays,
        }
      );

      if (orphanPurgeError) {
        const message = `orphan jobs purge failed: ${orphanPurgeError.message}`;
        errors.push(message);
        logger.error(message);
      } else if (orphanPurgeData) {
        orphansDeleted = orphanPurgeData.deleted_orphans_count || 0;
      }
    } catch (err) {
      const message = `orphan jobs purge exception: ${String(err)}`;
      errors.push(message);
      logger.error(message);
    }

    // 2. Purge stale raw payloads
    try {
      const { data: payloadPurgeData, error: payloadPurgeError } = await supabase.rpc(
        'purge_stale_raw_payloads',
        {
          p_batch_size: payloadBatchSize,
          p_max_batches: maxBatches,
          p_retention_days: payloadRetentionDays,
        }
      );

      if (payloadPurgeError) {
        const message = `raw payload purge failed: ${payloadPurgeError.message}`;
        errors.push(message);
        logger.error(message);
      } else if (payloadPurgeData) {
        payloadsDeleted = payloadPurgeData.deleted_payloads_count || 0;
      }
    } catch (err) {
      const message = `raw payload purge exception: ${String(err)}`;
      errors.push(message);
      logger.error(message);
    }

    // 3. Fetch fresh storage metrics
    let storageMetrics: Record<string, any> | undefined;
    try {
      const { data: metricsData, error: metricsError } = await supabase.rpc(
        'get_retention_and_storage_metrics'
      );
      if (metricsError) {
        const message = `retention metrics failed: ${metricsError.message}`;
        errors.push(message);
        logger.error(message);
      } else if (metricsData) {
        storageMetrics = metricsData;
      }
    } catch (err) {
      const message = `retention metrics exception: ${String(err)}`;
      errors.push(message);
      logger.error(message);
    }

    const durationMs = Date.now() - startTime;
    const status: RetentionCleanupResult['status'] =
      errors.length === 0
        ? 'success'
        : jobsDeleted + orphansDeleted + payloadsDeleted > 0
          ? 'partial_failure'
          : 'failed';

    logger.info(`Expired jobs deleted: ${jobsDeleted}`, { count: jobsDeleted });
    logger.info(`Orphaned jobs deleted: ${orphansDeleted}`, { count: orphansDeleted });
    logger.info(`Protected application-linked jobs: ${protectedApplicationLinkedCount}`, {
      count: protectedApplicationLinkedCount,
    });
    logger.info(`Protected assignment-linked jobs: ${protectedAssignmentLinkedCount}`, {
      count: protectedAssignmentLinkedCount,
    });
    logger.info(`Raw payloads deleted: ${payloadsDeleted}`, { count: payloadsDeleted });
    logger.info('Retention cleanup completed', {
      status,
      jobsDeleted,
      jobsProtected,
      orphansDeleted,
      protectedApplicationLinkedCount,
      protectedAssignmentLinkedCount,
      payloadsDeleted,
      durationMs,
      errors,
      storageMetrics,
    });

    return {
      status,
      jobsDeleted,
      jobsProtected,
      orphansDeleted,
      payloadsDeleted,
      durationMs,
      errors,
      storageMetrics,
    };
  }
}
