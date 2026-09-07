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
  jobsDeleted: number;
  jobsProtected: number;
  payloadsDeleted: number;
  durationMs: number;
  storageMetrics?: Record<string, any>;
}

export class RetentionService {
  public static DEFAULT_JOB_RETENTION_DAYS = 30;
  public static DEFAULT_PAYLOAD_RETENTION_DAYS = 7;
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
      logger.warn('Retention cleanup skipped: Supabase client unavailable.');
      return {
        jobsDeleted: 0,
        jobsProtected: 0,
        payloadsDeleted: 0,
        durationMs: 0,
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
    let protectedApplicationLinkedCount = 0;
    let protectedAssignmentLinkedCount = 0;
    let payloadsDeleted = 0;

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
        logger.warn('Retention purge notice for jobs:', { error: jobPurgeError.message });
      } else if (jobPurgeData) {
        jobsDeleted = jobPurgeData.deleted_jobs_count || 0;
        jobsProtected = jobPurgeData.protected_jobs_count || 0;
        protectedApplicationLinkedCount = jobPurgeData.protected_application_linked_count || 0;
        protectedAssignmentLinkedCount = jobPurgeData.protected_assignment_linked_count || 0;
      }
    } catch (err) {
      logger.warn('Retention purge exception for jobs:', { error: String(err) });
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
        logger.warn('Retention purge notice for raw payloads:', { error: payloadPurgeError.message });
      } else if (payloadPurgeData) {
        payloadsDeleted = payloadPurgeData.deleted_payloads_count || 0;
      }
    } catch (err) {
      logger.warn('Retention purge exception for raw payloads:', { error: String(err) });
    }

    // 3. Fetch fresh storage metrics
    let storageMetrics: Record<string, any> | undefined;
    try {
      const { data: metricsData, error: metricsError } = await supabase.rpc(
        'get_retention_and_storage_metrics'
      );
      if (!metricsError && metricsData) {
        storageMetrics = metricsData;
      }
    } catch {
      // Non-blocking telemetry
    }

    const durationMs = Date.now() - startTime;

    // Section 8 required structured telemetry logs
    logger.info(`Expired jobs deleted: ${jobsDeleted}`, { count: jobsDeleted });
    logger.info(`Protected application-linked jobs: ${protectedApplicationLinkedCount}`, { count: protectedApplicationLinkedCount });
    logger.info(`Protected assignment-linked jobs: ${protectedAssignmentLinkedCount}`, { count: protectedAssignmentLinkedCount });
    logger.info(`Raw payloads deleted: ${payloadsDeleted}`, { count: payloadsDeleted });
    logger.info('Retention cleanup completed', {
      jobsDeleted,
      jobsProtected,
      protectedApplicationLinkedCount,
      protectedAssignmentLinkedCount,
      payloadsDeleted,
      durationMs,
      storageMetrics,
    });

    return {
      jobsDeleted,
      jobsProtected,
      payloadsDeleted,
      durationMs,
      storageMetrics,
    };
  }
}
