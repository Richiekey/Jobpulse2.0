import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@jobpulse/shared';

/**
 * Phase 7: Discovery source priority scoring.
 *
 * Score range: 0–100
 *
 * High priority signals:
 *   +30  ATS verified
 *   +15  ATS probable
 *   +10  Recruiting domain verified (detection_url resolved)
 *    +5  Board identifier resolved
 *   +20  Adapter exists and ready
 *   +25  Source previously produced jobs
 *   +10  Successful crawl status
 *   +10  Recent detection (< 30 days)
 *    +5  Semi-recent detection (< 90 days)
 *   +10  Recent successful crawl (< 7 days)
 *
 * Lower priority signals:
 *   -10  ATS detected but endpoint unresolved
 *   -15  Stale detection
 *   -20  Inaccessible domain
 *   -10  Adapter unavailable
 *   -25  ATS mismatch
 */

export interface ScoringInput {
  verification_status: string | null;
  adapter_status: string | null;
  discovery_status: string;
  crawl_job_count: number | null;
  first_discovered_at: string | null;
  last_success_at: string | null;
  detection_url: string | null;
  board_identifier: string | null;
}

export function computeDiscoveryPriority(input: ScoringInput): number {
  let score = 0;

  // === High-priority signals ===

  if (input.verification_status === 'verified') {
    score += 30;
  } else if (input.verification_status === 'probable') {
    score += 15;
  }

  if (input.detection_url) {
    score += 10;
  }

  if (input.board_identifier) {
    score += 5;
  }

  if (input.adapter_status === 'ready') {
    score += 20;
  }

  if ((input.crawl_job_count ?? 0) > 0) {
    score += 25;
  }

  if (input.discovery_status === 'SUCCESS') {
    score += 10;
  }

  // Freshness: recent detection
  if (input.first_discovered_at) {
    const ageMs = Date.now() - new Date(input.first_discovered_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays <= 30) {
      score += 10;
    } else if (ageDays <= 90) {
      score += 5;
    }
  }

  // Freshness: recent success
  if (input.last_success_at) {
    const ageMs = Date.now() - new Date(input.last_success_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays <= 7) {
      score += 10;
    }
  }

  // === Lower-priority signals (penalties) ===

  if (input.verification_status === 'unresolved') {
    score -= 10;
  }

  if (input.verification_status === 'stale') {
    score -= 15;
  }

  if (input.verification_status === 'inaccessible') {
    score -= 20;
  }

  if (input.adapter_status === 'unavailable') {
    score -= 10;
  }

  if (input.verification_status === 'mismatch') {
    score -= 25;
  }

  // Clamp to 0–100
  return Math.max(0, Math.min(100, score));
}

export interface ScoringMetrics {
  totalScored: number;
  highPriority: number;   // >= 60
  mediumPriority: number; // 30–59
  lowPriority: number;    // < 30
  errors: number;
}

export class DiscoveryScorer {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Score all records in the discovery_registry in-process.
   * This mirrors the DB function but can be run without a DB migration.
   */
  public async scoreAll(options: { dryRun?: boolean } = {}): Promise<ScoringMetrics> {
    const metrics: ScoringMetrics = {
      totalScored: 0,
      highPriority: 0,
      mediumPriority: 0,
      lowPriority: 0,
      errors: 0,
    };

    const { data: records, error } = await this.db
      .from('discovery_registry')
      .select('id, verification_status, adapter_status, discovery_status, crawl_job_count, first_discovered_at, last_success_at, detection_url, board_identifier');

    if (error) {
      logger.error('Failed to fetch discovery records for scoring', { error: error.message });
      throw new Error(`DB Error: ${error.message}`);
    }

    if (!records || records.length === 0) {
      return metrics;
    }

    for (const record of records) {
      try {
        const score = computeDiscoveryPriority(record as ScoringInput);

        if (!options.dryRun) {
          await this.db
            .from('discovery_registry')
            .update({ priority_score: score })
            .eq('id', record.id);
        }

        metrics.totalScored++;
        if (score >= 60) {
          metrics.highPriority++;
        } else if (score >= 30) {
          metrics.mediumPriority++;
        } else {
          metrics.lowPriority++;
        }
      } catch (err) {
        metrics.errors++;
        logger.error(`Error scoring record ${record.id}`, { error: String(err) });
      }
    }

    return metrics;
  }

  /**
   * Use the DB-side batch scoring function (faster for large datasets).
   */
  public async refreshScoresViaDb(): Promise<number> {
    const { data, error } = await this.db.rpc('refresh_discovery_scores');

    if (error) {
      logger.error('Failed to refresh discovery scores via DB', { error: error.message });
      throw new Error(`DB Error: ${error.message}`);
    }

    return data as number;
  }
}
