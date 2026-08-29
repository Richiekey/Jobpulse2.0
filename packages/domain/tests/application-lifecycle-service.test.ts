import { describe, it, expect } from 'vitest';
import { ApplicationLifecycleService } from '../src/application-lifecycle';

describe('ApplicationLifecycleService Domain Invariants (P0, P1)', () => {
  describe('getNextStatusOnDispatch', () => {
    it('creates new application as applied when no previous status exists', () => {
      expect(ApplicationLifecycleService.getNextStatusOnDispatch(null)).toBe('applied');
      expect(ApplicationLifecycleService.getNextStatusOnDispatch(undefined)).toBe('applied');
    });

    it('advances saved status to applied upon outbound dispatch', () => {
      expect(ApplicationLifecycleService.getNextStatusOnDispatch('saved')).toBe('applied');
    });

    it('remains applied when current status is already applied (idempotent)', () => {
      expect(ApplicationLifecycleService.getNextStatusOnDispatch('applied')).toBe('applied');
    });

    it('HARD INVARIANT: never regresses screening back to applied', () => {
      expect(ApplicationLifecycleService.getNextStatusOnDispatch('screening')).toBe('screening');
    });

    it('HARD INVARIANT: never regresses interview back to applied', () => {
      expect(ApplicationLifecycleService.getNextStatusOnDispatch('interview')).toBe('interview');
    });

    it('HARD INVARIANT: never regresses offer back to applied', () => {
      expect(ApplicationLifecycleService.getNextStatusOnDispatch('offer')).toBe('offer');
    });

    it('HARD INVARIANT: never regresses rejected back to applied', () => {
      expect(ApplicationLifecycleService.getNextStatusOnDispatch('rejected')).toBe('rejected');
    });

    it('HARD INVARIANT: never regresses withdrawn back to applied', () => {
      expect(ApplicationLifecycleService.getNextStatusOnDispatch('withdrawn')).toBe('withdrawn');
    });

    it('HARD INVARIANT: never regresses archived back to applied', () => {
      expect(ApplicationLifecycleService.getNextStatusOnDispatch('archived')).toBe('archived');
    });
  });

  describe('shouldUpdateStatusOnDispatch', () => {
    it('returns true for new or saved applications', () => {
      expect(ApplicationLifecycleService.shouldUpdateStatusOnDispatch(undefined)).toBe(true);
      expect(ApplicationLifecycleService.shouldUpdateStatusOnDispatch(null)).toBe(true);
      expect(ApplicationLifecycleService.shouldUpdateStatusOnDispatch('saved')).toBe(true);
    });

    it('returns false for applied and later/terminal stages', () => {
      expect(ApplicationLifecycleService.shouldUpdateStatusOnDispatch('applied')).toBe(false);
      expect(ApplicationLifecycleService.shouldUpdateStatusOnDispatch('screening')).toBe(false);
      expect(ApplicationLifecycleService.shouldUpdateStatusOnDispatch('interview')).toBe(false);
      expect(ApplicationLifecycleService.shouldUpdateStatusOnDispatch('offer')).toBe(false);
      expect(ApplicationLifecycleService.shouldUpdateStatusOnDispatch('rejected')).toBe(false);
      expect(ApplicationLifecycleService.shouldUpdateStatusOnDispatch('withdrawn')).toBe(false);
      expect(ApplicationLifecycleService.shouldUpdateStatusOnDispatch('archived')).toBe(false);
    });
  });

  describe('isValidManualTransition', () => {
    it('allows valid progressive lifecycle transitions', () => {
      expect(ApplicationLifecycleService.isValidManualTransition('saved', 'applied')).toBe(true);
      expect(ApplicationLifecycleService.isValidManualTransition('applied', 'screening')).toBe(true);
      expect(ApplicationLifecycleService.isValidManualTransition('screening', 'interview')).toBe(true);
      expect(ApplicationLifecycleService.isValidManualTransition('interview', 'offer')).toBe(true);
    });

    it('allows terminal transitions from active stages', () => {
      expect(ApplicationLifecycleService.isValidManualTransition('applied', 'rejected')).toBe(true);
      expect(ApplicationLifecycleService.isValidManualTransition('interview', 'withdrawn')).toBe(true);
      expect(ApplicationLifecycleService.isValidManualTransition('offer', 'archived')).toBe(true);
    });
  });
});
