import type { ApplicationStatus } from '../application-lifecycle.js';

/**
 * Authoritative Lifecycle Event Types
 * Generated SOLELY by database triggers or authoritative system processes upon actual state mutation.
 * Clients are strictly blocked from fabricating these event types directly.
 */
export type AuthoritativeLifecycleEventType =
  | 'created'
  | 'applied'
  | 'status_changed'
  | 'assigned'
  | 'reassigned'
  | 'note_updated'
  | 'details_updated'
  | 'archived'
  | 'verification_submitted'
  | 'verification_approved'
  | 'verification_rejected';

/**
 * User-Authored CRM Event Types
 * Permitted for client submission via CRM interaction endpoints (e.g. adding notes or recruiter comments).
 */
export type UserCrmEventType =
  | 'note_added'
  | 'comment_added';

export type ApplicationEventType = AuthoritativeLifecycleEventType | UserCrmEventType;

export type ActorType = 'user' | 'worker' | 'admin' | 'system';

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  organizationId?: string | null;
  actorId: string | null;
  actorType: ActorType;
  eventType: ApplicationEventType | string;
  fromStatus?: ApplicationStatus | null;
  toStatus?: ApplicationStatus | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ApplicationEventWithActor extends ApplicationEvent {
  actor?: {
    id: string;
    email: string | null;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
}

export interface CreateApplicationEventInput {
  applicationId: string;
  organizationId?: string | null;
  actorId?: string | null;
  actorType?: ActorType;
  eventType: ApplicationEventType | string;
  fromStatus?: ApplicationStatus | null;
  toStatus?: ApplicationStatus | null;
  metadata?: Record<string, unknown>;
}
