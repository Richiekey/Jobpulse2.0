import { describe, it, expect } from 'vitest';
import {
  CreateApplicationEventSchema,
  AppendApplicationNoteSchema,
  AppendApplicationCrmEventSchema,
  ApplicationEventFilterSchema,
  ApplicationEventTypeSchema,
  ApplicationStatusEnumSchema,
  AuthoritativeLifecycleEventTypeSchema,
  UserCrmEventTypeSchema,
  ActorTypeSchema,
  isProhibitedClientLifecycleEvent,
} from '../src/schemas/application-event.schema.js';

describe('Application Event & CRM Validation Schemas (Batch L Remediation)', () => {
  describe('AuthoritativeLifecycleEventTypeSchema', () => {
    it('accepts authoritative lifecycle event types', () => {
      const lifecycleTypes = [
        'created',
        'applied',
        'status_changed',
        'assigned',
        'reassigned',
        'note_updated',
        'details_updated',
        'archived',
      ];
      for (const t of lifecycleTypes) {
        expect(AuthoritativeLifecycleEventTypeSchema.safeParse(t).success).toBe(true);
      }
    });

    it('rejects CRM-only event types in lifecycle schema', () => {
      expect(AuthoritativeLifecycleEventTypeSchema.safeParse('note_added').success).toBe(false);
      expect(AuthoritativeLifecycleEventTypeSchema.safeParse('comment_added').success).toBe(false);
    });
  });

  describe('UserCrmEventTypeSchema', () => {
    it('accepts valid user CRM event types', () => {
      expect(UserCrmEventTypeSchema.safeParse('note_added').success).toBe(true);
      expect(UserCrmEventTypeSchema.safeParse('comment_added').success).toBe(true);
    });

    it('rejects lifecycle event types in user CRM schema', () => {
      expect(UserCrmEventTypeSchema.safeParse('status_changed').success).toBe(false);
      expect(UserCrmEventTypeSchema.safeParse('assigned').success).toBe(false);
      expect(UserCrmEventTypeSchema.safeParse('created').success).toBe(false);
    });
  });

  describe('isProhibitedClientLifecycleEvent helper', () => {
    it('identifies authoritative lifecycle event types as prohibited for client submission', () => {
      expect(isProhibitedClientLifecycleEvent('status_changed')).toBe(true);
      expect(isProhibitedClientLifecycleEvent('assigned')).toBe(true);
      expect(isProhibitedClientLifecycleEvent('reassigned')).toBe(true);
      expect(isProhibitedClientLifecycleEvent('created')).toBe(true);
      expect(isProhibitedClientLifecycleEvent('applied')).toBe(true);
      expect(isProhibitedClientLifecycleEvent('archived')).toBe(true);
      expect(isProhibitedClientLifecycleEvent('details_updated')).toBe(true);
    });

    it('allows client-authored CRM event types', () => {
      expect(isProhibitedClientLifecycleEvent('note_added')).toBe(false);
      expect(isProhibitedClientLifecycleEvent('comment_added')).toBe(false);
    });
  });

  describe('ActorTypeSchema', () => {
    it('accepts valid actor types', () => {
      expect(ActorTypeSchema.safeParse('user').success).toBe(true);
      expect(ActorTypeSchema.safeParse('worker').success).toBe(true);
      expect(ActorTypeSchema.safeParse('admin').success).toBe(true);
      expect(ActorTypeSchema.safeParse('system').success).toBe(true);
    });

    it('rejects invalid actor types', () => {
      expect(ActorTypeSchema.safeParse('bot').success).toBe(false);
      expect(ActorTypeSchema.safeParse('anonymous').success).toBe(false);
    });
  });

  describe('AppendApplicationCrmEventSchema', () => {
    it('validates a correct CRM note event', () => {
      const result = AppendApplicationCrmEventSchema.safeParse({
        eventType: 'note_added',
        note: 'Spoke with hiring manager. Second round scheduled next Tuesday.',
        metadata: { category: 'call_summary' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventType).toBe('note_added');
        expect(result.data.note).toBe('Spoke with hiring manager. Second round scheduled next Tuesday.');
      }
    });

    it('defaults eventType to note_added when omitted', () => {
      const result = AppendApplicationCrmEventSchema.safeParse({
        note: 'Candidate submitted portfolio link.',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventType).toBe('note_added');
      }
    });

    it('rejects forbidden lifecycle event types', () => {
      const result = AppendApplicationCrmEventSchema.safeParse({
        eventType: 'status_changed',
        note: 'Faked interview status',
      });

      expect(result.success).toBe(false);
    });

    it('rejects empty or whitespace-only note', () => {
      expect(AppendApplicationCrmEventSchema.safeParse({ note: '' }).success).toBe(false);
      expect(AppendApplicationCrmEventSchema.safeParse({ note: '   ' }).success).toBe(false);
    });

    it('rejects note exceeding 2000 characters', () => {
      const longNote = 'a'.repeat(2001);
      expect(AppendApplicationCrmEventSchema.safeParse({ note: longNote }).success).toBe(false);
    });
  });

  describe('ApplicationEventFilterSchema', () => {
    it('applies standard defaults for limit and offset', () => {
      const result = ApplicationEventFilterSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(0);
      }
    });

    it('coerces string numbers from query parameters', () => {
      const result = ApplicationEventFilterSchema.safeParse({
        limit: '25',
        offset: '10',
        eventType: 'status_changed',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
        expect(result.data.offset).toBe(10);
        expect(result.data.eventType).toBe('status_changed');
      }
    });

    it('rejects limit exceeding 100', () => {
      expect(ApplicationEventFilterSchema.safeParse({ limit: 150 }).success).toBe(false);
    });
  });
});
