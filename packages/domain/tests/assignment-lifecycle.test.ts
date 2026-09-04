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

    it('allows reopening skipped assignments', () => {
      expect(AssignmentLifecycleService.isValidTransition('skipped', 'assigned')).toBe(true);
      expect(AssignmentLifecycleService.isValidTransition('skipped', 'in_progress')).toBe(true);
    });

    it('allows reopening completed assignments back to in_progress (e.g. for revision)', () => {
      expect(AssignmentLifecycleService.isValidTransition('completed', 'in_progress')).toBe(true);
    });

    it('rejects invalid direct transitions like assigned -> completed directly without in_progress', () => {
      expect(AssignmentLifecycleService.isValidTransition('assigned', 'completed')).toBe(false);
    });

    it('rejects invalid transitions from completed to assigned or skipped directly', () => {
      expect(AssignmentLifecycleService.isValidTransition('completed', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.isValidTransition('completed', 'skipped')).toBe(false);
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

    it('allows worker to resume a skipped assignment back to in_progress', () => {
      expect(AssignmentLifecycleService.canWorkerTransition('skipped', 'in_progress')).toBe(true);
    });

    it('PREVENTS worker from mutating completed assignments without admin intervention', () => {
      expect(AssignmentLifecycleService.canWorkerTransition('completed', 'in_progress')).toBe(false);
      expect(AssignmentLifecycleService.canWorkerTransition('completed', 'assigned')).toBe(false);
      expect(AssignmentLifecycleService.canWorkerTransition('completed', 'skipped')).toBe(false);
    });

    it('PREVENTS worker from resetting skipped to assigned', () => {
      expect(AssignmentLifecycleService.canWorkerTransition('skipped', 'assigned')).toBe(false);
    });
  });

  describe('canAdminTransition', () => {
    it('allows admin to perform any valid transition, including reopening completed', () => {
      expect(AssignmentLifecycleService.canAdminTransition('completed', 'in_progress')).toBe(true);
      expect(AssignmentLifecycleService.canAdminTransition('skipped', 'assigned')).toBe(true);
    });
  });

  describe('isTerminal', () => {
    it('identifies completed as terminal', () => {
      expect(AssignmentLifecycleService.isTerminal('completed')).toBe(true);
      expect(AssignmentLifecycleService.isTerminal('assigned')).toBe(false);
      expect(AssignmentLifecycleService.isTerminal('in_progress')).toBe(false);
      expect(AssignmentLifecycleService.isTerminal('skipped')).toBe(false);
    });
  });
});
