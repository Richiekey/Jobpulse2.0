import { z } from 'zod';

export const ApplicationEventTypeSchema = z.enum([
  'created',
  'applied',
  'status_changed',
  'note_updated',
  'assigned',
  'reassigned',
]);

export const ApplicationStatusEnumSchema = z.enum([
  'saved',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'archived',
]);

export const CreateApplicationEventSchema = z.object({
  applicationId: z.string().uuid(),
  organizationId: z.string().uuid().optional().nullable(),
  eventType: ApplicationEventTypeSchema.or(z.string().min(1).max(50)),
  fromStatus: ApplicationStatusEnumSchema.or(z.string()).optional().nullable(),
  toStatus: ApplicationStatusEnumSchema.or(z.string()).optional().nullable(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const AppendApplicationNoteSchema = z.object({
  note: z.string().trim().min(1, 'Note content cannot be empty').max(2000),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const ApplicationEventFilterSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  eventType: z.string().optional(),
});
