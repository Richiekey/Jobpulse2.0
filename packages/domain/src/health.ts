import type { HealthStatus } from './entities/source.js';

export interface SourceHealthTransitionResult {
  healthStatus: HealthStatus;
  isActive: boolean;
}

export interface SourceHealthSuccessUpdate {
  healthStatus: 'healthy';
  consecutiveFailures: 0;
  isActive: true;
  lastCheckedAt: string;
  lastSuccessAt: string;
  lastJobCount: number;
  lastError: null;
}

export interface SourceHealthFailureUpdate {
  healthStatus: HealthStatus;
  consecutiveFailures: number;
  isActive: boolean;
  lastCheckedAt: string;
  lastFailureAt: string;
  lastError: string | null;
}

export class SourceHealthEngine {
  /**
   * Health state transition thresholds:
   * 0 failures      -> healthy  (is_active: true)
   * 1-2 failures    -> degraded (is_active: true)
   * 3-4 failures    -> failing  (is_active: true)
   * 5+ failures     -> disabled (is_active: false)
   */
  public static calculateNextHealth(consecutiveFailures: number): SourceHealthTransitionResult {
    const failures = Math.max(0, consecutiveFailures || 0);

    if (failures === 0) {
      return { healthStatus: 'healthy', isActive: true };
    } else if (failures >= 5) {
      return { healthStatus: 'disabled', isActive: false };
    } else if (failures >= 3) {
      return { healthStatus: 'failing', isActive: true };
    } else {
      return { healthStatus: 'degraded', isActive: true };
    }
  }

  /**
   * Computes the database update payload for a successful scrape run.
   */
  public static getSuccessUpdate(
    discoveredJobCount: number,
    currentTime: Date | string = new Date()
  ): SourceHealthSuccessUpdate {
    const nowIso = typeof currentTime === 'string' ? new Date(currentTime).toISOString() : currentTime.toISOString();
    return {
      healthStatus: 'healthy',
      consecutiveFailures: 0,
      isActive: true,
      lastCheckedAt: nowIso,
      lastSuccessAt: nowIso,
      lastJobCount: discoveredJobCount,
      lastError: null,
    };
  }

  /**
   * Computes the database update payload for a failed scrape run.
   */
  public static getFailureUpdate(
    currentConsecutiveFailures: number,
    errorMessage: string | null,
    currentTime: Date | string = new Date()
  ): SourceHealthFailureUpdate {
    const nowIso = typeof currentTime === 'string' ? new Date(currentTime).toISOString() : currentTime.toISOString();
    const newConsecutive = (currentConsecutiveFailures || 0) + 1;
    const nextState = this.calculateNextHealth(newConsecutive);

    return {
      healthStatus: nextState.healthStatus,
      consecutiveFailures: newConsecutive,
      isActive: nextState.isActive,
      lastCheckedAt: nowIso,
      lastFailureAt: nowIso,
      lastError: errorMessage,
    };
  }
}
