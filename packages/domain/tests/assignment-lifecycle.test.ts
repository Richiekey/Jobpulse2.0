import { describe, it, expect } from 'vitest';
import { AssignmentLifecycleService } from '../src/assignment-lifecycle.js';
import type { AssignmentStatus } from '../src/entities/job-assignment.js';

describe('AssignmentLifecycleService (Batch K Workforce Architecture)', () => {
  describe('isValidTransition', () => {
    it('allows same-state transitions (idempotent)', () => {
      const statuses: AssignmentStatus[] = ['assigned', 'in_progress', 'completed', 'skipped', 'cancelled'];
      for (const status of statuses) {
        expect(AssignmentLifecycleService.isValidTransition(status, status)).toBe(true);
      }
    });

    it('allows valid forward progression: assigned -> in_progress -> completed', () => {
      expect(AssignmentLifecycleService.isValidTransition('assigned', 'in_progress')).toBe(true);
      expect(AssignmentLifecycleService.isValidTransition('in_progress', 'completed')).toBe(true);
    });

    it('allows skipping from assigned or in_progress', () => {
      expect(AssignmentLifecycleService.isValidTransition('assigned', 'skipped')).toBe(true);
      expect(AssignmentLifecycleService.isValidTransition('in_progress', 'skipped')).toBe(true);
    });

    it('allows cancellation from assigned or in_progress', () => {
      expect(AssignmentLifecycleService.isValidTransition('assigned', 'cancelled')).toBe(true);
      expect(AssignmentLifecycleService.isValidTransition('in_progress', 'cancelled')).toBe(true);
    });

    it('enforces completed as terminal: no transition to assigned, in_progress, skipped, or cancelled', () => {
      expect(AssignmentLifecycleService.isValidTransition('completed', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('completed', 'in_progress')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('completed', 'skipped')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('completed', 'cancelled')).toBe(false);
    });

    it('enforces skipped as terminal: no transition to assigned, in_progress, completed, or cancelled', () => {
      expect(AssignmentLifecycleService.isValidTransition('skipped', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('skipped', 'in_progress')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('skipped', 'completed')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('skipped', 'cancelled')).toBe(false);
    });

    it('enforces cancelled as terminal: no transition to any active or terminal state', () => {
      expect(AssignmentLifecycleService.isValidTransition('cancelled', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('cancelled', 'in_progress')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('cancelled', 'completed')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('cancelled', 'skipped')).toBe(false);
    });

    it('rejects invalid direct transitions like assigned -> completed directly without in_progress', () => {
      expect(AssignmentLifecycleService.isValidTransition('assigned', 'completed')).toBe(false);
    });
  });

  describe('canWorkerTransition (Worker Authorization Isolation)', () => {
    it('allows worker to move assigned -> in_progress and in_progress -> completed', () => {
      expect(AssignmentLifecycleService.canWorkerTransition('assigned', 'in_progress')).toBe(true);
      expect(AssignmentLifecycleService.canWorkerTransition('in_progress', 'completed')).toBe(true);
    });

    it('allows worker to skip from assigned or in_progress', () => {
      expect(AssignmentLifecycleService.canWorkerTransition('assigned', 'skipped')).toBe(true);
      expect(AssignmentLifecycleService.canWorkerTransition('in_progress', 'skipped')).toBe(true);
    });

    it('PREVENTS worker from cancelling assignments (admin-only privilege)', () => {
      expect(AssignmentLifecycleService.canWorkerTransition('assigned', 'cancelled')).toBe(false);
      expect(AssignmentLifecycleService.canWorkerTransition('in_progress', 'cancelled')).toBe(false);
      expect(AssignmentLifecycleService.canWorkerTransition('cancelled', 'assigned')).toBe(false);
    });

    it('PREVENTS worker from mutating completed assignments', () => {
      expect(AssignmentLifecycleService.canWorkerTransition('completed', 'in_progress')).toBe(false);
      expect(AssignmentLifecycleService.canWorkerTransition('completed', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.canWorkerTransition('completed', 'skipped')).toBe(false);
      expect(AssignmentLifecycleService.canWorkerTransition('completed', 'cancelled')).toBe(false);
    });

    it('PREVENTS worker from resetting skipped to assigned or in_progress', () => {
      expect(AssignmentLifecycleService.canWorkerTransition('skipped', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.canWorkerTransition('skipped', 'in_progress')).toBe(false);
    });
  });

  describe('canAdminTransition', () => {
    it('allows administrator to cancel active assignments (assigned and in_progress)', () => {
      expect(AssignmentLifecycleService.canAdminTransition('assigned', 'cancelled')).toBe(true);
      expect(AssignmentLifecycleService.canAdminTransition('in_progress', 'cancelled')).toBe(true);
    });

    it('enforces that admin cannot bypass terminal state invariants', () => {
      expect(AssignmentLifecycleService.canAdminTransition('completed', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.canAdminTransition('completed', 'in_progress')).toBe(false);
      expect(AssignmentLifecycleService.canAdminTransition('completed', 'cancelled')).toBe(false);
      expect(AssignmentLifecycleService.canAdminTransition('skipped', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.canAdminTransition('skipped', 'in_progress')).toBe(false);
      expect(AssignmentLifecycleService.canAdminTransition('cancelled', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.canAdminTransition('cancelled', 'in_progress')).toBe(false);
    });
  });

  describe('isTerminal', () => {
    it('identifies completed, skipped, and cancelled as terminal', () => {
      expect(AssignmentLifecycleService.isTerminal('completed')).toBe(true);
      expect(AssignmentLifecycleService.isTerminal('skipped')).toBe(true);
      expect(AssignmentLifecycleService.isTerminal('cancelled')).toBe(true);
      expect(AssignmentLifecycleService.isTerminal('assigned')).toBe(false);
      expect(AssignmentLifecycleService.isTerminal('in_progress')).toBe(false);
    });
  });
});
