import { describe, it, expect } from 'vitest';
import {
  JobAlertMatchingService,
  JobAlert,
  JobAlertMatchCandidate,
} from '../src/alert-matching';

describe('JobAlertMatchingService (Batch G)', () => {
  const baseAlert: JobAlert = {
    id: 'alert-1',
    userId: 'user-1',
    title: 'Staff Frontend React',
    query: 'Staff React',
    location: 'San Francisco',
    department: 'Engineering',
    employmentType: 'full-time',
    remoteType: 'remote',
    frequency: 'instant',
    channel: 'email',
    webhookUrl: null,
    isActive: true,
    lastDispatchedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleJob: JobAlertMatchCandidate = {
    id: 'job-101',
    title: 'Staff Frontend Engineer (React / Next.js)',
    companyName: 'Stripe',
    locationRaw: 'San Francisco, CA (Remote Friendly)',
    department: 'Engineering',
    employmentType: 'Full-Time',
    remoteType: 'remote',
    descriptionText: 'Building payment infrastructure with modern React and TypeScript.',
    url: 'https://stripe.com/jobs/101',
  };

  it('matches candidate when all criteria align', () => {
    const isMatch = JobAlertMatchingService.matchesJob(sampleJob, baseAlert);
    expect(isMatch).toBe(true);
  });

  it('rejects match if query keywords are missing', () => {
    const isMatch = JobAlertMatchingService.matchesJob(
      {
        ...sampleJob,
        title: 'Python Backend Engineer',
        descriptionText: 'Building backend infrastructure with Django and PostgreSQL.',
      },
      baseAlert
    );
    expect(isMatch).toBe(false);
  });

  it('rejects match if location does not match', () => {
    const isMatch = JobAlertMatchingService.matchesJob(
      { ...sampleJob, locationRaw: 'London, UK' },
      baseAlert
    );
    expect(isMatch).toBe(false);
  });

  it('rejects match if remote type does not match', () => {
    const isMatch = JobAlertMatchingService.matchesJob(
      { ...sampleJob, remoteType: 'onsite' },
      { ...baseAlert, remoteType: 'remote' }
    );
    expect(isMatch).toBe(false);
  });

  it('ignores inactive alerts', () => {
    const isMatch = JobAlertMatchingService.matchesJob(
      sampleJob,
      { ...baseAlert, isActive: false }
    );
    expect(isMatch).toBe(false);
  });

  it('evaluates batches and strictly prevents duplicate delivery for previously notified jobs', () => {
    const jobs: JobAlertMatchCandidate[] = [
      sampleJob,
      {
        id: 'job-102',
        title: 'Lead Staff React Developer',
        companyName: 'Vercel',
        locationRaw: 'San Francisco, CA',
        department: 'Engineering',
        employmentType: 'full-time',
        remoteType: 'remote',
        url: 'https://vercel.com/jobs/102',
      },
    ];

    const previouslyDelivered = new Map<string, Set<string>>([
      ['alert-1', new Set(['job-101'])], // job-101 was already delivered
    ]);

    const results = JobAlertMatchingService.evaluateAlerts(jobs, [baseAlert], previouslyDelivered);

    expect(results).toHaveLength(1);
    expect(results[0].alert.id).toBe('alert-1');
    expect(results[0].matchedJobs).toHaveLength(1);
    expect(results[0].matchedJobs[0].id).toBe('job-102');
    expect(results[0].newMatchedJobIds).toEqual(['job-102']);
  });
});
