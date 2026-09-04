import { describe, it, expect } from 'vitest';
import {
  canTransitionVerification,
  isTerminalVerificationStatus,
  validateVerificationInvariants,
  type VerificationStatus,
  type ApplicationVerification,
} from '../src/entities/application-verification.js';

describe('ApplicationVerification Domain Entity & State Machine (Batch M)', () => {
  describe('isTerminalVerificationStatus', () => {
    it('identifies verified and rejected as terminal states', () => {
      expect(isTerminalVerificationStatus('verified')).toBe(true);
      expect(isTerminalVerificationStatus('rejected')).toBe(true);
      expect(isTerminalVerificationStatus('pending')).toBe(false);
    });
  });

  describe('canTransitionVerification State Machine', () => {
    it('permits valid transitions from pending to verified or rejected', () => {
      expect(canTransitionVerification('pending', 'verified')).toBe(true);
      expect(canTransitionVerification('pending', 'rejected')).toBe(true);
    });

    it('rejects self-transition on pending', () => {
      expect(canTransitionVerification('pending', 'pending')).toBe(false);
    });

    it('strictly forbids transitions out of terminal verified status', () => {
      expect(canTransitionVerification('verified', 'rejected')).toBe(false);
      expect(canTransitionVerification('verified', 'pending')).toBe(false);
      expect(canTransitionVerification('verified', 'verified')).toBe(false);
    });

    it('strictly forbids transitions out of terminal rejected status', () => {
      expect(canTransitionVerification('rejected', 'verified')).toBe(false);
      expect(canTransitionVerification('rejected', 'pending')).toBe(false);
      expect(canTransitionVerification('rejected', 'rejected')).toBe(false);
    });
  });

  describe('validateVerificationInvariants', () => {
    it('validates correct pending verification without reviewer metadata', () => {
      const pendingCheck = validateVerificationInvariants({
        status: 'pending',
        reviewerId: null,
        reviewedAt: null,
      });

      expect(pendingCheck.valid).toBe(true);
      expect(pendingCheck.error).toBeUndefined();
    });

    it('rejects pending verification that contains reviewerId', () => {
      const check = validateVerificationInvariants({
        status: 'pending',
        reviewerId: 'admin-uuid-1',
        reviewedAt: null,
      });

      expect(check.valid).toBe(false);
      expect(check.error).toContain('Pending verification must not have reviewer attribution');
    });

    it('rejects pending verification that contains reviewedAt', () => {
      const check = validateVerificationInvariants({
        status: 'pending',
        reviewerId: null,
        reviewedAt: new Date().toISOString(),
      });

      expect(check.valid).toBe(false);
      expect(check.error).toContain('Pending verification must not have reviewer attribution');
    });

    it('validates correct verified verification with reviewer attribution and timestamp', () => {
      const check = validateVerificationInvariants({
        status: 'verified',
        reviewerId: 'admin-uuid-1',
        reviewedAt: new Date().toISOString(),
      });

      expect(check.valid).toBe(true);
    });

    it('validates correct rejected verification with reviewer attribution and timestamp', () => {
      const check = validateVerificationInvariants({
        status: 'rejected',
        reviewerId: 'admin-uuid-1',
        reviewedAt: new Date().toISOString(),
      });

      expect(check.valid).toBe(true);
    });

    it('rejects verified status missing reviewerId', () => {
      const check = validateVerificationInvariants({
        status: 'verified',
        reviewerId: null,
        reviewedAt: new Date().toISOString(),
      });

      expect(check.valid).toBe(false);
      expect(check.error).toContain('Reviewed verification must possess reviewer attribution');
    });

    it('rejects rejected status missing reviewedAt', () => {
      const check = validateVerificationInvariants({
        status: 'rejected',
        reviewerId: 'admin-uuid-1',
        reviewedAt: null,
      });

      expect(check.valid).toBe(false);
      expect(check.error).toContain('Reviewed verification must possess reviewer attribution');
    });

    it('rejects invalid status types gracefully', () => {
      const check = validateVerificationInvariants({
        status: 'unknown' as any,
        reviewerId: null,
        reviewedAt: null,
      });

      expect(check.valid).toBe(false);
      expect(check.error).toContain('Invalid verification status');
    });
  });

  describe('ApplicationVerification Structural Contract', () => {
    it('instantiates valid application verification record', () => {
      const verification: ApplicationVerification = {
        id: 'verif-123',
        applicationId: 'app-456',
        organizationId: 'org-789',
        workerId: 'worker-001',
        screenshotUrl: 'verification-screenshots/org-789/app-456/shot.png',
        status: 'pending',
        reviewerId: null,
        reviewerNotes: null,
        reviewedAt: null,
        idempotencyKey: 'idem-key-1',
        createdAt: '2026-09-04T12:00:00.000Z',
        updatedAt: '2026-09-04T12:00:00.000Z',
      };

      expect(verification.id).toBe('verif-123');
      expect(verification.status).toBe('pending');
      expect(verification.screenshotUrl).toContain('shot.png');
    });
  });
});
