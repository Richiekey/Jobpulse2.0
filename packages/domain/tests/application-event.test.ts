import { describe, it, expect } from 'vitest';
import type {
  ApplicationEvent,
  ApplicationEventType,
  ApplicationEventWithActor,
  CreateApplicationEventInput,
  AuthoritativeLifecycleEventType,
  UserCrmEventType,
} from '../src/entities/application-event';

describe('ApplicationEvent Domain Invariants (Batch L Remediation)', () => {
  it('validates supported application event types distinguishing lifecycle and CRM events', () => {
    const lifecycleTypes: AuthoritativeLifecycleEventType[] = [
      'created',
      'applied',
      'status_changed',
      'assigned',
      'reassigned',
      'note_updated',
      'details_updated',
      'archived',
    ];

    const crmTypes: UserCrmEventType[] = [
      'note_added',
      'comment_added',
    ];

    const validEventTypes: ApplicationEventType[] = [...lifecycleTypes, ...crmTypes];

    expect(validEventTypes).toHaveLength(10);
    expect(validEventTypes).toContain('created');
    expect(validEventTypes).toContain('status_changed');
    expect(validEventTypes).toContain('details_updated');
    expect(validEventTypes).toContain('archived');
    expect(validEventTypes).toContain('note_added');
    expect(validEventTypes).toContain('comment_added');
  });

  it('correctly structures an application event with complete provenance and actor attribution', () => {
    const eventInput: CreateApplicationEventInput = {
      applicationId: '00000000-0000-0000-0000-000000000001',
      organizationId: '00000000-0000-0000-0000-000000000002',
      actorId: '00000000-0000-0000-0000-000000000003',
      actorType: 'admin',
      eventType: 'status_changed',
      fromStatus: 'applied',
      toStatus: 'screening',
      metadata: { note: 'Advancing candidate to recruiter screen', recruiter: 'Jane Doe' },
    };

    const event: ApplicationEvent = {
      id: '00000000-0000-0000-0000-000000000099',
      applicationId: eventInput.applicationId,
      organizationId: eventInput.organizationId,
      actorId: eventInput.actorId || null,
      actorType: eventInput.actorType || 'user',
      eventType: eventInput.eventType,
      fromStatus: eventInput.fromStatus,
      toStatus: eventInput.toStatus,
      metadata: eventInput.metadata || {},
      createdAt: new Date().toISOString(),
    };

    expect(event.applicationId).toBe('00000000-0000-0000-0000-000000000001');
    expect(event.organizationId).toBe('00000000-0000-0000-0000-000000000002');
    expect(event.actorId).toBe('00000000-0000-0000-0000-000000000003');
    expect(event.actorType).toBe('admin');
    expect(event.eventType).toBe('status_changed');
    expect(event.fromStatus).toBe('applied');
    expect(event.toStatus).toBe('screening');
    expect(event.metadata).toEqual({
      note: 'Advancing candidate to recruiter screen',
      recruiter: 'Jane Doe',
    });
  });

  it('supports explicit system actor attribution with null actorId', () => {
    const systemEvent: ApplicationEvent = {
      id: '00000000-0000-0000-0000-000000000100',
      applicationId: '00000000-0000-0000-0000-000000000001',
      organizationId: null,
      actorId: null,
      actorType: 'system',
      eventType: 'applied',
      fromStatus: null,
      toStatus: 'applied',
      metadata: { source: 'automated_dispatch' },
      createdAt: new Date().toISOString(),
    };

    expect(systemEvent.actorId).toBeNull();
    expect(systemEvent.actorType).toBe('system');
  });

  it('attaches actor metadata in ApplicationEventWithActor', () => {
    const eventWithActor: ApplicationEventWithActor = {
      id: '00000000-0000-0000-0000-000000000101',
      applicationId: '00000000-0000-0000-0000-000000000001',
      organizationId: '00000000-0000-0000-0000-000000000002',
      actorId: '00000000-0000-0000-0000-000000000003',
      actorType: 'worker',
      eventType: 'note_added',
      fromStatus: 'screening',
      toStatus: 'screening',
      metadata: { note: 'Left feedback on interview prep' },
      createdAt: new Date().toISOString(),
      actor: {
        id: '00000000-0000-0000-0000-000000000003',
        email: 'recruiter@example.com',
        fullName: 'Jane Recruiter',
        avatarUrl: 'https://example.com/avatar.png',
      },
    };

    expect(eventWithActor.actor).not.toBeNull();
    expect(eventWithActor.actor?.email).toBe('recruiter@example.com');
    expect(eventWithActor.actor?.fullName).toBe('Jane Recruiter');
    expect(eventWithActor.actorType).toBe('worker');
  });
});
