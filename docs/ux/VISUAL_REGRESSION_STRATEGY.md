# JobPulse 2.0 — Visual & UX Regression Testing Strategy
**Document ID:** `DOCS-UX-REGRESSION-STRATEGY-2026-09`  
**Governance Scope:** Batch U Phase 5 Deliverable  
**Target Application:** `@jobpulse/web`  

---

## 1. Executive Summary & Philosophy

A robust user experience cannot rely solely on automated unit tests, nor can it depend entirely on ad-hoc manual clicking. Automated assertions prove state transitions, DOM attributes, pagination bounds, and accessibility properties; manual human inspection evaluates layout balance, typographic rhythm, optical alignment, and tactile feel.

This strategy establishes a dual-tier verification matrix covering the 10 most critical surfaces in JobPulse 2.0.

> **Cardinal Rule:** Do not claim that a unit test or snapshot proves visual quality. A green test suite proves behavioral integrity; visual consistency and responsiveness must be verified through disciplined visual inspection across standard viewports.

---

## 2. The Verification Boundary: Automated vs. Manual

```
┌────────────────────────────────────────────────────────────┐
│                    Automated Verification                  │
├────────────────────────────────────────────────────────────┤
│  ✓ Component rendering & DOM markup truthfulness           │
│  ✓ Deterministic state transitions (INITIAL -> SUCCESS)   │
│  ✓ Accessibility attributes (aria-*, roles, hidden icons) │
│  ✓ Append-only pagination behavior (UX-01)                 │
│  ✓ Authoritative backend state exclusion (UX-02)           │
│  ✓ Semantic status mapping & color class associations      │
│  ✓ Form input handling, disabled states, loading spinners  │
└─────────────────────────────┬──────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────┐
│                     Manual Verification                    │
├────────────────────────────────────────────────────────────┤
│  ✓ Visual hierarchy & typographic scale across devices     │
│  ✓ Visual consistency with canonical Design System tokens  │
│  ✓ Information density and scan-ability on dense tables    │
│  ✓ Spacing rhythm (4px grid adherence, padding symmetry)   │
│  ✓ Responsive usability at 375px, 768px, and 1280px+       │
│  ✓ Keyboard focus ring visibility & modal dismissal feel   │
│  ✓ Contrast ratios under bright and dark lighting contexts │
└────────────────────────────────────────────────────────────┘
```

---

## 3. Surface Verification Matrix (10 Critical Surfaces)

### Surface 1: Public Job Discovery Feed (`apps/web/app/page.tsx`)
* **Automated Verification:**
  - Initial load renders skeleton placeholders.
  - Success state renders list of `JobFeedCard` items.
  - Append-only pagination (UX-01): `fetchFeedJobs(false)` appends without replacing; preserves prior cards on network failure.
  - Authoritative roster filtering (UX-02): `activeRosterJobs` excludes jobs present in `appliedJobIds`.
  - Empty search results render canonical `EmptyState` with filter reset action.
* **Manual Verification:**
  - Card elevation, border subtle contrast against `--bg-app`.
  - Hover states on job cards feel responsive without layout shift.
  - Load More button centered with smooth loading indicator.
  - Viewports: 375px (single column feed), 768px (narrow drawer), 1280px (two-pane inspector).

### Surface 2: Search & Filter Experience (`components/FiltersSidebar.tsx`)
* **Automated Verification:**
  - Input field updates query params and debounces fetch.
  - Filter checkboxes correctly toggle Set membership.
  - Reset action clears all active filters.
* **Manual Verification:**
  - Filter group collapsible animation and spacing.
  - Mobile bottom-sheet drawer slide-in and dismiss touch targets.
  - Badge counters on active filter pills align neatly.

### Surface 3: Job Details & Inspector (`components/JobDetailsModal.tsx` & `JobInspectorPane.tsx`)
* **Automated Verification:**
  - `Modal` mounts with `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
  - ESC key dismisses modal; backdrop click dismisses modal.
  - "Apply" CTA opens application tracking workflow.
* **Manual Verification:**
  - Typography in job description maintains readable line length (`max-w-[70ch]`).
  - Company logo fallback avatar renders cleanly.
  - Sticky bottom apply bar on mobile screens does not obscure content.

### Surface 4: Authentication & Onboarding
* **Automated Verification:**
  - Unauthenticated access to protected routes redirects with `returnUrl`.
  - Auth state hydration sets user context without flash of incorrect UI.
* **Manual Verification:**
  - Form field focus states show visible outline ring (`--focus-ring`).
  - Error messages render below offending input with clear danger text.

### Surface 5: Worker Available Jobs (`apps/web/app/worker/jobs/page.tsx`)
* **Automated Verification:**
  - Stat cards display authoritative pool counts.
  - Table rows render assignment status with canonical `StatusBadge`.
  - Skip and Complete modal dialogs mount with accessible dialog semantics.
* **Manual Verification:**
  - Dense assignment table scrolls horizontally with `.table-responsive-container` on mobile.
  - Action buttons (`Complete Application`, `Skip`) have sufficient touch target (min 44x44px).

### Surface 6: Worker Verification & Upload
* **Automated Verification:**
  - File upload drag-and-drop handles `.png`, `.jpg`, `.pdf` extensions.
  - Submitting state disables upload button and displays spinner.
  - Verification submission sends authoritative payload.
* **Manual Verification:**
  - Upload dropzone border dashes visually animate on drag-over.
  - Screenshot preview thumbnail preserves aspect ratio without distortion.

### Surface 7: Admin Operational Intelligence (`components/admin/OperationalIntelligenceView.tsx`)
* **Automated Verification:**
  - Metric cards render value, change delta, and trend.
  - Error states handle failed telemetry queries gracefully.
* **Manual Verification:**
  - Number formatting (thousands separators, currency symbols) renders consistently.
  - Visual hierarchy: primary KPI numbers significantly larger than secondary labels.

### Surface 8: Admin Verification Review Queue (`components/admin/VerificationReviewQueue.tsx`)
* **Automated Verification:**
  - Queue items display status badges (`pending`, `verified`, `rejected`).
  - Review actions (`approve`, `reject`) trigger authoritative API mutation.
  - Reject modal requires feedback notes before enabling submit.
* **Manual Verification:**
  - Screenshot evidence lightbox displays full-resolution image with zoom controls.
  - Contrast of reviewer notes versus background surface.

### Surface 9: Sync Engine Observatory (`components/admin/SyncEngineObservatory.tsx`)
* **Automated Verification:**
  - Job status accurately reflects lifecycle: `DISPATCHED` ≠ `RUNNING` ≠ `SUCCEEDED` ≠ `FAILED`.
  - Dead letter queue items show danger status and retry affordance.
* **Manual Verification:**
  - Timeline view connector lines align vertically between event nodes.
  - Live pulse animation on in-flight sync jobs is subtle and non-distracting.

### Surface 10: Mobile Navigation & Global Layout (`components/Header.tsx`)
* **Automated Verification:**
  - Navigation links have appropriate `aria-current="page"` when active.
  - Mobile menu toggles visibility and traps keyboard focus when open.
* **Manual Verification:**
  - Header blur backdrop (`backdrop-filter: blur(12px)`) renders smoothly on scroll.
  - Active tab underline indicator transitions smoothly between routes.

---

## 4. Viewport Verification Protocol

Every manual certification pass must inspect the application at three standard responsive break-points:

| Breakpoint | Target Device | Primary Focus Areas |
| :--- | :--- | :--- |
| **375px** | Mobile phone (iPhone SE / Android) | Stacked layouts, mobile drawer navigation, bottom sheets, touch target sizing (≥44px), horizontal scroll prevention on body. |
| **768px** | Tablet / Small Laptop (iPad portrait) | Two-column responsive grids, collapsible sidebars, table horizontal overflow containers. |
| **1280px+** | Desktop (Standard / Wide Monitor) | Three-pane inspector view, dense data tables, persistent sidebars, optimal typographic line measure. |

---

## 5. Pre-Certification Checklist

Before certifying Batch U (or any future UX batch), the following steps must be completed:

1. [ ] Automated test suite passes (`tests/batch-u-component-integrity.test.tsx`).
2. [ ] Monorepo typecheck passes (`pnpm run typecheck`).
3. [ ] Full build succeeds without hydration mismatches (`pnpm run build`).
4. [ ] Manual walkthrough across all 10 surfaces at 375px, 768px, and 1280px+.
5. [ ] Accessibility keyboard audit (tab order, visible focus rings, ESC modal dismissal).
6. [ ] Proof of UX-01: Load More pagination appends without discarding cards.
7. [ ] Proof of UX-02: Server-confirmed applied jobs vanish from active discovery feed.
