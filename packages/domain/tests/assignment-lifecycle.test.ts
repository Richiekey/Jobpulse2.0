import { describe, it, expect } from 'vitest';
import { AssignmentLifecycleService } from '../src/assignment-lifecycle.js';
import type { AssignmentStatus } from '../src/entities/job-assignment.js';

describe('AssignmentLifecycleService (Batch K Workforce Architecture)', () => {
  describe('isValidTransition', () => {
    it('allows same-state transitions (idempotent)', () => {
      const statuses: AssignmentStatus[] = ['assigned', 'in_progress', 'completed', 'skipped'];
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

    it('enforces completed as terminal: no transition to assigned or in_progress', () => {
      expect(AssignmentLifecycleService.isValidTransition('completed', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('completed', 'in_progress')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('completed', 'skipped')).toBe(false);
    });

    it('enforces skipped as terminal: no transition to assigned or in_progress', () => {
      expect(AssignmentLifecycleService.isValidTransition('skipped', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('skipped', 'in_progress')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('skipped', 'completed')).toBe(false);
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

    it('PREVENTS worker from mutating completed assignments', () => {
      expect(AssignmentLifecycleService.canWorkerTransition('completed', 'in_progress')).toBe(false);
      expect(AssignmentLifecycleService.canWorkerTransition('completed', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.canWorkerTransition('completed', 'skipped')).toBe(false);
    });

    it('PREVENTS worker from resetting skipped to assigned or in_progress', () => {
      expect(AssignmentLifecycleService.canWorkerTransition('skipped', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.canWorkerTransition('skipped', 'in_progress')).toBe(false);
    });
  });

  describe('canAdminTransition', () => {
    it('enforces that admin cannot bypass terminal state invariants', () => {
      expect(AssignmentLifecycleService.canAdminTransition('completed', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.canAdminTransition('completed', 'in_progress')).toBe(false);
      expect(AssignmentLifecycleService.canAdminTransition('skipped', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.canAdminTransition('skipped', 'in_progress')).toBe(false);
    });
  });

  describe('isTerminal', () => {
    it('identifies completed and skipped as terminal', () => {
      expect(AssignmentLifecycleService.isTerminal('completed')).toBe(true);
      expect(AssignmentLifecycleService.isTerminal('skipped')).toBe(true);
      expect(AssignmentLifecycleService.isTerminal('assigned')).toBe(false);
      expect(AssignmentLifecycleService.isTerminal('in_progress')).toBe(false);
    });
  });
});
