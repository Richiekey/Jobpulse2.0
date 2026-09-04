import type { AssignmentStatus } from './entities/job-assignment.js';

export class AssignmentLifecycleService {
  /**
   * Valid forward transitions for an assignment under standard workflow rules.
   */
  private static readonly VALID_TRANSITIONS: Record<AssignmentStatus, ReadonlySet<AssignmentStatus>> = {
    assigned: new Set(['in_progress', 'skipped']),
    in_progress: new Set(['completed', 'skipped']),
    completed: new Set(['in_progress']), // Admin reopen
    skipped: new Set(['assigned', 'in_progress']), // Reopen
  };

  /**
   * Allowed transitions that a worker can perform independently on their own assignment.
   */
  private static readonly WORKER_ALLOWED_TRANSITIONS: Record<AssignmentStatus, ReadonlySet<AssignmentStatus>> = {
    assigned: new Set(['in_progress', 'skipped']),
    in_progress: new Set(['completed', 'skipped']),
    completed: new Set([]), // Workers cannot alter completed assignments without admin intervention
    skipped: new Set(['in_progress']), // Workers can resume a skipped assignment
  };

  /**
   * Validates if any general state transition is permissible.
   */
  public static isValidTransition(from: AssignmentStatus, to: AssignmentStatus): boolean {
    if (from === to) return true;
    return this.VALID_TRANSITIONS[from]?.has(to) ?? false;
  }

  /**
   * Validates if a worker is authorized to execute the given transition on their own assignment.
   */
  public static canWorkerTransition(from: AssignmentStatus, to: AssignmentStatus): boolean {
    if (from === to) return true;
    return this.WORKER_ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
  }

  /**
   * Validates if an administrator is authorized to execute the given transition.
   * Administrators have full jurisdiction to reopen or reassign status.
   */
  public static canAdminTransition(from: AssignmentStatus, to: AssignmentStatus): boolean {
    if (from === to) return true;
    return this.isValidTransition(from, to);
  }

  /**
   * Identifies whether the assignment has reached a terminal or successful stage.
   */
  public static isTerminal(status: AssignmentStatus): boolean {
    return status === 'completed';
  }
}
