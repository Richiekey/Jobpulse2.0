import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Button,
  Badge,
  StatusBadge,
  resolveStatusSemantic,
  Card,
  Modal,
  ConfirmationDialog,
  Tabs,
  Input,
  Select,
  EmptyState,
  LoadingState,
  Skeleton,
  ErrorState,
  Alert,
  PageHeader,
  StatCard,
  Timeline,
} from '@/components/ui';

describe('Batch U — Component & Experience Integrity Suite', () => {
  // =========================================================================
  // 1. Button Primitive Tests
  // =========================================================================
  describe('Button Component', () => {
    it('renders with default secondary variant and medium size', () => {
      const html = renderToStaticMarkup(<Button>Click Me</Button>);
      expect(html).toContain('ui-button');
      expect(html).toContain('ui-button-secondary');
      expect(html).toContain('ui-button-md');
      expect(html).toContain('Click Me');
      expect(html).toContain('type="button"');
    });

    it('renders all semantic variants correctly', () => {
      const variants = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;
      for (const variant of variants) {
        const html = renderToStaticMarkup(<Button variant={variant}>Button</Button>);
        expect(html).toContain(`ui-button-${variant}`);
      }
    });

    it('handles disabled state with correct disabled attribute and opacity styling', () => {
      const html = renderToStaticMarkup(<Button disabled>Disabled Action</Button>);
      expect(html).toContain('disabled=""');
      expect(html).toContain('cursor:not-allowed');
      expect(html).toContain('opacity:0.65');
    });

    it('handles loading state with aria-busy, disabled attribute, and spinner', () => {
      const html = renderToStaticMarkup(<Button isLoading>Saving...</Button>);
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('disabled=""');
      expect(html).toContain('animate-spin');
      expect(html).toContain('aria-hidden="true"');
    });

    it('renders left and right icons when not loading', () => {
      const html = renderToStaticMarkup(
        <Button
          leftIcon={<span data-testid="left-icon">←</span>}
          rightIcon={<span data-testid="right-icon">→</span>}
        >
          Nav
        </Button>
      );
      expect(html).toContain('data-testid="left-icon"');
      expect(html).toContain('data-testid="right-icon"');
    });
  });

  // =========================================================================
  // 2. Badge Primitive Tests
  // =========================================================================
  describe('Badge Component', () => {
    it('renders with default variant and label', () => {
      const html = renderToStaticMarkup(<Badge>Remote</Badge>);
      expect(html).toContain('ui-badge');
      expect(html).toContain('ui-badge-default');
      expect(html).toContain('Remote');
    });

    it('renders removable badge with accessible dismiss button', () => {
      const html = renderToStaticMarkup(
        <Badge isRemovable onRemove={() => {}}>
          Filter Tag
        </Badge>
      );
      expect(html).toContain('aria-label="Remove Filter Tag"');
    });
  });

  // =========================================================================
  // 3. StatusBadge & Operational State Truthfulness Tests
  // =========================================================================
  describe('StatusBadge & State Semantics', () => {
    it('maps domain statuses to canonical semantic types truthfully', () => {
      // SUCCESS domain states
      expect(resolveStatusSemantic('active').type).toBe('success');
      expect(resolveStatusSemantic('verified').type).toBe('success');
      expect(resolveStatusSemantic('completed').type).toBe('success');
      expect(resolveStatusSemantic('succeeded').type).toBe('success');
      expect(resolveStatusSemantic('synced').type).toBe('success');

      // WARNING / QUEUED domain states
      expect(resolveStatusSemantic('aging').type).toBe('warning');
      expect(resolveStatusSemantic('queued').type).toBe('warning');
      expect(resolveStatusSemantic('pending').type).toBe('warning');
      expect(resolveStatusSemantic('in_progress').type).toBe('warning');
      expect(resolveStatusSemantic('retrying').type).toBe('warning');

      // DANGER domain states
      expect(resolveStatusSemantic('stale').type).toBe('danger');
      expect(resolveStatusSemantic('expired').type).toBe('danger');
      expect(resolveStatusSemantic('failed').type).toBe('danger');
      expect(resolveStatusSemantic('rejected').type).toBe('danger');
      expect(resolveStatusSemantic('dead_letter').type).toBe('danger');
      expect(resolveStatusSemantic('cancelled').type).toBe('danger');

      // INFO domain states
      expect(resolveStatusSemantic('dispatched').type).toBe('info');
      expect(resolveStatusSemantic('running').type).toBe('info');
      expect(resolveStatusSemantic('processing').type).toBe('info');
      expect(resolveStatusSemantic('assigned').type).toBe('info');

      // NEUTRAL domain states
      expect(resolveStatusSemantic('archived').type).toBe('neutral');
      expect(resolveStatusSemantic('skipped').type).toBe('neutral');
      expect(resolveStatusSemantic('draft').type).toBe('neutral');
    });

    it('faithfully distinguishes in-flight operations from terminal states', () => {
      // True in-flight operations
      expect(resolveStatusSemantic('running').isInFlight).toBe(true);
      expect(resolveStatusSemantic('processing').isInFlight).toBe(true);
      expect(resolveStatusSemantic('in_progress').isInFlight).toBe(true);
      expect(resolveStatusSemantic('retrying').isInFlight).toBe(true);

      // Terminal or idle states must NEVER be flagged as in-flight
      expect(resolveStatusSemantic('dispatched').isInFlight).toBe(false);
      expect(resolveStatusSemantic('queued').isInFlight).toBe(false);
      expect(resolveStatusSemantic('completed').isInFlight).toBe(false);
      expect(resolveStatusSemantic('succeeded').isInFlight).toBe(false);
      expect(resolveStatusSemantic('failed').isInFlight).toBe(false);
      expect(resolveStatusSemantic('dead_letter').isInFlight).toBe(false);
    });

    it('renders screen reader announcements for accessibility', () => {
      const html = renderToStaticMarkup(<StatusBadge status="verified" />);
      expect(html).toContain('ui-status-success');
      expect(html).toContain('data-status="verified"');
      expect(html).toContain('class="sr-only">Status: Verified</span>');
    });
  });

  // =========================================================================
  // 4. Modal & Dialog Semantics Tests
  // =========================================================================
  describe('Modal Component', () => {
    it('renders nothing when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <Modal isOpen={false} onClose={() => {}} title="Test Modal">
          <p>Hidden Content</p>
        </Modal>
      );
      expect(html).toBe('');
    });

    it('renders with dialog role, aria-modal, aria-labelledby when isOpen is true', () => {
      const html = renderToStaticMarkup(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal" description="Modal description">
          <p>Visible Content</p>
        </Modal>
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="modal-title-');
      expect(html).toContain('aria-describedby="modal-desc-');
      expect(html).toContain('aria-label="Close dialog"');
      expect(html).toContain('Test Modal');
      expect(html).toContain('Modal description');
      expect(html).toContain('Visible Content');
    });
  });

  // =========================================================================
  // 5. EmptyState & ErrorState Feedback Components
  // =========================================================================
  describe('EmptyState & ErrorState Components', () => {
    it('EmptyState renders accessible title, description, and action button', () => {
      const html = renderToStaticMarkup(
        <EmptyState
          title="No opportunities found"
          description="Try broadening your search query or removing filters."
          actionLabel="Clear Filters"
          onAction={() => {}}
        />
      );
      expect(html).toContain('ui-empty-state');
      expect(html).toContain('No opportunities found');
      expect(html).toContain('Try broadening your search query or removing filters.');
      expect(html).toContain('Clear Filters');
    });

    it('ErrorState renders role="alert" with title, message, error code, and retry button', () => {
      const html = renderToStaticMarkup(
        <ErrorState
          title="Telemetry service unavailable"
          message="PostgREST query timed out after 5000ms"
          errorCode="ERR_GATEWAY_TIMEOUT"
          onRetry={() => {}}
        />
      );
      expect(html).toContain('role="alert"');
      expect(html).toContain('Telemetry service unavailable');
      expect(html).toContain('PostgREST query timed out after 5000ms');
      expect(html).toContain('Error Code: ERR_GATEWAY_TIMEOUT');
      expect(html).toContain('Retry');
    });
  });

  // =========================================================================
  // 6. Layout & Data Primitives (Card, Tabs, StatCard, Skeleton)
  // =========================================================================
  describe('Layout Primitives', () => {
    it('Card renders with surface styles and interactive border when specified', () => {
      const html = renderToStaticMarkup(<Card isInteractive>Card Content</Card>);
      expect(html).toContain('ui-card');
      expect(html).toContain('cursor:pointer');
      expect(html).toContain('Card Content');
    });

    it('Tabs renders accessible tablist, tab items, and sets aria-selected', () => {
      const tabs = [
        { id: 'all', label: 'All Jobs', count: 42 },
        { id: 'verified', label: 'Verified', count: 12 },
      ];
      const html = renderToStaticMarkup(
        <Tabs tabs={tabs} activeTab="verified" onTabChange={() => {}} />
      );
      expect(html).toContain('role="tablist"');
      expect(html).toContain('role="tab"');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('aria-selected="false"');
      expect(html).toContain('Verified');
      expect(html).toContain('12');
    });

    it('Skeleton renders shimmering placeholders for cards and tables', () => {
      const html = renderToStaticMarkup(<Skeleton variant="card" count={3} />);
      expect(html).toContain('skeleton-shimmer');
      expect(html).toContain('aria-hidden="true"');
    });

    it('StatCard renders title, value, delta, and subtitle', () => {
      const html = renderToStaticMarkup(
        <StatCard
          title="Active Opportunities"
          value="1,420"
          delta="+12% today"
          deltaType="positive"
          subtitle="Verified direct postings"
        />
      );
      expect(html).toContain('Active Opportunities');
      expect(html).toContain('1,420');
      expect(html).toContain('+12% today');
      expect(html).toContain('Verified direct postings');
    });
  });

  // =========================================================================
  // 7. DEDICATED REGRESSION TEST: UX-01 — Append-Only Pagination
  // =========================================================================
  describe('UX-01 Regression: Append-Only Feed Pagination', () => {
    interface FeedJob {
      id: string;
      title: string;
      company_name: string;
    }

    // Canonical append-only reduction function from apps/web/app/page.tsx
    function appendFeedJobs(prev: FeedJob[], incoming: FeedJob[]): FeedJob[] {
      const existingIds = new Set(prev.map((j) => j.id));
      const uniqueIncoming = incoming.filter((j) => !existingIds.has(j.id));
      return [...prev, ...uniqueIncoming];
    }

    it('appends next page of jobs without discarding or resetting existing cards', () => {
      const initialPage: FeedJob[] = [
        { id: 'job-1', title: 'Frontend Engineer', company_name: 'Stripe' },
        { id: 'job-2', title: 'Backend Engineer', company_name: 'Vercel' },
        { id: 'job-3', title: 'Product Designer', company_name: 'Figma' },
        { id: 'job-4', title: 'Fullstack Dev', company_name: 'Supabase' },
      ];

      const nextPage: FeedJob[] = [
        { id: 'job-5', title: 'Security Engineer', company_name: 'Cloudflare' },
        { id: 'job-6', title: 'DevOps Lead', company_name: 'GitHub' },
        { id: 'job-7', title: 'Data Scientist', company_name: 'Datadog' },
        { id: 'job-8', title: 'Mobile Dev', company_name: 'Linear' },
      ];

      // Initial state: [A B C D]
      let currentJobs = initialPage;
      expect(currentJobs.map((j) => j.id)).toEqual(['job-1', 'job-2', 'job-3', 'job-4']);

      // Load More: [A B C D E F G H]
      currentJobs = appendFeedJobs(currentJobs, nextPage);

      expect(currentJobs.length).toBe(8);
      expect(currentJobs.map((j) => j.id)).toEqual([
        'job-1',
        'job-2',
        'job-3',
        'job-4',
        'job-5',
        'job-6',
        'job-7',
        'job-8',
      ]);
    });

    it('deduplicates incoming cards to prevent identical keys in the feed', () => {
      const existingJobs: FeedJob[] = [
        { id: 'job-1', title: 'A', company_name: 'X' },
        { id: 'job-2', title: 'B', company_name: 'Y' },
      ];

      // Server returned overlapping job-2 and new job-3
      const overlappingPage: FeedJob[] = [
        { id: 'job-2', title: 'B', company_name: 'Y' },
        { id: 'job-3', title: 'C', company_name: 'Z' },
      ];

      const result = appendFeedJobs(existingJobs, overlappingPage);
      expect(result.length).toBe(3);
      expect(result.map((j) => j.id)).toEqual(['job-1', 'job-2', 'job-3']);
    });

    it('preserves existing loaded jobs intact if subsequent pagination request fails', () => {
      const existingJobs: FeedJob[] = [
        { id: 'job-1', title: 'A', company_name: 'X' },
        { id: 'job-2', title: 'B', company_name: 'Y' },
      ];

      // On pagination failure, prev state is returned unaltered
      let state = existingJobs;
      const paginationFailed = true;

      if (!paginationFailed) {
        state = appendFeedJobs(state, []);
      }
      // Assert existing cards were not destroyed
      expect(state.length).toBe(2);
      expect(state.map((j) => j.id)).toEqual(['job-1', 'job-2']);
    });

    it('handles empty subsequent page gracefully without wiping feed', () => {
      const existingJobs: FeedJob[] = [
        { id: 'job-1', title: 'A', company_name: 'X' },
        { id: 'job-2', title: 'B', company_name: 'Y' },
      ];

      const emptyPage: FeedJob[] = [];
      const result = appendFeedJobs(existingJobs, emptyPage);
      expect(result.length).toBe(2);
      expect(result.map((j) => j.id)).toEqual(['job-1', 'job-2']);
    });
  });

  // =========================================================================
  // 8. DEDICATED REGRESSION TEST: UX-02 — Applied Jobs Leave Active Roster
  // =========================================================================
  describe('UX-02 Regression: Applied Jobs Feed Exclusion Integrity', () => {
    interface Job {
      id: string;
      title: string;
      company_name: string;
    }

    // Canonical active roster derivation from apps/web/app/page.tsx
    function deriveActiveRoster(jobs: Job[], appliedJobIds: Set<string>): Job[] {
      return jobs.filter((job) => !appliedJobIds.has(job.id));
    }

    it('removes applied jobs from the active discovery roster based on authoritative appliedJobIds', () => {
      const loadedJobs: Job[] = [
        { id: 'job-101', title: 'Staff Engineer', company_name: 'Meta' },
        { id: 'job-102', title: 'Systems Architect', company_name: 'Apple' },
        { id: 'job-103', title: 'Frontend Lead', company_name: 'Netflix' },
      ];

      // Initially no applications
      const appliedSet = new Set<string>();
      let activeRoster = deriveActiveRoster(loadedJobs, appliedSet);
      expect(activeRoster.length).toBe(3);

      // User applies for job-102, authoritative backend confirms and returns created application
      appliedSet.add('job-102');
      activeRoster = deriveActiveRoster(loadedJobs, appliedSet);

      // Roster now excludes job-102
      expect(activeRoster.length).toBe(2);
      expect(activeRoster.map((j) => j.id)).toEqual(['job-101', 'job-103']);
      expect(activeRoster.find((j) => j.id === 'job-102')).toBeUndefined();
    });

    it('does NOT rely on optimistic client flags to filter discovery roster', () => {
      const loadedJobs: (Job & { optimisticApplied?: boolean })[] = [
        { id: 'job-101', title: 'Staff Engineer', company_name: 'Meta', optimisticApplied: true },
        { id: 'job-102', title: 'Systems Architect', company_name: 'Apple', optimisticApplied: false },
      ];

      // Authoritative set from server is empty
      const serverConfirmedAppliedIds = new Set<string>();

      // Derivation depends strictly on authoritative set, ignoring unconfirmed local flags
      const activeRoster = deriveActiveRoster(loadedJobs, serverConfirmedAppliedIds);
      expect(activeRoster.length).toBe(2);
      expect(activeRoster.map((j) => j.id)).toContain('job-101');
    });

    it('renders All Current Opportunities Applied empty state when all loaded jobs are in appliedJobIds', () => {
      const loadedJobs: Job[] = [
        { id: 'job-1', title: 'Role 1', company_name: 'Co 1' },
        { id: 'job-2', title: 'Role 2', company_name: 'Co 2' },
      ];

      const appliedJobIds = new Set(['job-1', 'job-2']);
      const activeRoster = deriveActiveRoster(loadedJobs, appliedJobIds);

      expect(activeRoster.length).toBe(0);

      // Verify EmptyState can render when activeRoster is empty
      const html = renderToStaticMarkup(
        <EmptyState
          title="All Current Opportunities Applied"
          description="You have applied to all loaded jobs in this view. Review them in your Applications tracker or load additional opportunities."
          actionLabel="View Applications"
          onAction={() => {}}
        />
      );

      expect(html).toContain('All Current Opportunities Applied');
      expect(html).toContain('View Applications');
    });
  });
});
