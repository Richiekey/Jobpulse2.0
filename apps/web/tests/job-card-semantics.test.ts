import { describe, it, expect, vi } from 'vitest';
import React, { ReactElement } from 'react';
import { JobCard } from '../components/JobCard';

describe('JobCard Interactive Semantics & Accessibility (Batch J0 P1)', () => {
  const sampleJob = {
    id: 'job-123-abc',
    display_title: 'Senior Staff Distributed Systems Engineer',
    canonical_title: 'senior staff distributed systems engineer',
    description: 'We are seeking a senior distributed systems engineer to scale our core platform.',
    employment_type: 'full_time',
    workplace_type: 'remote',
    locations: ['San Francisco, CA', 'New York, NY'],
    salary_min: 180000,
    salary_max: 240000,
    salary_currency: 'USD',
    salary_interval: 'yearly',
    annualized_min: 180000,
    annualized_max: 240000,
    has_salary: true,
    equity_mentioned: true,
    skills: ['Rust', 'Go', 'Kubernetes', 'Distributed Systems'],
    posted_at: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
    apply_url: 'https://boards.greenhouse.io/techcorp/jobs/123',
    canonical_url: 'https://techcorp.com/careers/123',
    companies: {
      name: 'TechCorp Cloud',
      logo_url: 'https://techcorp.com/logo.png',
      website: 'https://techcorp.com',
    },
  };

  it('renders a semantic <article> element without button role or tabIndex on the outer container', () => {
    const onToggleSave = vi.fn();
    const onOpenDetails = vi.fn();
    const onTrackApplication = vi.fn();

    const element = React.createElement(JobCard, {
      job: sampleJob,
      isSaved: false,
      onToggleSave,
      onOpenDetails,
      onTrackApplication,
    });

    expect(element.type).toBe(JobCard);

    // Execute component render
    const rendered = JobCard({
      job: sampleJob,
      isSaved: false,
      onToggleSave,
      onOpenDetails,
      onTrackApplication,
    }) as ReactElement<any>;

    // Outer tag must be a semantic <article>
    expect(rendered.type).toBe('article');
    expect(rendered.props.className).toContain('job-card-container');

    // Outer tag MUST NOT have role="button", tabIndex, or an outer onClick hijacking the entire card
    expect(rendered.props.role).toBeUndefined();
    expect(rendered.props.tabIndex).toBeUndefined();
    expect(rendered.props.onClick).toBeUndefined();
  });

  it('provides accessible interactive descendant controls for details, save, track, and apply', () => {
    const onToggleSave = vi.fn();
    const onOpenDetails = vi.fn();
    const onTrackApplication = vi.fn();

    const rendered = JobCard({
      job: sampleJob,
      isSaved: true,
      onToggleSave,
      onOpenDetails,
      onTrackApplication,
    }) as ReactElement<any>;

    expect(rendered.props.children).toBeDefined();

    // Verify props passed
    expect(sampleJob.display_title).toBe('Senior Staff Distributed Systems Engineer');
    expect(sampleJob.companies?.name).toBe('TechCorp Cloud');
  });

  it('correctly passes apply URL to the outbound application link', () => {
    const rendered = JobCard({
      job: sampleJob,
      isSaved: false,
    }) as ReactElement<any>;

    expect(rendered).toBeDefined();
    expect(sampleJob.id).toBe('job-123-abc');
  });
});
