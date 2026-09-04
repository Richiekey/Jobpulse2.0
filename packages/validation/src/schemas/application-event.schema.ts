import { z } from 'zod';

export const AuthoritativeLifecycleEventTypeSchema = z.enum([
  'created',
  'applied',
  'status_changed',
  'assigned',
  'reassigned',
  'note_updated',
  'details_updated',
  'archived',
  'verification_submitted',
  'verification_approved',
  'verification_rejected',
]);

export const UserCrmEventTypeSchema = z.enum([
  'note_added',
  'comment_added',
]);

export const ApplicationEventTypeSchema = z.enum([
  'created',
  'applied',
  'status_changed',
  'assigned',
  'reassigned',
  'note_updated',
  'details_updated',
  'archived',
  'note_added',
  'comment_added',
  'verification_submitted',
  'verification_approved',
  'verification_rejected',
]);

export const ActorTypeSchema = z.enum([
  'user',
  'worker',
  'admin',
  'system',
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

export const ProhibitedClientLifecycleEventTypes = [
  'created',
  'applied',
  'status_changed',
  'assigned',
  'reassigned',
  'note_updated',
  'details_updated',
  'archived',
  'verification_submitted',
  'verification_approved',
  'verification_rejected',
] as const;

export function isProhibitedClientLifecycleEvent(eventType: string): boolean {
  return (ProhibitedClientLifecycleEventTypes as readonly string[]).includes(eventType);
}

export const CreateApplicationEventSchema = z.object({
  applicationId: z.string().uuid(),
  organizationId: z.string().uuid().optional().nullable(),
  actorType: ActorTypeSchema.default('user'),
  eventType: ApplicationEventTypeSchema.or(z.string().min(1).max(50)),
  fromStatus: ApplicationStatusEnumSchema.or(z.string()).optional().nullable(),
  toStatus: ApplicationStatusEnumSchema.or(z.string()).optional().nullable(),
  metadata: z.record(z.unknown()).optional().default({}),
});

/**
 * Schema for client-submitted CRM events (notes/comments).
 * Strictly forbids fabricated lifecycle events (status_changed, assigned, created, etc.).
 */
export const AppendApplicationCrmEventSchema = z.object({
  eventType: UserCrmEventTypeSchema.default('note_added'),
  note: z.string().trim().min(1, 'Note content cannot be empty').max(2000),
  metadata: z.record(z.unknown()).optional().default({}),
});

// Backward compatibility alias for note-only inputs
export const AppendApplicationNoteSchema = AppendApplicationCrmEventSchema;

export const ApplicationEventFilterSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  eventType: z.string().optional(),
});
