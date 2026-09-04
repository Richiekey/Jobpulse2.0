import { describe, it, expect } from 'vitest';
import {
  CreateVerificationSchema,
  ReviewVerificationSchema,
  VerificationQuerySchema,
  isProhibitedClientLifecycleEvent,
} from '../src/index.js';

describe('Application Verification Schema Validation (Batch M)', () => {
  describe('CreateVerificationSchema', () => {
    it('accepts valid https URL with image extension', () => {
      const result = CreateVerificationSchema.safeParse({
        screenshotUrl: 'https://storage.jobpulse.io/verification-screenshots/app1/evidence.png',
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid internal storage paths with image extensions', () => {
      const paths = [
        'verification-screenshots/org-123/app-456/screenshot.png',
        'org-123/app-456/evidence.jpg',
        'uploads/user-789/shot.webp',
        'app-123/screen.gif',
      ];

      for (const p of paths) {
        const result = CreateVerificationSchema.safeParse({ screenshotUrl: p });
        expect(result.success).toBe(true);
      }
    });

    it('accepts optional idempotencyKey and notes within limits', () => {
      const result = CreateVerificationSchema.safeParse({
        screenshotUrl: 'verification-screenshots/evidence.png',
        idempotencyKey: 'client-key-uuid-1234',
        notes: 'Submitted application on Greenhouse portal successfully.',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.idempotencyKey).toBe('client-key-uuid-1234');
      }
    });

    it('rejects path traversal attempts in storage paths', () => {
      const result = CreateVerificationSchema.safeParse({
        screenshotUrl: 'verification-screenshots/../../secret/evidence.png',
      });
      expect(result.success).toBe(false);
    });

    it('rejects unsupported file extensions in storage references', () => {
      const result = CreateVerificationSchema.safeParse({
        screenshotUrl: 'verification-screenshots/evidence.pdf',
      });
      expect(result.success).toBe(false);
    });

    it('rejects executable scripts or malicious extensions', () => {
      const result = CreateVerificationSchema.safeParse({
        screenshotUrl: 'verification-screenshots/malicious.exe',
      });
      expect(result.success).toBe(false);
    });

    it('rejects oversized notes exceeding 1000 characters', () => {
      const result = CreateVerificationSchema.safeParse({
        screenshotUrl: 'verification-screenshots/evidence.png',
        notes: 'a'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ReviewVerificationSchema', () => {
    it('accepts status verified with optional reviewer notes', () => {
      const result = ReviewVerificationSchema.safeParse({
        status: 'verified',
        reviewerNotes: 'Verified candidate submitted the official ATS confirmation.',
      });
      expect(result.success).toBe(true);
    });

    it('accepts status rejected with explanation notes', () => {
      const result = ReviewVerificationSchema.safeParse({
        status: 'rejected',
        reviewerNotes: 'Screenshot does not show confirmation page or timestamp.',
      });
      expect(result.success).toBe(true);
    });

    it('rejects review status pending (reviews must be decisive terminal states)', () => {
      const result = ReviewVerificationSchema.safeParse({
        status: 'pending',
      });
      expect(result.success).toBe(false);
    });

    it('rejects arbitrary review statuses', () => {
      const result = ReviewVerificationSchema.safeParse({
        status: 'accepted_tentative',
      });
      expect(result.success).toBe(false);
    });

    it('rejects malformed verificationId UUID if provided', () => {
      const result = ReviewVerificationSchema.safeParse({
        verificationId: 'not-a-uuid',
        status: 'verified',
      });
      expect(result.success).toBe(false);
    });

    it('rejects reviewer notes exceeding 1000 characters', () => {
      const result = ReviewVerificationSchema.safeParse({
        status: 'rejected',
        reviewerNotes: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('VerificationQuerySchema', () => {
    it('applies default pagination values', () => {
      const result = VerificationQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(0);
      }
    });

    it('parses valid status filters and custom pagination', () => {
      const result = VerificationQuerySchema.safeParse({
        status: 'pending',
        limit: '25',
        offset: '10',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('pending');
        expect(result.data.limit).toBe(25);
        expect(result.data.offset).toBe(10);
      }
    });

    it('rejects limit exceeding 100', () => {
      const result = VerificationQuerySchema.safeParse({
        limit: 101,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Prohibited Client Lifecycle Events (Batch M Synergy)', () => {
    it('strictly classifies verification events as prohibited for direct client insertion', () => {
      expect(isProhibitedClientLifecycleEvent('verification_submitted')).toBe(true);
      expect(isProhibitedClientLifecycleEvent('verification_approved')).toBe(true);
      expect(isProhibitedClientLifecycleEvent('verification_rejected')).toBe(true);
    });

    it('permits user CRM notes', () => {
      expect(isProhibitedClientLifecycleEvent('note_added')).toBe(false);
      expect(isProhibitedClientLifecycleEvent('comment_added')).toBe(false);
    });
  });
});
