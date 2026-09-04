import { describe, it, expect } from 'vitest';
import {
  CreateApplicationEventSchema,
  AppendApplicationNoteSchema,
  ApplicationEventFilterSchema,
  ApplicationEventTypeSchema,
  ApplicationStatusEnumSchema,
} from '../src/schemas/application-event.schema.js';

describe('Application Event & CRM Validation Schemas (Batch L)', () => {
  describe('ApplicationEventTypeSchema', () => {
    it('accepts valid lifecycle event types', () => {
      expect(ApplicationEventTypeSchema.safeParse('created').success).toBe(true);
      expect(ApplicationEventTypeSchema.safeParse('applied').success).toBe(true);
      expect(ApplicationEventTypeSchema.safeParse('status_changed').success).toBe(true);
      expect(ApplicationEventTypeSchema.safeParse('note_updated').success).toBe(true);
      expect(ApplicationEventTypeSchema.safeParse('assigned').success).toBe(true);
      expect(ApplicationEventTypeSchema.safeParse('reassigned').success).toBe(true);
    });

    it('rejects unrecognized event types', () => {
      expect(ApplicationEventTypeSchema.safeParse('unknown_random_event').success).toBe(false);
      expect(ApplicationEventTypeSchema.safeParse('').success).toBe(false);
    });
  });

  describe('ApplicationStatusEnumSchema', () => {
    it('accepts valid application statuses', () => {
      const statuses = ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'archived'];
      for (const st of statuses) {
        expect(ApplicationStatusEnumSchema.safeParse(st).success).toBe(true);
      }
    });

    it('rejects invalid statuses', () => {
      expect(ApplicationStatusEnumSchema.safeParse('pending').success).toBe(false);
      expect(ApplicationStatusEnumSchema.safeParse('hired').success).toBe(false);
    });
  });

  describe('CreateApplicationEventSchema', () => {
    it('validates a complete event creation payload', () => {
      const result = CreateApplicationEventSchema.safeParse({
        applicationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        organizationId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        eventType: 'status_changed',
        fromStatus: 'applied',
        toStatus: 'interview',
        metadata: { scheduledTime: '2026-09-10T14:00:00Z', interviewer: 'Bob' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.applicationId).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
        expect(result.data.fromStatus).toBe('applied');
        expect(result.data.toStatus).toBe('interview');
      }
    });

    it('allows nullable organizationId for personal applications', () => {
      const result = CreateApplicationEventSchema.safeParse({
        applicationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        organizationId: null,
        eventType: 'note_updated',
        metadata: { note: 'Followed up via email' },
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid application UUID', () => {
      const result = CreateApplicationEventSchema.safeParse({
        applicationId: 'not-a-uuid',
        eventType: 'applied',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('AppendApplicationNoteSchema', () => {
    it('validates a correct CRM note', () => {
      const result = AppendApplicationNoteSchema.safeParse({
        note: 'Spoke with hiring manager. Second round scheduled next Tuesday.',
        metadata: { category: 'call_summary' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note).toBe('Spoke with hiring manager. Second round scheduled next Tuesday.');
      }
    });

    it('rejects empty or whitespace-only note', () => {
      expect(AppendApplicationNoteSchema.safeParse({ note: '' }).success).toBe(false);
      expect(AppendApplicationNoteSchema.safeParse({ note: '   ' }).success).toBe(false);
    });

    it('rejects note exceeding 2000 characters', () => {
      const longNote = 'a'.repeat(2001);
      expect(AppendApplicationNoteSchema.safeParse({ note: longNote }).success).toBe(false);
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
