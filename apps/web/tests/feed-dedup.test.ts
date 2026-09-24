import { describe, it, expect } from 'vitest';
import { deduplicateJobs, interleaveByCompany, processFeedJobs } from '../lib/feed-dedup';

describe('Feed Deduplication & Interleaving (Task 0.3)', () => {
  it('deduplicates jobs with the same company and title, keeping the first occurrence', () => {
    const jobs = [
      { id: '1', company_name: 'Stripe', canonical_title: 'Software Engineer', location: 'San Francisco, CA' },
      { id: '2', company_name: 'Stripe', canonical_title: 'Software Engineer', location: 'Seattle, WA' },
      { id: '3', company_name: 'Stripe', canonical_title: 'Software Engineer', location: 'Remote' },
      { id: '4', company_name: 'Datadog', canonical_title: 'Site Reliability Engineer', location: 'New York, NY' },
    ];

    const deduped = deduplicateJobs(jobs);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]!.id).toBe('1');
    expect(deduped[0]!.location).toBe('San Francisco, CA');
    expect(deduped[1]!.id).toBe('4');
  });

  it('correctly extracts company from nested companies relation object', () => {
    const jobs = [
      { id: '1', companies: { name: 'Airbnb' }, display_title: 'Frontend Engineer' },
      { id: '2', companies: { name: 'Airbnb' }, display_title: 'Frontend Engineer' },
      { id: '3', companies: { name: 'Airbnb' }, display_title: 'Backend Engineer' },
    ];

    const deduped = deduplicateJobs(jobs);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]!.id).toBe('1');
    expect(deduped[1]!.id).toBe('3');
  });

  it('interleaves jobs so a single company cannot monopolize the top of the feed', () => {
    const jobs = [
      { id: 'c1-1', company_name: 'Google', title: 'Role 1' },
      { id: 'c1-2', company_name: 'Google', title: 'Role 2' },
      { id: 'c1-3', company_name: 'Google', title: 'Role 3' },
      { id: 'c1-4', company_name: 'Google', title: 'Role 4' },
      { id: 'c1-5', company_name: 'Google', title: 'Role 5' },
      { id: 'c2-1', company_name: 'Meta', title: 'Role 10' },
      { id: 'c2-2', company_name: 'Meta', title: 'Role 11' },
    ];

    const interleaved = interleaveByCompany(jobs, 2);
    expect(interleaved.map((j) => j.id)).toEqual([
      'c1-1', 'c1-2', // Max 2 from Google
      'c2-1', 'c2-2', // Max 2 from Meta
      'c1-3', 'c1-4', // Next 2 from Google
      'c1-5',         // Remaining from Google
    ]);
  });

  it('processFeedJobs runs deduplication followed by interleaving', () => {
    const rawJobs = [
      { id: '1', company_name: 'Apple', title: 'iOS Dev' },
      { id: '2', company_name: 'Apple', title: 'iOS Dev' }, // duplicate
      { id: '3', company_name: 'Apple', title: 'Hardware Eng' },
      { id: '4', company_name: 'Microsoft', title: 'Cloud Architect' },
    ];

    const result = processFeedJobs(rawJobs);
    expect(result).toHaveLength(3);
    const ids = result.map((j) => j.id);
    expect(ids).toContain('1');
    expect(ids).not.toContain('2');
    expect(ids).toContain('3');
    expect(ids).toContain('4');
  });
});
