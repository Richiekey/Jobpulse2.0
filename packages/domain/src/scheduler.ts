import type { CompanySourceConfig } from './entities/source.js';

export interface SourceScheduleFilterOptions {
  currentTime?: Date | string;
  limitSources?: number;
  companyIdentifier?: string;
  sourceId?: string;
  forceDue?: boolean;
}

export class SourceScheduler {
  /**
   * Default schedule interval if missing or invalid (6 hours / 360 minutes).
   */
  public static readonly DEFAULT_INTERVAL_MINUTES = 360;

  /**
   * Determines if a company source is due for scraping.
   *
   * A source is due when:
   * 1. lastCheckedAt is null / undefined (never checked), OR
   * 2. currentTime >= lastCheckedAt + scheduleIntervalMinutes
   */
  public static isSourceDue(
    source: Pick<CompanySourceConfig, 'lastCheckedAt' | 'scheduleIntervalMinutes'>,
    currentTime: Date | string = new Date()
  ): boolean {
    if (!source.lastCheckedAt) {
      return true; // Never checked -> DUE
    }

    const lastCheckedTime = new Date(source.lastCheckedAt).getTime();
    if (isNaN(lastCheckedTime)) {
      return true; // Invalid timestamp -> DUE
    }

    const currentMs = typeof currentTime === 'string' ? new Date(currentTime).getTime() : currentTime.getTime();
    const intervalMinutes =
      typeof source.scheduleIntervalMinutes === 'number' && source.scheduleIntervalMinutes > 0
        ? source.scheduleIntervalMinutes
        : this.DEFAULT_INTERVAL_MINUTES;

    const intervalMs = intervalMinutes * 60 * 1000;
    const dueTime = lastCheckedTime + intervalMs;

    return currentMs >= dueTime;
  }

  /**
   * Filters and orders company sources according to the authoritative lifecycle:
   *
   * ALL ACTIVE SOURCES
   *         ↓
   * HEALTH ELIGIBILITY (health_status != 'disabled')
   *         ↓
   * SCHEDULE ELIGIBILITY (isSourceDue == true)
   *         ↓
   * PRIORITY ORDERING (priority ASC)
   *         ↓
   * LAST-CHECKED ORDERING (last_checked_at ASC NULLS FIRST)
   *         ↓
   * limitSources
   */
  public static filterAndOrderEligibleSources<T extends CompanySourceConfig>(
    sources: T[],
    options: SourceScheduleFilterOptions = {}
  ): T[] {
    const now = options.currentTime ? new Date(options.currentTime) : new Date();

    // 1. Filter: Active, Health-eligible, and Schedule-eligible (or forced for specific filters)
    let eligible = sources.filter((source) => {
      if (!source.isActive) return false;
      if (source.healthStatus === 'disabled') return false;

      // Filter by specific company identifier or sourceId if requested
      if (options.companyIdentifier && source.sourceIdentifier !== options.companyIdentifier) {
        return false;
      }
      if (options.sourceId && source.sourceId !== options.sourceId) {
        return false;
      }

      // If targeted filter is provided (e.g. manual trigger of single company), skip schedule interval check
      if (options.forceDue || options.companyIdentifier) {
        return true;
      }

      return this.isSourceDue(source, now);
    });

    // 2. Sort deterministically:
    // Priority ASC -> last_checked_at ASC NULLS FIRST -> id ASC
    eligible.sort((a, b) => {
      const priorityA = a.priority ?? 100;
      const priorityB = b.priority ?? 100;

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // If priorities match, sort by lastCheckedAt ASC NULLS FIRST
      if (!a.lastCheckedAt && b.lastCheckedAt) return -1;
      if (a.lastCheckedAt && !b.lastCheckedAt) return 1;
      if (a.lastCheckedAt && b.lastCheckedAt) {
        const timeA = new Date(a.lastCheckedAt).getTime();
        const timeB = new Date(b.lastCheckedAt).getTime();
        if (timeA !== timeB) return timeA - timeB;
      }

      // Deterministic tie-breaker
      return a.id.localeCompare(b.id);
    });

    // 3. Apply limitSources AFTER due filtering and priority ordering
    if (typeof options.limitSources === 'number' && options.limitSources > 0) {
      eligible = eligible.slice(0, options.limitSources);
    }

    return eligible;
  }
}
