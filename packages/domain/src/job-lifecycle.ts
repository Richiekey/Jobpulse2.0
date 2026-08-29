import { JobStatus } from './entities/job.js';

export interface JobStalenessEvaluationInput {
  jobId: string;
  externalId: string;
  lastSeenAt: string | Date;
  consecutiveMisses: number;
  currentStatus: JobStatus;
}

export interface JobStalenessEvaluationResult {
  jobId: string;
  shouldExpire: boolean;
  newStatus: JobStatus;
  consecutiveMisses: number;
  reason?: string;
}

export interface CrawlExecutionResult {
  status: 'completed' | 'failed' | 'partial' | 'timeout' | 'cancelled';
  isComplete: boolean;
  crawledJobIds: string[];
}

export class JobLifecycleService {
  /**
   * Enforces the Complete-Crawl Contract (P0/P1).
   * Verifies if a crawl execution result is eligible for lifecycle reconciliation.
   * Hard Invariant: Failed, partial, timeout, or cancelled crawls MUST NEVER trigger reconciliation.
   */
  public static isEligibleForReconciliation(crawlResult: CrawlExecutionResult): boolean {
    return crawlResult.status === 'completed' && crawlResult.isComplete === true;
  }

  /**
   * Minimum number of consecutive successful scrapes a job must be absent from
   * before transitioning from 'active' to 'expired'.
   */
  public static readonly CONSECUTIVE_MISS_THRESHOLD = 3;

  /**
   * Maximum allowed staleness window in days even if consecutive scrape threshold
   * has not triggered (e.g. low crawl frequency sources).
   */
  public static readonly MAX_STALENESS_DAYS = 30;

  /**
   * Evaluates a single job's lifecycle status following a successful scrape cycle.
   */
  public static evaluateJobStatus(
    input: JobStalenessEvaluationInput,
    scrapeCompletedAt: Date = new Date()
  ): JobStalenessEvaluationResult {
    // If already expired or removed, preserve status
    if (input.currentStatus === 'expired' || input.currentStatus === 'removed') {
      return {
        jobId: input.jobId,
        shouldExpire: false,
        newStatus: input.currentStatus,
        consecutiveMisses: input.consecutiveMisses,
      };
    }

    // Validate and sanitize timestamp edge cases (P1)
    let lastSeen: Date | null = null;
    if (input.lastSeenAt) {
      const parsed = new Date(input.lastSeenAt);
      if (!isNaN(parsed.getTime())) {
        lastSeen = parsed;
      }
    }

    // Rule 1: Exceeded consecutive miss threshold
    if (input.consecutiveMisses >= this.CONSECUTIVE_MISS_THRESHOLD) {
      return {
        jobId: input.jobId,
        shouldExpire: true,
        newStatus: 'expired',
        consecutiveMisses: input.consecutiveMisses,
        reason: `Omitted from ${input.consecutiveMisses} consecutive successful scrape cycles.`,
      };
    }

    // Rule 2: Exceeded absolute staleness window (only if a valid lastSeen timestamp exists)
    if (lastSeen) {
      const diffMs = scrapeCompletedAt.getTime() - lastSeen.getTime();
      // Handle future timestamps / clock skew safely by clamping age to 0
      const diffDays = diffMs > 0 ? diffMs / (1000 * 60 * 60 * 24) : 0;

      if (diffDays >= this.MAX_STALENESS_DAYS) {
        return {
          jobId: input.jobId,
          shouldExpire: true,
          newStatus: 'expired',
          consecutiveMisses: input.consecutiveMisses,
          reason: `Last seen ${Math.floor(diffDays)} days ago (exceeds ${this.MAX_STALENESS_DAYS} day max window).`,
        };
      }
    }

    return {
      jobId: input.jobId,
      shouldExpire: false,
      newStatus: 'active',
      consecutiveMisses: input.consecutiveMisses,
    };
  }

  /**
   * Reconciles a company source's active database jobs against newly discovered job IDs from a scrape.
   *
   * @param existingActiveJobs List of currently active jobs in database for this company source
   * @param crawledExternalIds Set of external job IDs found in the current scrape
   * @param consecutiveMissMap Map of jobId -> existing consecutive miss count
   */
  public static reconcileCrawlJobs(
    existingActiveJobs: Array<{ id: string; externalId: string; lastSeenAt: string | Date }>,
    crawledExternalIds: Set<string>,
    consecutiveMissMap: Map<string, number> = new Map(),
    scrapeCompletedAt: Date = new Date()
  ): {
    seenJobIds: string[];
    missedJobIds: string[];
    expiredJobIds: string[];
    updatedMissMap: Map<string, number>;
  } {
    const seenJobIds: string[] = [];
    const missedJobIds: string[] = [];
    const expiredJobIds: string[] = [];
    const updatedMissMap = new Map<string, number>(consecutiveMissMap);

    for (const job of existingActiveJobs) {
      if (crawledExternalIds.has(job.externalId)) {
        // Job was present in the scrape -> reset consecutive misses
        seenJobIds.push(job.id);
        updatedMissMap.set(job.id, 0);
      } else {
        // Job was missed in the scrape -> increment consecutive misses
        const currentMisses = (consecutiveMissMap.get(job.id) || 0) + 1;
        updatedMissMap.set(job.id, currentMisses);
        missedJobIds.push(job.id);

        const evaluation = this.evaluateJobStatus(
          {
            jobId: job.id,
            externalId: job.externalId,
            lastSeenAt: job.lastSeenAt,
            consecutiveMisses: currentMisses,
            currentStatus: 'active',
          },
          scrapeCompletedAt
        );

        if (evaluation.shouldExpire) {
          expiredJobIds.push(job.id);
        }
      }
    }

    return {
      seenJobIds,
      missedJobIds,
      expiredJobIds,
      updatedMissMap,
    };
  }
}
