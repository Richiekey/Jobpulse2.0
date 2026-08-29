import type { Database } from './database.types.js';

export type ApplicationStatus = Database['public']['Enums']['application_status_enum'];

export interface ApplicationRecord {
  id: string;
  userId: string;
  jobId?: string | null;
  companyName: string;
  jobTitle: string;
  status: ApplicationStatus;
  notes?: string | null;
  appliedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export class ApplicationLifecycleService {
  /**
   * Statuses that are considered later-stage or terminal in the hiring pipeline.
   * Automatic outbound apply dispatch MUST NEVER regress these statuses back to 'applied'.
   */
  private static readonly NON_REGRESSIBLE_ON_DISPATCH: ReadonlySet<ApplicationStatus> = new Set([
    'screening',
    'interview',
    'offer',
    'rejected',
    'withdrawn',
    'archived',
  ]);

  /**
   * Computes the deterministic application status when a user triggers outbound application dispatch.
   *
   * Rules:
   * - No prior application: transition to 'applied' (new record).
   * - Status is 'saved': advance to 'applied'.
   * - Status is 'applied': idempotent noop, remain 'applied'.
   * - Status is 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn' | 'archived':
   *   HARD INVARIANT: preserve existing status, never regress.
   *
   * @param currentStatus The existing application status (if any)
   * @returns The target application status to persist
   */
  public static getNextStatusOnDispatch(currentStatus?: ApplicationStatus | null): ApplicationStatus {
    if (!currentStatus || currentStatus === 'saved') {
      return 'applied';
    }

    if (currentStatus === 'applied') {
      return 'applied';
    }

    if (this.NON_REGRESSIBLE_ON_DISPATCH.has(currentStatus)) {
      return currentStatus;
    }

    return 'applied';
  }

  /**
   * Determines whether an application record can be mutated by an automatic dispatch event.
   * Returns true if status or timestamps should update, false if it's already past 'applied' and untouched.
   */
  public static shouldUpdateStatusOnDispatch(currentStatus?: ApplicationStatus | null): boolean {
    if (!currentStatus) return true;
    if (currentStatus === 'saved') return true;
    return false;
  }

  /**
   * Validates if an explicit user-initiated manual state transition is permissible.
   */
  public static isValidManualTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
    if (from === to) return true;

    // Define valid forward transitions in the lifecycle
    const validTransitions: Record<ApplicationStatus, ApplicationStatus[]> = {
      saved: ['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'archived'],
      applied: ['screening', 'interview', 'offer', 'rejected', 'withdrawn', 'archived'],
      screening: ['interview', 'offer', 'rejected', 'withdrawn', 'archived'],
      interview: ['screening', 'offer', 'rejected', 'withdrawn', 'archived'],
      offer: ['applied', 'rejected', 'withdrawn', 'archived'],
      rejected: ['applied', 'screening', 'interview', 'offer', 'withdrawn', 'archived'],
      withdrawn: ['applied', 'screening', 'interview', 'offer', 'rejected', 'archived'],
      archived: ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }
}
