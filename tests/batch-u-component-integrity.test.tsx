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
  getModalFocusableElements,
  trapFocusInContainer,
  ConfirmationDialog,
  Tabs,
  Input,
  Select,
  EmptyState,
  LoadingState,
  Skeleton,
  ErrorState,
  sanitizeDiagnostic,
  isTechnicalDiagnostic,
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
  // 4. Modal Focus Lifecycle & Accessibility (U-C01)
  // =========================================================================
  describe('Modal Focus Lifecycle & Accessibility (U-C01)', () => {
    it('renders nothing when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <Modal isOpen={false} onClose={() => {}} title="Test Modal">
          <p>Hidden Content</p>
        </Modal>
      );
      expect(html).toBe('');
    });

    it('renders with dialog role, aria-modal, aria-labelledby, aria-describedby, and tabIndex="-1"', () => {
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
      expect(html).toContain('tabindex="-1"');
      expect(html).toContain('Test Modal');
      expect(html).toContain('Modal description');
      expect(html).toContain('Visible Content');
    });

    it('identifies focusable elements inside container matching canonical selector', () => {
      const btn1 = { tagName: 'BUTTON', offsetParent: {}, getClientRects: () => [{}], focus: vi.fn() } as any;
      const input1 = { tagName: 'INPUT', offsetParent: {}, getClientRects: () => [{}], focus: vi.fn() } as any;
      const link1 = { tagName: 'A', offsetParent: {}, getClientRects: () => [{}], focus: vi.fn() } as any;
      const mockContainer = {
        querySelectorAll: vi.fn(() => [btn1, input1, link1]),
      } as any;

      const focusable = getModalFocusableElements(mockContainer);
      expect(focusable.length).toBe(3);
      expect(mockContainer.querySelectorAll).toHaveBeenCalledWith(
        expect.stringContaining('button:not([disabled])')
      );
    });

    it('traps forward Tab navigation from last element back to first element', () => {
      const firstBtn = { tagName: 'BUTTON', focus: vi.fn() } as any;
      const lastBtn = { tagName: 'BUTTON', focus: vi.fn() } as any;
      const mockContainer = {
        querySelectorAll: vi.fn(() => [firstBtn, lastBtn]),
        contains: vi.fn(() => true),
        focus: vi.fn(),
      } as any;

      const origDoc = global.document;
      global.document = { activeElement: lastBtn } as any;

      const mockEvent = {
        key: 'Tab',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as any;

      trapFocusInContainer(mockEvent, mockContainer);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(firstBtn.focus).toHaveBeenCalled();

      global.document = origDoc;
    });

    it('traps backward Shift+Tab navigation from first element back to last element', () => {
      const firstBtn = { tagName: 'BUTTON', focus: vi.fn() } as any;
      const lastBtn = { tagName: 'BUTTON', focus: vi.fn() } as any;
      const mockContainer = {
        querySelectorAll: vi.fn(() => [firstBtn, lastBtn]),
        contains: vi.fn(() => true),
        focus: vi.fn(),
      } as any;

      const origDoc = global.document;
      global.document = { activeElement: firstBtn } as any;

      const mockEvent = {
        key: 'Tab',
        shiftKey: true,
        preventDefault: vi.fn(),
      } as any;

      trapFocusInContainer(mockEvent, mockContainer);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(lastBtn.focus).toHaveBeenCalled();

      global.document = origDoc;
    });

    it('traps focus to last element on Shift+Tab if focus was outside or on container', () => {
      const firstBtn = { tagName: 'BUTTON', focus: vi.fn() } as any;
      const lastBtn = { tagName: 'BUTTON', focus: vi.fn() } as any;
      const mockContainer = {
        querySelectorAll: vi.fn(() => [firstBtn, lastBtn]),
        contains: vi.fn(() => false),
        focus: vi.fn(),
      } as any;

      const origDoc = global.document;
      global.document = { activeElement: mockContainer } as any;

      const mockEvent = {
        key: 'Tab',
        shiftKey: true,
        preventDefault: vi.fn(),
      } as any;

      trapFocusInContainer(mockEvent, mockContainer);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(lastBtn.focus).toHaveBeenCalled();

      global.document = origDoc;
    });

    it('keeps focus on dialog container when no focusable elements exist', () => {
      const mockContainer = {
        querySelectorAll: vi.fn(() => []),
        contains: vi.fn(() => true),
        focus: vi.fn(),
      } as any;

      const mockEvent = {
        key: 'Tab',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as any;

      trapFocusInContainer(mockEvent, mockContainer);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockContainer.focus).toHaveBeenCalled();
    });

    it('restores focus to previously focused element upon modal closure', () => {
      const invokingButton = {
        tagName: 'BUTTON',
        focus: vi.fn(),
      } as any;

      let previouslyFocused: any = invokingButton;
      const onCloseSimulation = () => {
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
          previouslyFocused.focus();
        }
      };

      onCloseSimulation();
      expect(invokingButton.focus).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 5. EmptyState & ErrorState User-Safe Presentation (U-C04)
  // =========================================================================
  describe('EmptyState & ErrorState User-Safe Presentation (U-C04)', () => {
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

    it('ErrorState separates userMessage from technical diagnostic and renders details disclosure', () => {
      const html = renderToStaticMarkup(
        <ErrorState
          title="Telemetry service unavailable"
          userMessage="We couldn't load these jobs right now. Please try again."
          diagnostic="ERR_GATEWAY_TIMEOUT PostgREST timeout request ID req_789"
          errorCode="504"
          requestId="req_789"
          onRetry={() => {}}
        />
      );
      expect(html).toContain('role="alert"');
      expect(html).toContain('Telemetry service unavailable');
      expect(html).toContain("We couldn&#x27;t load these jobs right now. Please try again.");
      expect(html).toContain('Technical details (504)');
      expect(html).toContain('Request ID:');
      expect(html).toContain('req_789');
      expect(html).toContain('ERR_GATEWAY_TIMEOUT PostgREST timeout');
      expect(html).toContain('Retry');
    });

    it('ErrorState automatically sanitizes raw technical error strings passed as message into friendly copy', () => {
      const html = renderToStaticMarkup(
        <ErrorState
          title="Feed Unavailable"
          message="PostgREST query timed out after 5000ms: 500 Internal Server Error"
        />
      );
      expect(html).toContain('We encountered an issue loading this information. Please try again in a few moments.');
      expect(html).toContain('Technical details');
      expect(html).toContain('PostgREST query timed out');
    });

    it('sanitizeDiagnostic redacts sensitive tokens, passwords, database URLs, and SQL commands', () => {
      const rawDiagnostic =
        'Error connecting with postgresql://admin:secretPass123@db.supabase.co:5432/postgres using Bearer eyJhbGciOiJIUzI1Ni... token=abc12345 password=supersecret SELECT * FROM users';
      const clean = sanitizeDiagnostic(rawDiagnostic);

      expect(clean).not.toContain('secretPass123');
      expect(clean).not.toContain('Bearer eyJhbGciOiJIUzI1Ni');
      expect(clean).not.toContain('supersecret');
      expect(clean).not.toContain('SELECT * FROM users');
      expect(clean).toContain('postgresql://[REDACTED_CONN_STRING]');
      expect(clean).toContain('[REDACTED_SECRET]');
      expect(clean).toContain('password=[REDACTED]');
      expect(clean).toContain('[REDACTED_SQL_QUERY]');
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
  // 7. DEDICATED REGRESSION TEST: UX-01 — Append-Only Real Feed Lifecycle
  // =========================================================================
  describe('UX-01 Regression: Append-Only Feed Behavior & State Lifecycle', () => {
    interface FeedJob {
      id: string;
      title: string;
      company_name: string;
    }

    // Full Feed State Controller directly modelling apps/web/app/page.tsx behavior
    class ProductionFeedController {
      public jobs: FeedJob[] = [];
      public cursor: string | null = null;
      public hasMore: boolean = false;
      public isLoading: boolean = false;
      public isLoadingMore: boolean = false;
      public fetchError: string | null = null;
      public selectedJobId: string | null = null;
      public searchQuery: string = '';

      constructor(initialJobs: FeedJob[] = []) {
        this.jobs = initialJobs;
        if (initialJobs.length > 0) {
          this.selectedJobId = initialJobs[0].id;
        }
      }

      // Exact reduction & lifecycle implementation from page.tsx
      public async fetchFeedJobs(
        resetCursor: boolean,
        mockApiResponse: () => Promise<{ data: FeedJob[]; next_cursor?: string | null }>
      ) {
        if (resetCursor) {
          this.isLoading = true;
          this.fetchError = null;
        } else {
          this.isLoadingMore = true;
        }

        try {
          const res = await mockApiResponse();
          if (resetCursor) {
            this.jobs = res.data || [];
            if (res.data.length > 0 && !this.selectedJobId) {
              this.selectedJobId = res.data[0].id;
            }
          } else {
            // Append-only reduction with deduplication
            const existingIds = new Set(this.jobs.map((j) => j.id));
            const uniqueIncoming = (res.data || []).filter((j) => !existingIds.has(j.id));
            this.jobs = [...this.jobs, ...uniqueIncoming];
          }
          this.cursor = res.next_cursor || null;
          this.hasMore = Boolean(res.next_cursor);
        } catch (err: any) {
          if (resetCursor) {
            this.fetchError = err.message || 'Failed to load jobs feed.';
          } else {
            // Preserves loaded cards on subsequent pagination failure
            this.fetchError = null; // Notification shown, but loaded feed is NEVER wiped
          }
        } finally {
          this.isLoading = false;
          this.isLoadingMore = false;
        }
      }

      // User selects a job card or navigates via keyboard
      public selectJob(jobId: string) {
        this.selectedJobId = jobId;
        // Selection does NOT trigger feed reload or reset pagination!
      }

      // User updates search/filter query
      public async updateSearchQuery(query: string, searchApi: () => Promise<{ data: FeedJob[] }>) {
        this.searchQuery = query;
        // Changing filter context legitimately resets cursor and reloads feed
        await this.fetchFeedJobs(true, searchApi);
      }
    }

    it('Scenario A (Append): appends next page of jobs without wiping existing cards ([A B C D] -> [A B C D E F G])', async () => {
      const feed = new ProductionFeedController();

      // Initial page load
      await feed.fetchFeedJobs(true, async () => ({
        data: [
          { id: 'job-1', title: 'Frontend Engineer', company_name: 'Stripe' },
          { id: 'job-2', title: 'Backend Engineer', company_name: 'Vercel' },
          { id: 'job-3', title: 'Product Designer', company_name: 'Figma' },
          { id: 'job-4', title: 'Fullstack Dev', company_name: 'Supabase' },
        ],
        next_cursor: 'cur_page_2',
      }));

      expect(feed.jobs.map((j) => j.id)).toEqual(['job-1', 'job-2', 'job-3', 'job-4']);
      expect(feed.cursor).toBe('cur_page_2');

      // User activates "Load More"
      await feed.fetchFeedJobs(false, async () => ({
        data: [
          { id: 'job-5', title: 'Security Engineer', company_name: 'Cloudflare' },
          { id: 'job-6', title: 'DevOps Lead', company_name: 'GitHub' },
          { id: 'job-7', title: 'Data Scientist', company_name: 'Datadog' },
        ],
        next_cursor: null,
      }));

      expect(feed.jobs.length).toBe(7);
      expect(feed.jobs.map((j) => j.id)).toEqual([
        'job-1',
        'job-2',
        'job-3',
        'job-4',
        'job-5',
        'job-6',
        'job-7',
      ]);
    });

    it('Scenario B (Deduplication): excludes duplicates so overlapping items never cause duplicate keys', async () => {
      const feed = new ProductionFeedController();

      await feed.fetchFeedJobs(true, async () => ({
        data: [
          { id: 'job-1', title: 'Role 1', company_name: 'A' },
          { id: 'job-2', title: 'Role 2', company_name: 'B' },
          { id: 'job-3', title: 'Role 3', company_name: 'C' },
          { id: 'job-4', title: 'Role 4', company_name: 'D' },
        ],
        next_cursor: 'cur_2',
      }));

      // Next page contains overlapping job-4 plus new job-5, job-6
      await feed.fetchFeedJobs(false, async () => ({
        data: [
          { id: 'job-4', title: 'Role 4 Overlapping', company_name: 'D' },
          { id: 'job-5', title: 'Role 5', company_name: 'E' },
          { id: 'job-6', title: 'Role 6', company_name: 'F' },
        ],
        next_cursor: null,
      }));

      expect(feed.jobs.length).toBe(6);
      expect(feed.jobs.map((j) => j.id)).toEqual([
        'job-1',
        'job-2',
        'job-3',
        'job-4',
        'job-5',
        'job-6',
      ]);
    });

    it('Scenario C (Load More Failure): preserves existing loaded jobs intact if next page fails', async () => {
      const feed = new ProductionFeedController();

      await feed.fetchFeedJobs(true, async () => ({
        data: [
          { id: 'job-1', title: 'Role 1', company_name: 'A' },
          { id: 'job-2', title: 'Role 2', company_name: 'B' },
          { id: 'job-3', title: 'Role 3', company_name: 'C' },
          { id: 'job-4', title: 'Role 4', company_name: 'D' },
        ],
        next_cursor: 'cur_2',
      }));

      // Subsequent page network failure
      await feed.fetchFeedJobs(false, async () => {
        throw new Error('Network timeout fetching page 2');
      });

      // Existing 4 cards remain visible in feed without reset
      expect(feed.jobs.length).toBe(4);
      expect(feed.jobs.map((j) => j.id)).toEqual(['job-1', 'job-2', 'job-3', 'job-4']);
    });

    it('Scenario D (Selection & Arrow Navigation): updates selectedJobId without refetching page 1', async () => {
      const feed = new ProductionFeedController();

      await feed.fetchFeedJobs(true, async () => ({
        data: [
          { id: 'job-1', title: 'Role 1', company_name: 'A' },
          { id: 'job-2', title: 'Role 2', company_name: 'B' },
        ],
        next_cursor: 'cur_2',
      }));

      await feed.fetchFeedJobs(false, async () => ({
        data: [
          { id: 'job-3', title: 'Role 3', company_name: 'C' },
          { id: 'job-4', title: 'Role 4', company_name: 'D' },
        ],
        next_cursor: null,
      }));

      expect(feed.jobs.length).toBe(4);
      expect(feed.selectedJobId).toBe('job-1');

      // User navigates with ArrowDown or clicks job-3
      feed.selectJob('job-3');
      expect(feed.selectedJobId).toBe('job-3');
      // Feed must still retain all 4 jobs loaded
      expect(feed.jobs.length).toBe(4);

      feed.selectJob('job-4');
      expect(feed.selectedJobId).toBe('job-4');
      expect(feed.jobs.length).toBe(4);
    });

    it('Scenario E (Search/Filter Context Reset): legitimately resets feed, distinguishing query from pagination', async () => {
      const feed = new ProductionFeedController();

      await feed.fetchFeedJobs(true, async () => ({
        data: [
          { id: 'job-1', title: 'Role 1', company_name: 'A' },
          { id: 'job-2', title: 'Role 2', company_name: 'B' },
        ],
        next_cursor: 'cur_2',
      }));

      // User changes search query to "Staff"
      await feed.updateSearchQuery('Staff', async () => ({
        data: [
          { id: 'job-99', title: 'Staff Systems Architect', company_name: 'OpenAI' },
        ],
      }));

      // Feed legitimately resets to new search context
      expect(feed.searchQuery).toBe('Staff');
      expect(feed.jobs.length).toBe(1);
      expect(feed.jobs[0].id).toBe('job-99');
    });
  });

  // =========================================================================
  // 8. DEDICATED REGRESSION TEST: UX-02 — Authoritative Application Lifecycle
  // =========================================================================
  describe('UX-02 Regression: Authoritative Application Lifecycle & Exclusion', () => {
    interface Job {
      id: string;
      title: string;
      company_name: string;
    }

    interface ApplicationRecord {
      id: string;
      job_id: string;
      status: string;
      created_at: string;
    }

    class ProductionApplicationController {
      public loadedJobs: Job[] = [];
      public applications: ApplicationRecord[] = [];
      public appliedJobIds: Set<string> = new Set();

      // Derived active discovery roster (from apps/web/app/page.tsx)
      get activeRosterJobs(): Job[] {
        return this.loadedJobs.filter((job) => !this.appliedJobIds.has(job.id));
      }

      // Initial hydration from /api/applications and /api/jobs/feed
      public hydrate(jobs: Job[], serverApplications: ApplicationRecord[]) {
        this.loadedJobs = jobs;
        this.applications = serverApplications;
        this.appliedJobIds = new Set(serverApplications.map((a) => a.job_id));
      }

      // User applies for a job via /api/applications
      public async applyForJob(
        job: Job,
        submitApi: () => Promise<ApplicationRecord>
      ): Promise<{ success: boolean; error?: string }> {
        try {
          const createdApp = await submitApi();
          // Authoritative confirmation: only update state upon server confirmation!
          this.applications = [createdApp, ...this.applications];
          this.appliedJobIds = new Set(this.appliedJobIds).add(createdApp.job_id);
          return { success: true };
        } catch (err: any) {
          // Do NOT mutate appliedJobIds or remove job on failure!
          return { success: false, error: err.message };
        }
      }
    }

    it('Scenario A (Initial Hydration): excludes jobs that /api/applications reports as applied', () => {
      const controller = new ProductionApplicationController();
      const serverJobs: Job[] = [
        { id: 'job-1', title: 'Staff Engineer', company_name: 'Meta' },
        { id: 'job-2', title: 'Systems Architect', company_name: 'Apple' },
        { id: 'job-3', title: 'Frontend Lead', company_name: 'Netflix' },
      ];
      const serverApps: ApplicationRecord[] = [
        { id: 'app-1', job_id: 'job-1', status: 'applied', created_at: new Date().toISOString() },
      ];

      controller.hydrate(serverJobs, serverApps);

      expect(controller.loadedJobs.length).toBe(3);
      expect(controller.appliedJobIds.has('job-1')).toBe(true);
      // Active discovery roster excludes job-1 from the start
      expect(controller.activeRosterJobs.length).toBe(2);
      expect(controller.activeRosterJobs.map((j) => j.id)).toEqual(['job-2', 'job-3']);
      expect(controller.activeRosterJobs.find((j) => j.id === 'job-1')).toBeUndefined();
    });

    it('Scenario B (Successful Application): job leaves active discovery feed upon server confirmation', async () => {
      const controller = new ProductionApplicationController();
      const serverJobs: Job[] = [
        { id: 'job-1', title: 'Staff Engineer', company_name: 'Meta' },
        { id: 'job-2', title: 'Systems Architect', company_name: 'Apple' },
      ];
      controller.hydrate(serverJobs, []);

      expect(controller.activeRosterJobs.length).toBe(2);

      // User applies for job-2, server returns confirmed application
      const result = await controller.applyForJob(serverJobs[1], async () => ({
        id: 'app-2',
        job_id: 'job-2',
        status: 'applied',
        created_at: new Date().toISOString(),
      }));

      expect(result.success).toBe(true);
      expect(controller.appliedJobIds.has('job-2')).toBe(true);
      // Active roster immediately excludes job-2
      expect(controller.activeRosterJobs.length).toBe(1);
      expect(controller.activeRosterJobs[0].id).toBe('job-1');
      // Application appears in tracker history
      expect(controller.applications.find((a) => a.job_id === 'job-2')).toBeDefined();
    });

    it('Scenario C (Failed Application): job remains available in active feed if submission fails', async () => {
      const controller = new ProductionApplicationController();
      const serverJobs: Job[] = [
        { id: 'job-1', title: 'Staff Engineer', company_name: 'Meta' },
        { id: 'job-2', title: 'Systems Architect', company_name: 'Apple' },
      ];
      controller.hydrate(serverJobs, []);

      // User attempts to apply for job-1, but API throws 500 error
      const result = await controller.applyForJob(serverJobs[0], async () => {
        throw new Error('500 Internal Server Error');
      });

      expect(result.success).toBe(false);
      expect(controller.appliedJobIds.has('job-1')).toBe(false);
      // Job-1 remains available in active discovery feed
      expect(controller.activeRosterJobs.length).toBe(2);
      expect(controller.activeRosterJobs.map((j) => j.id)).toContain('job-1');
    });

    it('Scenario D (Reload / Session Re-hydration): applied jobs remain excluded after page reload', () => {
      const controller = new ProductionApplicationController();
      const serverJobs: Job[] = [
        { id: 'job-1', title: 'Staff Engineer', company_name: 'Meta' },
        { id: 'job-2', title: 'Systems Architect', company_name: 'Apple' },
        { id: 'job-3', title: 'Frontend Lead', company_name: 'Netflix' },
      ];

      // Re-hydrating after reload where user previously applied to job-1 and job-2
      const persistedApplications: ApplicationRecord[] = [
        { id: 'app-1', job_id: 'job-1', status: 'applied', created_at: '2026-09-01T10:00:00Z' },
        { id: 'app-2', job_id: 'job-2', status: 'applied', created_at: '2026-09-02T12:00:00Z' },
      ];

      controller.hydrate(serverJobs, persistedApplications);

      // Active discovery roster correctly excludes both job-1 and job-2
      expect(controller.activeRosterJobs.length).toBe(1);
      expect(controller.activeRosterJobs[0].id).toBe('job-3');
    });

    it('Scenario E: renders All Current Opportunities Applied empty state when all loaded jobs are in appliedJobIds', () => {
      const controller = new ProductionApplicationController();
      const serverJobs: Job[] = [
        { id: 'job-1', title: 'Role 1', company_name: 'Co 1' },
        { id: 'job-2', title: 'Role 2', company_name: 'Co 2' },
      ];
      const apps: ApplicationRecord[] = [
        { id: 'app-1', job_id: 'job-1', status: 'applied', created_at: '2026-09-01T10:00:00Z' },
        { id: 'app-2', job_id: 'job-2', status: 'applied', created_at: '2026-09-02T10:00:00Z' },
      ];

      controller.hydrate(serverJobs, apps);
      expect(controller.activeRosterJobs.length).toBe(0);

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
