import { describe, it, expect } from 'vitest';
import type {
  ApplicationEvent,
  ApplicationEventType,
  ApplicationEventWithActor,
  CreateApplicationEventInput,
} from '../src/entities/application-event';

describe('ApplicationEvent Domain Invariants (Batch L)', () => {
  it('validates supported application event types', () => {
    const validEventTypes: ApplicationEventType[] = [
      'created',
      'applied',
      'status_changed',
      'note_updated',
      'assigned',
      'reassigned',
    ];

    expect(validEventTypes).toHaveLength(6);
    expect(validEventTypes).toContain('created');
    expect(validEventTypes).toContain('status_changed');
    expect(validEventTypes).toContain('note_updated');
  });

  it('correctly structures an application event with complete provenance', () => {
    const eventInput: CreateApplicationEventInput = {
      applicationId: '00000000-0000-0000-0000-000000000001',
      organizationId: '00000000-0000-0000-0000-000000000002',
      actorId: '00000000-0000-0000-0000-000000000003',
      eventType: 'status_changed',
      fromStatus: 'applied',
      toStatus: 'screening',
      metadata: { note: 'Advancing candidate to recruiter screen', recruiter: 'Jane Doe' },
    };

    const event: ApplicationEvent = {
      id: '00000000-0000-0000-0000-000000000099',
      applicationId: eventInput.applicationId,
      organizationId: eventInput.organizationId,
      actorId: eventInput.actorId,
      eventType: eventInput.eventType,
      fromStatus: eventInput.fromStatus,
      toStatus: eventInput.toStatus,
      metadata: eventInput.metadata || {},
      createdAt: new Date().toISOString(),
    };

    expect(event.applicationId).toBe('00000000-0000-0000-0000-000000000001');
    expect(event.organizationId).toBe('00000000-0000-0000-0000-000000000002');
    expect(event.actorId).toBe('00000000-0000-0000-0000-000000000003');
    expect(event.eventType).toBe('status_changed');
    expect(event.fromStatus).toBe('applied');
    expect(event.toStatus).toBe('screening');
    expect(event.metadata).toEqual({
      note: 'Advancing candidate to recruiter screen',
      recruiter: 'Jane Doe',
    });
  });

  it('allows personal applications without an organizationId (nullable isolation)', () => {
    const personalEvent: ApplicationEvent = {
      id: '00000000-0000-0000-0000-000000000100',
      applicationId: '00000000-0000-0000-0000-000000000001',
      organizationId: null,
      actorId: '00000000-0000-0000-0000-000000000003',
      eventType: 'applied',
      fromStatus: null,
      toStatus: 'applied',
      metadata: { source: 'outbound_dispatch' },
      createdAt: new Date().toISOString(),
    };

    expect(personalEvent.organizationId).toBeNull();
    expect(personalEvent.eventType).toBe('applied');
  });

  it('attaches actor metadata in ApplicationEventWithActor', () => {
    const eventWithActor: ApplicationEventWithActor = {
      id: '00000000-0000-0000-0000-000000000101',
      applicationId: '00000000-0000-0000-0000-000000000001',
      organizationId: '00000000-0000-0000-0000-000000000002',
      actorId: '00000000-0000-0000-0000-000000000003',
      eventType: 'note_updated',
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
  });
});
