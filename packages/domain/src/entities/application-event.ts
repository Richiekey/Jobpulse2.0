import type { ApplicationStatus } from '../application-lifecycle.js';

export type ApplicationEventType =
  | 'created'
  | 'applied'
  | 'status_changed'
  | 'note_updated'
  | 'assigned'
  | 'reassigned';

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  organizationId?: string | null;
  actorId: string;
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
  actorId: string;
  eventType: ApplicationEventType | string;
  fromStatus?: ApplicationStatus | null;
  toStatus?: ApplicationStatus | null;
  metadata?: Record<string, unknown>;
}
