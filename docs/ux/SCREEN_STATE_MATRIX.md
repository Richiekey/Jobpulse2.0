# JobPulse 2.0 — Screen State Matrix & Lifecycle Specifications
**Document ID:** `DOCS-UX-STATE-MATRIX-2026-09`  
**Governance Scope:** Batch U Phase 0 Deliverable  
**Target Application:** `@jobpulse/web`  

---

## 1. Overview & Semantic Invariants

To guarantee operational truthfulness across the user experience, every interactive screen in JobPulse 2.0 must explicitly handle a standard set of interface states. No component may invent fake state, show optimistic terminal success prior to server confirmation, or swallow network failures.

### The Canonical State Hierarchy

```
┌──────────────────────────────────────────────────────────────┐
│                    Authoritative State                       │
│      (Derived from HTTP status / DB record / Server payload) │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                      UI State Mapping                        │
├──────────────────────────────┬───────────────────────────────┤
│ Lifecycle (Ephemeral)        │ Lifecycle (Terminal)          │
│  - INITIAL                   │  - SUCCESS                    │
│  - LOADING                   │  - EMPTY                      │
│  - SUBMITTING                │  - ERROR                      │
│  - RETRYING                  │  - TERMINAL_FAILURE           │
│  - QUEUED / RUNNING          │  - UNAUTHORIZED / FORBIDDEN   │
│  - STALE                     │  - SUCCEEDED / FAILED         │
└──────────────────────────────┴───────────────────────────────┘
```

---

## 2. Universal State Definitions

| State | Semantic Meaning | Required UI Behavior | Recovery / Next Affordance |
| :--- | :--- | :--- | :--- |
| `INITIAL` | Surface mounted, data fetch not yet initiated or awaiting hydration. | Low-opacity background skeleton or initial layout frame. | Transitions automatically to `LOADING`. |
| `LOADING` | Authoritative data is being fetched over the network. | Shimmer skeleton matching data shape (stat card, feed card, table row). Never a generic full-page blocker if partial UI can render. | Cancel request or await response. |
| `SUCCESS` | Server returned valid data with non-empty payload. | Full data presentation with interactive affordances and canonical status badges. | Refresh / filter / paginate. |
| `EMPTY` | Server query succeeded with valid 200 OK, but zero records exist. | Canonical `EmptyState` component indicating *why* it is empty (no records vs no filter matches). | CTA to clear filters or create entity. |
| `ERROR` | Non-fatal network, serialization, or client error occurred. | Canonical `ErrorState` or inline `Alert` with explanatory message and retry button. Loaded state must be preserved. | Retry button; back navigation. |
| `UNAUTHORIZED` | User has no active session (HTTP 401). | Informative prompt directing user to sign in, preserving intended destination via `returnUrl`. | Login button / OAuth trigger. |
| `FORBIDDEN` | User is authenticated but lacks required role or org membership (HTTP 403). | Lock badge, user email, clear explanation of required permission. No raw stack trace. | Switch organization / Return home. |
| `STALE` | Displayed data is known to be out of date (e.g. background job dispatch triggered). | Subtle status banner or indicator with timestamp of last successful sync. | "Refresh Now" action button. |
| `RETRYING` | Automatic or manual retry loop in progress (e.g. exponential backoff). | Animated spinner with retry attempt counter (`Attempt 2 of 5...`). | Abort / Cancel retry. |
| `SUBMITTING` | Mutation in-flight to backend (e.g. apply, skip, review decision). | Target button shows spinner; disabled state to prevent duplicate clicks. | No action until server resolves. |
| `TERMINAL_FAILURE` | Operation failed and cannot be recovered via automatic retry (e.g. sync dead-letter). | High-visibility danger badge, root-cause error message, manual override action. | Dead-letter replay / Admin intervention. |

---

## 3. Surface-by-Surface State Matrix

### 3.1 Public Job Discovery (`/`, `apps/web/app/page.tsx`)

| State | Active Feed Trigger | Visual Representation & Behavior |
| :--- | :--- | :--- |
| `INITIAL` | Page load / URL parsing | Header and filter sidebar render immediately; feed displays 4 card skeletons. |
| `LOADING` (Initial) | Filters changed or initial fetch | Feed area shows 4 shimmer `Skeleton` cards. Filter sidebar remains interactive. |
| `LOADING` (Load More) | User clicks "Load More Jobs" | **UX-01 Rule**: Existing cards `[A..D]` remain fully interactive; button shows spinner and text "Loading More...". |
| `SUCCESS` | Feed API returns jobs array | **UX-02 Rule**: Active feed renders `jobs.filter(j => !appliedJobIds.has(j.id))`. Applied jobs excluded. |
| `EMPTY` (No matches) | 0 jobs matching active filters | `EmptyState` with `Search` icon, "No matching jobs found", and "Reset All Filters" CTA. |
| `EMPTY` (All applied) | All returned jobs already applied | `EmptyState` with `CheckSquare` icon, "You've applied to all current jobs!", and link to Applications tab. |
| `ERROR` (Initial) | Feed API fails on initial load | `ErrorState` banner with server message and primary "Retry" button. |
| `ERROR` (Load More) | Feed API fails on subsequent page | **UX-01 Rule**: Previously loaded cards are preserved; a toast error is emitted; "Load More" button resets to active. |

---

### 3.2 Worker Assigned Jobs Queue (`/worker/jobs`, `apps/web/app/worker/jobs/page.tsx`)

| State | Assignment Lifecycle Trigger | Visual Representation & Behavior |
| :--- | :--- | :--- |
| `ASSIGNED` | Backend assignment created | `StatusBadge` type `info` ("Assigned"). Primary action: "Start Assignment". |
| `IN_PROGRESS` | Worker starts job execution | `StatusBadge` type `warning` ("In Progress"). Primary actions: "Apply & Complete", "Skip". |
| `SUBMITTING` | Submitting completion or skip | Modal buttons show loading spinner; keyboard/pointer interactions locked to avoid race conditions. |
| `COMPLETED` | Server confirms completion | `StatusBadge` type `success` ("Completed"). Disabled / read-only terminal state. |
| `SKIPPED` | Worker skipped assignment | `StatusBadge` type `neutral` ("Skipped"). Reason displayed in notes popover. |
| `EMPTY` | Zero assignments in active tab | `EmptyState` with `Briefcase` icon: "No assignments found in this view". |
| `ERROR` | API fetch or mutation failure | High-contrast `ErrorState` alert banner with retry affordance. No raw browser `alert()`. |

---

### 3.3 Worker Application Verification (`/worker/applications`, `apps/web/app/worker/applications/page.tsx`)

| State | Verification Lifecycle Trigger | Visual Representation & Behavior |
| :--- | :--- | :--- |
| `PENDING` | Application recorded, no review yet | `StatusBadge` type `warning` ("Pending Verification"). Upload affordance active. |
| `SUBMITTING` | Uploading screenshot to storage | Progress bar showing percentage or spinner; upload button disabled. |
| `VERIFIED` | Admin approved verification | `StatusBadge` type `success` ("Verified"). Green checkmark and reviewer note. |
| `REJECTED` | Admin rejected verification | `StatusBadge` type `danger` ("Rejected"). Red indicator, reviewer rejection feedback, re-upload CTA. |
| `ERROR` | Storage bucket or upload failure | Inline warning alert with error details (file size limit 5MB, format PNG/JPEG). |

---

### 3.4 Admin Operational Intelligence (`/admin?tab=overview`, `OperationalIntelligenceView.tsx`)

| State | Telemetry Trigger | Visual Representation & Behavior |
| :--- | :--- | :--- |
| `LOADING` | Module 1 & 2 metrics fetching | 6 shimmer `StatCard` skeletons. Window selector buttons disabled. |
| `SUCCESS` | Aggregates returned | Standard `StatCard` components with trend indicators, error distribution tables, turnaround metrics. |
| `EMPTY` | Zero activity in chosen window | Informative `EmptyState`: "No operational events recorded in the selected time window (24h/7d/30d)". |
| `ERROR` | Metrics RPC fails | `ErrorState` with error code, message, and immediate "Retry" button. |

---

### 3.5 Admin Verification Review Queue (`/admin?tab=review`, `VerificationReviewQueue.tsx`)

| State | Review State Trigger | Visual Representation & Behavior |
| :--- | :--- | :--- |
| `LOADING` | Queue items fetching | Shimmer rows in table format. |
| `PENDING_REVIEW` | Screenshot present, unreviewed | Item in review table with "Review Proof" action. Signed URL pre-fetched. |
| `SUBMITTING` | Decision in-flight (Approve/Reject) | Action button shows spinner; review modal controls disabled. |
| `SUCCESS` | Review confirmed by server | Row removed from pending queue or updated to "Verified"/"Rejected" with reviewer stamp. |
| `EMPTY` | Zero pending verifications | `EmptyState` with `ShieldCheck` icon: "Verification queue is clear! All worker submissions have been reviewed." |

---

### 3.6 Admin Sync Engine Observatory (`/admin?tab=sync`, `SyncEngineObservatory.tsx`)

| State | Asynchronous Sync Event State | Visual Representation & Behavior |
| :--- | :--- | :--- |
| `QUEUED` (`pending`) | Event inserted into sync queue | `StatusBadge` type `warning` ("Queued"). Displays attempt count `0/5`. |
| `RUNNING` (`processing`) | Daemon actively dispatching to Google Sheets | `StatusBadge` type `info` with animated spinner ("Syncing..."). |
| `SUCCEEDED` (`synced`) | Authoritative 200 OK from Google Sheets | `StatusBadge` type `success` ("Synced"). Synced timestamp and row reference. |
| `FAILED` (`failed`) | Transitive failure (e.g. rate limit) | `StatusBadge` type `danger` ("Retrying"). Next retry timestamp displayed. |
| `TERMINAL_FAILURE` (`dead_letter`) | Retries exhausted (5/5 attempts failed) | `StatusBadge` type `danger` with Skull icon ("Dead Letter"). Manual "Replay Sync" CTA. |

---

### 3.7 Admin Scrape Runs Table (`/admin?tab=runs`, `RecentScrapeRunsTable.tsx`)

| State | Scrape Job Lifecycle State | Visual Representation & Behavior |
| :--- | :--- | :--- |
| `QUEUED` (`pending`) | Scrape run queued in database | `StatusBadge` type `neutral` ("Queued"). |
| `RUNNING` (`running`) | Crawler process actively executing | `StatusBadge` type `info` with spinner ("Running"). Live elapsed duration counter. |
| `SUCCEEDED` (`completed`) | Scrape job finished successfully | `StatusBadge` type `success` ("Completed"). Extracted job count and total runtime. |
| `FAILED` (`failed`) | Crawler encountered fatal error | `StatusBadge` type `danger` ("Failed"). Error message summary and stack view. |
