# JobPulse 2.0 — Post-Launch Production Pipeline

## Batches K–Y: Workforce Operations, Application Tracking, Automation, Intelligence, UX/UI System & Production Maturity

---

# 0. Pipeline Objective

Batches A–J established the production job ingestion, ATS resolution, salary extraction, taxonomy classification, and search discovery foundation (561/561 tests passing, 24 database migrations deployed).

Batches K–R subsequently extended JobPulse 2.0 from a job aggregation platform into a **workforce / job-search operating system**.

Now, the production roadmap has expanded into the **Maturity Layer (Batches S–Y)**, establishing:

* **S — AI Layer & Provider Architecture**
* **T — Implementation Sequence & Gates**
* **U — Product UX/UI System & Experience Integrity**
* **V — Production Reliability & Observability**
* **W — Security Operations & Disaster Recovery**
* **X — Performance, Capacity & Cost Engineering**
* **Y — Production Acceptance & Launch Certification**

The complete post-launch architecture combines:

* workforce management & multi-tenant organization isolation (Batch K — Deployed)
* application tracking & CRM lifecycle (Batch L — Deployed)
* application screenshot verification & private storage (Batch M — Deployed)
* Google Sheets OAuth integration & durable synchronization (Batches N, O — Deployed & Hardened)
* worker command center (`/worker/*`) (Batch P)
* employer/admin command center (`/admin/*`) (Batch Q)
* operational intelligence & system metrics (Batch R)
* strictly-grounded AI provider layer with cost & token accounting (Batch S)
* disciplined implementation gates & sequence controls (Batch T)
* coherent, operationally truthful UX/UI design system (Batch U)
* production-grade observability & proactive alerting (Batch V)
* operational security, privilege fencing & disaster recovery (Batch W)
* database/crawler performance profiling & capacity engineering (Batch X)
* formal multi-dimensional production acceptance certification (Batch Y)

### The Guiding Architecture

```text
DISCOVERY
    ↓
INGESTION
    ↓
NORMALIZATION
    ↓
VALIDATION
    ↓
DEDUPLICATION
    ↓
ENRICHMENT
    ↓
QUALITY SCORING
    ↓
LIFECYCLE
    ↓
PUBLICATION
    ↓
SEARCH
    ↓
ASSIGNMENT
    ↓
APPLICATION
    ↓
VERIFICATION
    ↓
SYNC
    ↓
ANALYTICS & AI
```

### Cross-Cutting Infrastructure

```text
OBSERVABILITY (Batch V)
SECURITY & AUDIT (Batch W)
DATA QUALITY & HEALTH (Batch R)
AI & PROVIDER ROUTING (Batch S)
PERFORMANCE & CAPACITY (Batch X)
EXPERIENCE INTEGRITY (Batch U)
CERTIFICATION GATES (Batches T, Y)
```

---

# 1. Architectural Principles (Feature Harvest)

## 1.1 One Source of Truth
Every important domain concept has one canonical implementation:
* jobs, companies, ATS platforms, taxonomy, locations, lifecycle, publication, deduplication, source health, applications, user identity, organization membership.
* Competing implementations across frontend, backend, workers, and admin are strictly prohibited.

## 1.2 Operational Truthfulness
The system must never claim something happened when it did not:
```text
crawl dispatched   ≠   crawl completed
jobs exist         ≠   source is healthy
active             ≠   published
sampled metric     ≠   exact metric
```
Every operational state shown in the UI derives from an authoritative source.

## 1.3 Durable Asynchronous Operations
All asynchronous operations must survive process restart, worker crash, deployment, network failure, API timeout, and provider outage via durable database-backed queues and transactional state.

## 1.4 Idempotency
All mutations must be safe to retry: applications, assignments, sync events, Google Sheets writes, verification uploads, enrichment, and crawl runs.

## 1.5 Provenance
Every job, application, and automation action must be traceable to its origin:
> Where did this data come from, when was it observed, and what process changed it?

---

# 2. Current Architecture Inventory

### 2.1 Database State (39 Migrations Deployed, Production Healthy)
* **Core Entities**: `jobs`, `companies`, `company_sources`, `sources`, `job_sources`, `raw_job_payloads`, `ats_platforms`
* **User & Application Entities**: `profiles`, `applications`, `user_preferences`, `user_integrations`, `saved_jobs`, `hidden_jobs`, `outbound_clicks`, `job_alerts`, `job_alert_deliveries`, `job_alert_delivered_jobs`
* **Worker & Ingestion Entities**: `scrape_runs`, `scrape_run_sources`, `scrape_locks`, `job_functions`
* **Workforce & Sync Entities (Batches K–O Deployed)**:
  * `organizations`: Tenant boundary for multi-user operations
  * `organization_members`: Org roles (`owner`, `admin`, `worker`)
  * `worker_profiles`: Structured worker resumes, skills, experience, availability
  * `job_assignments`: Dispatching jobs to workers with deadlines and tracking
  * `application_events`: Immutable event-sourced application lifecycle audit trail
  * `application_verifications`: Proof-of-application screenshot verification records
  * `sync_events`: Durable queue for Google Sheets sync with Postgres `SKIP LOCKED`
* **Storage Buckets**:
  * `verification-screenshots` (Private, signed URL access)
* **Key RPCs Deployed**:
  * `claim_next_pending_sync_events`: Queue consumer claiming with fencing token
  * `complete_sync_event`: Safe completion with `pending_payload` coalescing
  * `fail_sync_event`: Structured error recording and exponential backoff
  * `retry_sync_events_bulk`: Org/personal bulk retry with atomic counter increment
  * `recover_stale_sync_leases`: Automatic recovery of dead worker leases
  * `enqueue_existing_applications_for_sync`: Inactive integration backfill without race conditions
  * `is_admin`, `is_org_admin`, `get_user_org_ids`: RLS security functions

---

# 3. Cross-Cutting Data Models

## 3.1 Canonical Job Identity
Jobs distinguish fields across:
* `job_id`, `company_id`
* `canonical_title`, `display_title`, `description`, `description_html`
* `locations[]`, `remote_type`, `employment_type`, `seniority`, `department`, `role_category`, `skills[]`
* `salary_min`, `salary_max`, `salary_currency`, `salary_interval`
* `source_id`, `source_job_id`, `discovery_url`, `canonical_job_url`, `application_url`, `application_provider`
* `posted_at`, `updated_at`, `first_seen_at`, `last_seen_at`, `last_verified_at`, `expires_at`
* `quality_score`, `lifecycle_state`, `publication_state`
* `raw_payload_hash`, `metadata_hash`

Field completeness is classified into: `KNOWN`, `UNKNOWN`, `UNRESOLVED`.

---

# 4. Company Intelligence Layer

The `companies` entity provides canonical employer identity:
* `id`, `name`, `normalized_name`, `slug`, `domain`, `website`, `careers_url`, `logo_url`, `industry`, `company_size`, `description`, `verified`, `status` (`active`, `inactive`, `pending_verification`), `created_at`, `updated_at`.
* All jobs reference this canonical company identity.

---

# 5. Canonical Taxonomy

Authoritative taxonomy table `job_functions` (deployed in Batch J):
* Covers functions, sub-functions, roles, skills, seniority, employment types, workplace/remote types, locations.
* Powers ingestion normalization, search facets, quality scoring, and worker matching.
* Taxonomy configuration persists to the database with public read and admin write RLS.

---

# 6. Job Lifecycle

Formalized states:
```text
ACTIVE ──> AGING ──> STALE ──> EXPIRED ──> ARCHIVED
  ▲                               │
  └───────── (re-observed) ───────┘
```
Tracked timestamps: `first_seen_at`, `last_seen_at`, `posted_at`, `updated_at`, `last_verified_at`, `expires_at`.
Observed jobs return to `ACTIVE` upon successful complete scrape crawl.

---

# 7. Job Quality Scoring

Formula: `quality_score: 0–100` based on:
1. Freshness (posted date vs now)
2. Description completeness & HTML structure
3. Location precision (country, region, city vs unspecified)
4. Application URL quality (direct ATS vs aggregator)
5. ATS platform resolution confidence
6. Company verification status
7. Salary information presence & validity
8. Remote / workplace type resolution
9. Source reliability & crawl health

---

# 8. Direct Application Intelligence

Every job strictly separates:
* `discovery_url`: Where the job was found (e.g. aggregator, index, Jobright).
* `canonical_job_url`: The permanent public landing page on company domain.
* `application_url`: The direct ATS application form.
* `application_provider`: The underlying ATS engine (`greenhouse`, `lever`, `workday`, `ashby`, etc.).
* `is_direct_apply`: Boolean flag indicating no intermediate interstitial.

---

# 9. Source Health & Ingestion Observatory (Batch R Preview)

Each crawl run records:
* `run_id`, `source_id`, `company_id`, `started_at`, `completed_at`, `duration_ms`, `status` (`running`, `completed`, `failed`, `cancelled`).
* Telemetry: `jobs_discovered`, `jobs_accepted`, `jobs_rejected`, `jobs_inserted`, `jobs_updated`, `jobs_failed`.
* Admin monitors: dispatch succeeded vs crawl succeeded.

---

# 10. Jobright Discovery Pipeline

Preserved model:
```text
GitHub Discovery ──> Jobright Extraction ──> ATS & Canonical URL Resolution ──> Direct Application Resolution ──> Normalization ──> Deduplication ──> Publication
```
Jobright is treated as a Discovery/Enrichment source with full provenance tracking.

---

# 11. Batch K — Worker & Organization Architecture

### Status: COMPLETE, HARDENED & DEPLOYED (Migrations 0030–0032)

### Objective
Multi-tenant workforce management without breaking single-user functionality.

### Tables Deployed
* `organizations`: Tenant boundary for organizations.
* `organization_members`: User membership with `org_role_enum` (`owner`, `admin`, `worker`).
* `worker_profiles`: Professional profile, resume/CV (`cv_url`, `resumes` JSONB), skills, experience, education, availability.
* `job_assignments`: Admin dispatches jobs to workers with status (`assigned`, `in_progress`, `completed`, `skipped`), deadlines, and notes.

### Security
Strict Row Level Security (RLS) and server `AuthGuard`:
* Worker can access only their own worker data, assignments, and applications.
* Admin can access and manage their organization.
* Zero cross-organization leakage.

---

# 12. Batch L — Application Workflow & CRM

### Status: COMPLETE, HARDENED & DEPLOYED (Migration 0033)

### Objective
Unified CRM application tracking with event sourcing.

### Workflow Separation
* `APPLY`: Opens direct application URL and records `outbound_clicks`.
* `MARK APPLIED`: Upserts `applications` record and records immutable `application_events`.
* Duplicate protection: Enforced via `UNIQUE(user_id, job_id)`.

### Lifecycle States
```text
SAVED ──> APPLIED ──> SCREENING ──> INTERVIEW ──> OFFER
                         │              │          │
                         ▼              ▼          ▼
                      REJECTED      WITHDRAWN   ARCHIVED
```

---

# 13. Batch M — Screenshot Verification

### Status: COMPLETE, HARDENED & DEPLOYED (Migration 0034)

### Objective
Provide proof-of-application verification.

### Architecture
* Table: `application_verifications` (`id`, `application_id`, `worker_id`, `organization_id`, `screenshot_url`, `status: pending | verified | rejected`, `reviewed_by`, `reviewed_at`, `notes`).
* Storage Bucket: Private `verification-screenshots` bucket accessed via authenticated signed URLs.

---

# 14. Batch N — Google Sheets Integration

### Status: COMPLETE, HARDENED & DEPLOYED (Migration 0035)

### Objective
OAuth integration with user Google Sheets.

### Architecture
* Reuses `user_integrations` (`provider: 'google_sheets'`).
* Secure token handling: Application-layer AES-256-GCM encryption with IV and authentication tag.
* OAuth flow: `/api/integrations/google/connect`, `/api/integrations/google/callback`, `/api/integrations/google/sheets`.

---

# 15. Batch O — Durable Application Sync Engine

### Status: COMPLETE, HARDENED & DEPLOYED (Migrations 0036–0039)

### Objective
Reliable, asynchronous replication of applications to Google Sheets with hardened concurrency controls, fencing, lease recovery, and structured error handling.

### Architecture & Hardened Invariants
* **Queue Table**: `sync_events` (`id`, `organization_id`, `application_id`, `status: pending | processing | synced | failed | dead_letter`, `attempts`, `last_error`, `payload`, `claim_token`, `claimed_at`, `lease_expires_at`, `pending_payload`, `manual_retry_count`).
* **Postgres SKIP LOCKED Claiming**: Atomic queue claiming using `claim_next_pending_sync_events` with worker claim-fencing UUIDs.
* **Lease Recovery**: `recover_stale_sync_leases` automatically reclaims events abandoned by dead workers with exponential backoff jitter.
* **Pending Payload Coalescing**: Intermediate application edits during in-flight worker claims are coalesced into `pending_payload` without resetting status to `pending`, eliminating state races.
* **Surgical Integrity Pass (O-16 through O-21)**:
  * **O-16 (Atomic Retry TOCTOU)**: Single retry route (`/api/sync/retry`) atomically updates only events with `status IN ('failed', 'dead_letter') AND claim_token IS NULL`.
  * **O-17 (Bulk Retry Limit)**: `retry_sync_events_bulk` atomically increments `manual_retry_count = manual_retry_count + 1` and enforces `manual_retry_count < 5`.
  * **O-18 (Status Invariant on Pending Payload)**: When worker completes and a coalesced `pending_payload` exists, `complete_sync_event` leaves the application status at `pending`, triggering immediate follow-up sync.
  * **O-19 (Inactive Integration Backfill)**: `enqueue_existing_applications_for_sync` safely enqueues without mutating claimed in-flight events.
  * **O-20 (Spreadsheet Rebinding Invariant)**: Rebinding a new spreadsheet does not backfill previously synced applications, preventing row coordinate corruption and silent duplicates.
  * **O-21 (Structured Google API Classification)**: Error classifier maps errors to `transient_quota`, `transient_network`, `permanent_auth`, `permanent_not_found`, or `permanent_schema`.
* **Testing**: 38/38 adversarial tests passing in `tests/batch-o-adversarial-remediation.test.ts`, 13/13 sync engine tests passing.

---

# 16. Batch P — Worker Command Center

### Status: COMPLETE, VERIFIED & TESTED

### Objective
Dedicated operating environment for workers.

### Architecture & Production Deliverables
* **Worker Shell & Navigation**: `/worker/layout.tsx` and `WorkerNav.tsx` with organization context switching, role badge, session guard, and seamless mobile drawer.
* **Assigned Jobs Dispatch (`/worker/jobs`)**: Operating screen supporting status tabs (`all`, `assigned`, `in_progress`, `completed`, `skipped`), priority/deadline alerts, direct apply links with click tracking, skip modals, and complete-and-log workflows.
* **Application & Verification Tracker (`/worker/applications`)**: Multi-stage CRM tracker with screenshot proof upload to private `verification-screenshots` storage, signed URL preview modal, sync engine status badges, and manual retry triggers.
* **Worker Profile & Availability (`/worker/profile`)**: Interactive profile editor managing cloud CV links, skills tags, experience years, education history, preferred roles, target locations, and availability toggles (`immediate`, `two_weeks`, `one_month`, `not_available`).
* **Real-Time Activity Stream (`/worker/activity`)**: Aggregated chronological timeline of assignments received, lifecycle advances, proof submissions/reviews, and Google Sheets synchronization events.
* **Activity Aggregation API (`GET /api/worker/activity`)**: Authenticated endpoint aggregating events with tenant isolation, category filters, and pagination.
* **Testing**: 11/11 tests passing in `tests/batch-p-worker-command-center.test.ts`, zero regressions across workforce security, verification, and sync suites. Next.js production build passes with 41/41 routes static/dynamically generated.

---

# 17. Batch Q — Employer / Admin Command Center

### Objective
Comprehensive multi-tenant workforce and operational command center uniting 5 operational pillars with strict tenant boundary enforcement and zero raw private storage exposure.

### Extended Admin Sections & Delivered Deliverables
* **Multi-Tenant Organization Selector (`AdminOrgSelector`)**: Header organization switcher supporting multi-org employers and platform superadmins, updating URL query parameters with active tenant persistence.
* **Workers Management (`WorkersManagement`)**: Organization workforce roster, profile inspection drawer (skills, experience, CV preview, availability, notes), workload metrics (Assigned, In-Progress, Completed, Skipped), member role modifier dialog, and member removal safeguard.
* **Job Assignment Dispatcher (`JobAssignmentDispatcher`)**: Interactive dispatch modal (worker selector, searchable catalog job picker with UUID direct entry, deadline picker, operational instructions), assignment queue table with status filters, and assignment cancellation controls.
* **Application & Verification Review Queue (`VerificationReviewQueue` & `GET /api/admin/verifications`)**: Multi-tenant review queue with authorized signed storage URL screenshot viewer (`createSignedUrl` with 1h expiration, zero raw storage path leakage), and one-click approve/reject actions with reviewer feedback notes.
* **Sync Engine Monitoring & Retry Controls (`SyncEngineObservatory`)**: Observability into external syncs (`sync_events`), status counts (pending, processing, synced, failed, dead-letter), failure diagnostics modal with raw payload inspector, single-event replay, and bulk retry controls.
* **Source Health & Platform Observatory (`Source & Platform Observatory`)**: Deep operational observatory consolidating scrape telemetry, crawl run inspection, ATS source onboarding wizard, and global scrape triggers.
* **Testing & Build Certification (Certified - Commit `ea7369a`)**:
  - `tests/admin-verifications-api.test.ts`: 5/5 unit tests passed.
  - `tests/batch-q-command-center.test.ts`: 13/13 integration tests passed.
  - `tests/batch-q-authenticated-rls-boundary.test.ts`: 5/5 genuine PostgREST integration tests passed against dedicated non-production instance (`wvyrivmvpcrhwinzmcyy`).
  - Workspace test suite: 37 test files, 403 tests passed (100% pass rate).
  - TypeScript typecheck: 0 errors across 9 packages.
  - Next.js production build: 42/42 routes compiled and statically/dynamically generated with zero errors.

---

# 18. Batch R — Operational Intelligence

### Objective
Authoritative system and workforce analytics.

### Telemetry Modules
1. Workforce Metrics: Active workers, completion rates, verification rates.
2. Job Metrics: Active, new 24h/7d, stale, expired, quality distribution.
3. Source Health Metrics: Success rate, crawl duration, failures, yield.
4. Data Quality Metrics: Missing fields, ATS resolution rate, salary coverage.

---

# 19. Batch S — AI Layer & Provider Architecture (PAUSED)

### Objective
Establish the architectural foundation for AI functionality as an **infrastructure capability**, rather than scattering direct model-provider calls throughout the application.

### Guiding Principles
* **Strict Grounding Rule**: Inputs are strictly restricted to verified worker profile, authentic job description, and explicit user preferences. **Zero hallucination** of qualifications, experience, or history.
* **Deterministic Application Boundaries**: AI features must never bypass database validation, organization boundaries, or RLS.
* **Provider Agnosticism**: Unified provider interface enables switching models without rewriting product features.

### Core Architecture Components
1. **Provider & Model Abstraction**:
   * Abstract interface: `generateText()`, `generateStructured<T>()`, `embed()`.
   * Providers supported: Google Gemini, Anthropic Claude, OpenAI, Local Mock/Fallback.
2. **Capability-Based Routing**:
   * Maps tasks to optimal provider/model tiers:
     * `cv_tailoring`: High-reasoning tier
     * `cover_letter`: High-reasoning tier
     * `screening_questions`: Low-latency tier
     * `job_summary`: Fast tier
     * `taxonomy_classification`: Structured extraction tier
3. **Multi-Provider Fallback Chain**:
   * `Primary (e.g. Gemini 1.5 Pro) ──> Secondary (e.g. Claude 3.5 Sonnet) ──> Tertiary (e.g. GPT-4o-mini) ──> Graceful Degraded Error`
   * Integrated circuit breaker prevents retry loops during provider outages.
4. **Token, Latency & Cost Accounting**:
   * Every AI request records: `provider`, `model`, `input_tokens`, `output_tokens`, `latency_ms`, `estimated_cost_usd`, `user_id`, `organization_id`, `operation_type`.
   * Enables operational cost attribution and per-tenant usage caps.
5. **Structured Outputs with Schema Enforcement**:
   * All generative calls parse outputs against Zod schemas.
   * Parse errors trigger automatic single-turn retry with corrective schema feedback.
6. **Credential Security**:
   * Provider API keys are encrypted at rest using AES-256-GCM / Supabase Vault and managed strictly server-side. Zero client exposure.

---

# 20. Batch T — Implementation Sequence & Gates

### Objective
Establish a formal **process and engineering-control governance layer** to ensure that production changes occur sequentially, deterministically, and with auditable evidence before closure.

### Strategic Roadmap Sequence
```text
K — Schema + RLS + Worker Architecture (COMPLETE & DEPLOYED)
        ↓
L — Application Workflow, CRM & Events (COMPLETE & DEPLOYED)
        ↓
M + N — Screenshot Verification + Google Sheets OAuth (COMPLETE & DEPLOYED)
        ↓
O — Durable Application Sync Engine (COMPLETE & DEPLOYED)
        ↓
P — Worker Command Center
        ↓
Q — Admin Command Center
        ↓
R — Operational Intelligence
        ↓
S — AI Layer & Provider Architecture (PAUSED)
        ↓
T — Implementation Sequence & Gates Governance
        ↓
U — Product UX/UI System & Experience Integrity
        ↓
V — Production Reliability & Observability
        ↓
W — Security Operations & Disaster Recovery
        ↓
X — Performance, Capacity & Cost Engineering
        ↓
Y — Production Acceptance & Launch Certification
```

### Strict Sequencing Rule
> **S → T → U → V → W → X → Y**
> Do NOT skip ahead or combine unrelated batches. Unfinished architectural changes must not accumulate.

### Mandatory 8-Step Batch Gate Checklist
Every production batch must satisfy all 8 gates before closure:
* [x] **1. Typecheck**: TypeScript compiler succeeds across all 8 packages (`pnpm tsc --noEmit`).
* [x] **2. Unit Tests**: Package-level unit tests pass with 100% success rate (`pnpm vitest run`).
* [x] **3. Integration Tests**: End-to-end integration and adversarial tests pass.
* [x] **4. Production Build**: Next.js production build succeeds without warnings (`pnpm build`).
* [x] **5. Migration Safety**: Database migrations are idempotent, forward-compatible, reversible, and verified against production schema.
* [x] **6. Security & RLS**: Row Level Security and negative authorization tests verify zero cross-tenant leakage.
* [x] **7. Observability**: Telemetry, structured logs, and metrics are instrumented.
* [x] **8. Verification Evidence**: Auditable execution report with terminal output proves all criteria are met.

---
# JobPulse 2.0 — Batch U

## Product UX/UI System & Experience Integrity

**Status:** Planned
**Batch:** U
**Type:** Cross-cutting product-quality and UX/UI governance
**Scope:** Entire JobPulse 2.0 product
**Primary objective:** Establish a coherent, production-grade UX/UI system that governs every existing and future JobPulse surface, while ensuring the interface accurately represents backend state, permissions, data quality, and operational reality.

---

# 1. Executive Objective

Batch U establishes the **Product UX/UI Experience Layer** for JobPulse 2.0.

This is not a cosmetic redesign.

The purpose is to ensure that the increasingly sophisticated backend, ingestion pipeline, workforce system, application CRM, verification system, synchronization infrastructure, command centers, and operational intelligence are exposed through a product experience that is:

* coherent
* predictable
* accessible
* responsive
* trustworthy
* operationally truthful
* visually consistent
* state-complete
* permission-aware
* maintainable
* extensible

JobPulse must not evolve into a collection of independently generated screens.

Every feature should feel like it belongs to the same product.

Batch U therefore introduces a formal UX/UI governance layer across the entire application.

---

# 2. Core Principle

The JobPulse architecture should be understood as:

```text
DISCOVERY
    ↓
INGESTION
    ↓
NORMALIZATION
    ↓
VALIDATION
    ↓
DEDUPLICATION
    ↓
ENRICHMENT
    ↓
QUALITY SCORING
    ↓
LIFECYCLE
    ↓
PUBLICATION
    ↓
SEARCH
    ↓
ASSIGNMENT
    ↓
APPLICATION
    ↓
VERIFICATION
    ↓
SYNC
    ↓
ANALYTICS
```

with:

```text
OBSERVABILITY
DATA QUALITY
SOURCE HEALTH
PROVENANCE
SECURITY
RETRY / REPLAY
AUDIT LOGGING
```

and now:

```text
UX/UI EXPERIENCE LAYER
```

The UX/UI layer is cross-cutting.

It does not sit at the end of the pipeline.

Every layer that becomes user-visible must pass through the UX/UI experience system.

---

# 3. UX/UI Engineering Principle

Every feature must satisfy five dimensions:

```text
Backend correctness
        +
Security correctness
        +
Data correctness
        +
Observability correctness
        +
UX/UI correctness
        =
Production-ready feature
```

A feature is not complete merely because:

* the API works
* the database is correct
* the tests pass
* the deployment succeeds

The user must also be able to understand and operate the feature correctly.

---

# 4. Batch U Objectives

Batch U must establish:

1. A canonical JobPulse design system.
2. A reusable component system.
3. A canonical visual language.
4. A complete application screen inventory.
5. Consistent navigation and information architecture.
6. Consistent UX patterns across worker, job seeker, employer, and admin experiences.
7. Complete loading, empty, success, error, unauthorized, stale, and retry states.
8. Responsive behavior across desktop, tablet, and mobile.
9. Accessibility standards.
10. UX security boundaries.
11. Operationally truthful UI.
12. Visual regression protection.
13. Feature integration rules for future batches.
14. A formal UX acceptance gate for every future feature.

---

# 5. Product Personas / Experience Surfaces

The UX audit must explicitly account for all major product roles.

At minimum:

### Job Seeker

Responsible for:

* discovering jobs
* searching/filtering
* viewing job details
* saving jobs
* applying
* tracking applications
* verification
* personal profile/settings

### Worker

Responsible for:

* assigned jobs
* workforce queue
* assignment lifecycle
* application execution
* verification submission
* synchronization
* workload visibility

### Employer / Organization

Responsible for:

* organization management
* worker management
* assignments
* application CRM
* verification review
* workforce visibility
* operational reporting

### Platform Administrator

Responsible for:

* source health
* ingestion
* operational monitoring
* system health
* organizations
* workforce
* application operations
* verification
* analytics
* failures/retries

### Unauthenticated User

Responsible for:

* landing experience
* job discovery
* public job pages
* authentication
* onboarding

The interface must never assume that these personas share identical navigation, permissions, or workflows.

---

# 6. UX/UI Audit of Existing Product

Before introducing new components, perform a comprehensive audit of the current production application.

Inventory:

* routes
* pages
* layouts
* navigation
* dashboards
* forms
* tables
* cards
* modals
* drawers
* dialogs
* filters
* search interfaces
* job pages
* application pages
* worker pages
* organization pages
* admin pages
* authentication
* onboarding
* settings
* error pages
* loading states
* empty states
* mobile layouts

For every surface record:

```text
Route
Persona
Purpose
Primary action
Secondary actions
Data source
Permission requirements
Loading state
Empty state
Error state
Success state
Unauthorized state
Mobile behavior
Accessibility status
Reusable components
UX inconsistencies
```

Do not redesign blindly.

First establish what exists.

---

# 7. Canonical Design System

Create a single source of truth for JobPulse visual design.

The system must define reusable tokens for:

### Typography

* font family
* heading hierarchy
* body text
* labels
* metadata
* captions
* numerical/data typography
* responsive sizing

### Spacing

Establish a consistent spacing scale.

Avoid arbitrary values introduced independently by individual features.

### Layout

Define:

* page containers
* maximum widths
* grids
* columns
* sidebar behavior
* dashboard layouts
* card layouts
* table layouts
* responsive breakpoints

### Visual hierarchy

Define consistent treatment for:

* primary content
* secondary content
* metadata
* warnings
* errors
* success
* system status
* disabled states

### Controls

Standardize:

* buttons
* icon buttons
* links
* inputs
* textareas
* selects
* comboboxes
* checkboxes
* radio buttons
* switches
* date/time controls
* filters

### Feedback

Standardize:

* toast notifications
* alerts
* banners
* inline errors
* confirmation dialogs
* progress indicators

---

# 8. Component Architecture

Identify duplicated UI patterns and consolidate them into reusable components.

At minimum establish canonical patterns for:

```text
Button
Input
Select
Combobox
SearchInput
Filter
Badge
StatusBadge
Card
Table
DataTable
Modal
Dialog
Drawer
Tabs
Tooltip
Dropdown
Pagination
Breadcrumb
Avatar
EmptyState
LoadingState
ErrorState
Skeleton
Alert
Toast
ConfirmationDialog
FormField
PageHeader
SectionHeader
StatCard
Timeline
ActivityFeed
```

Do not create a new component when an existing canonical component already solves the problem.

If an existing component is inadequate, improve the canonical component rather than creating a one-off variant unless there is a documented reason.

---

# 9. Status System

JobPulse contains many stateful systems.

Create a consistent status language across the product.

Examples include:

### Jobs

```text
ACTIVE
AGING
STALE
EXPIRED
ARCHIVED
```

### Assignments

Use the canonical assignment state machine already established by the backend.

### Applications

Use canonical application lifecycle states.

### Verification

```text
PENDING
VERIFIED
REJECTED
```

### Crawls

Distinguish:

```text
DISPATCHED
QUEUED
RUNNING
SUCCEEDED
FAILED
PARTIAL
```

Do not visually collapse different backend states into one generic "success" state.

---

# 10. Operational Truthfulness

This is a mandatory Batch U requirement.

The UI must represent **what actually happened**, not what the frontend hopes happened.

For example:

If a crawl API successfully dispatches a job but the crawl has not completed, the UI must not display:

> Crawl completed

It should display something equivalent to:

> Crawl queued

and subsequently transition based on authoritative backend state.

Likewise:

```text
Dispatch succeeded ≠ Crawl succeeded
Request accepted ≠ Operation completed
Upload started ≠ Upload completed
Application submitted ≠ Application verified
Sync requested ≠ Sync completed
```

Every asynchronous operation must expose the appropriate lifecycle.

This requirement exists specifically to prevent misleading operational interfaces.

---

# 11. State Completeness

Every meaningful interactive surface must account for:

```text
Initial
Loading
Success
Empty
Error
Unauthorized
Forbidden
Not Found
Stale
Retrying
Retry Failed
Disabled
Submitting
Submitted
Processing
Completed
Terminal Failure
```

Not every screen requires every state visually, but every applicable state must be deliberately designed.

No production screen should depend on accidental browser behavior or blank space to communicate state.

---

# 12. Empty States

Empty states must distinguish between different reasons for emptiness.

For example:

```text
No jobs exist
```

is different from:

```text
No jobs match your filters
```

which is different from:

```text
Jobs are still loading
```

which is different from:

```text
You don't have permission to view these jobs
```

which is different from:

```text
The source has temporarily failed
```

Empty states should provide an appropriate next action where one exists.

---

# 13. Error UX

Errors must be understandable and actionable.

Avoid exposing raw:

```text
500 Internal Server Error
```

or raw database errors to users.

Where appropriate provide:

* what happened
* whether user action is required
* retry option
* recovery path
* support/reference identifier when useful

However, never fabricate a successful state to make the interface appear functional.

---

# 14. Authentication and Authorization UX

UI visibility must follow the backend authorization model.

But UI visibility is **not** considered security.

The system must maintain:

```text
UI authorization
+
API authorization
+
RLS authorization
=
defense in depth
```

For every role-sensitive action:

* determine whether the user should see it
* determine whether the user should be able to invoke it
* verify backend enforcement independently

Examples:

* worker-only actions
* organization-admin actions
* platform-admin actions
* application owner actions
* verification reviewer actions

A hidden button is never an authorization boundary.

---

# 15. Navigation Architecture

Audit and standardize:

* primary navigation
* secondary navigation
* contextual navigation
* breadcrumbs
* role-specific navigation
* mobile navigation
* dashboard navigation
* back navigation

Navigation must make the user's current location obvious.

Avoid duplicated or contradictory routes for the same conceptual resource.

Establish canonical destinations.

For example, there should be one authoritative application detail experience rather than multiple competing application views created by separate batches.

---

# 16. Job Discovery UX

Job discovery is one of the primary JobPulse experiences and must receive special attention.

Audit:

* search
* filters
* sorting
* pagination
* saved jobs
* job cards
* job details
* company information
* salary information
* remote/hybrid/on-site representation
* freshness
* source attribution
* application availability
* direct-apply indicators

The UI must accurately represent canonical job data.

Do not reintroduce frontend hacks to compensate for backend pagination, deduplication, or search behavior.

---

# 17. Application UX

The application experience must integrate:

* application lifecycle
* assignments
* CRM events
* verification
* notes
* timestamps
* worker information where authorized
* organization information where authorized

The UI must clearly distinguish:

```text
Applied
Assigned
Processing
Verification pending
Verified
Rejected
Archived
```

and other canonical backend states.

Application event history must be presented as authoritative history.

The frontend must never invent lifecycle events.

---

# 18. Verification UX

The Batch M verification system must receive a first-class experience.

The interface must support:

### Worker

* submission
* screenshot selection/upload
* upload progress
* validation errors
* pending status
* successful submission
* rejection feedback
* retry/new verification where permitted

### Reviewer

* verification queue
* screenshot viewing through authorized signed URLs
* applicant/application context
* approve
* reject
* reviewer notes
* review status
* audit history

The UI must never expose raw private storage URLs.

It must use the authorized signed-URL mechanism established by Batch M.

---

# 19. Workforce UX

The Worker Command Center and Employer/Admin Command Center must not become isolated design systems.

Their future implementation must consume the Batch U primitives.

Standardize:

* assignment cards
* queues
* status indicators
* workload metrics
* worker tables
* application queues
* activity timelines
* filters
* bulk actions
* confirmation flows

---

# 20. Responsive Design

Every production surface must be reviewed at minimum across:

```text
Mobile
Tablet
Desktop
Large Desktop
```

Do not simply scale desktop interfaces down.

Responsive behavior must define:

* navigation transformation
* table behavior
* card stacking
* filter behavior
* modal behavior
* form layout
* action placement
* typography
* spacing
* touch targets

Critical workflows must remain usable on mobile.

---

# 21. Accessibility

Establish a practical accessibility baseline.

At minimum:

* semantic HTML
* keyboard navigation
* visible focus states
* appropriate labels
* accessible form errors
* accessible dialogs
* accessible menus
* appropriate ARIA where required
* sufficient contrast
* non-color-only status communication
* usable touch targets
* screen-reader meaningful labels
* logical heading hierarchy

Accessibility must be incorporated into reusable components rather than manually patched page-by-page.

---

# 22. Data-Dense Interfaces

JobPulse contains operationally dense information.

Tables and dashboards must prioritize:

* hierarchy
* scanning
* filtering
* sorting
* pagination
* responsive behavior
* meaningful column prioritization
* readable metadata
* status clarity

Avoid displaying every available field merely because the backend exposes it.

The UI should optimize for decisions users need to make.

---

# 23. Loading and Performance UX

Establish consistent patterns for:

* skeleton loading
* optimistic updates
* asynchronous actions
* pagination
* search
* route transitions
* background refresh
* polling where applicable

Optimistic UI may only be used where rollback/reconciliation is safe.

Never show an optimistic terminal state when backend confirmation is required.

---

# 24. Visual Regression

Introduce a repeatable mechanism for detecting unintended visual regressions.

At minimum identify critical screenshots/pages for:

* public homepage
* job search
* job detail
* authentication
* application detail
* worker dashboard
* employer dashboard
* admin dashboard
* verification workflow
* mobile navigation

The exact tooling may follow the existing project stack.

The important requirement is that significant visual changes become detectable rather than silently accumulating.

---

# 25. UX Consistency Audit

Search the entire codebase for inconsistent implementations of:

* button styles
* colors
* typography
* spacing
* status badges
* dialogs
* inputs
* loading indicators
* error messages
* tables
* cards
* navigation
* page headers

Produce a remediation inventory.

Prioritize:

```text
P0 — confusing/broken workflow
P1 — major inconsistency affecting usability
P2 — visual inconsistency
P3 — cosmetic refinement
```

Do not spend the majority of the batch polishing low-value cosmetic details while workflow problems remain.

---

# 26. Feature Integration Contract

From Batch U onward, every new batch must document:

```text
Feature
Persona
Route/surface
Primary user action
Existing components reused
New components introduced
States introduced
Permissions
Responsive behavior
Accessibility considerations
Analytics/observability
```

Future batches must not introduce independent visual patterns without justification.

---

# 27. UX Acceptance Gate for Future Batches

Every future batch must pass:

### Functional

* primary workflow works
* edge cases work
* state transitions are understandable

### Visual

* canonical design system used
* no unexplained one-off components
* consistent spacing/typography/status treatment

### Responsive

* mobile verified
* tablet verified
* desktop verified

### Accessibility

* keyboard verified
* focus verified
* labels/errors verified
* contrast/status communication verified

### Operational Truthfulness

* UI reflects authoritative backend state
* asynchronous operations are represented correctly
* failures are not disguised as success

### Security

* UI permissions align with backend permissions
* no sensitive data leaked through UI
* private resources remain private

### Regression

* existing critical workflows remain functional
* visual regression checks pass where configured
* public job discovery remains unaffected

---

# 28. Source-of-Truth Rule

Do not allow the frontend to create competing interpretations of backend truth.

The backend remains authoritative for:

* job identity
* job lifecycle
* application lifecycle
* assignment lifecycle
* verification lifecycle
* organization membership
* permissions
* crawl state
* synchronization state
* audit events

The UI is a projection of that state.

It is not a second state machine.

---

# 29. Anti-Pattern Prohibition

Batch U explicitly prohibits:

### Frontend reserve hacks

Do not manipulate displayed results to compensate for backend issues.

### Fake metrics

Do not fabricate operational metrics for visual completeness.

### Fake success states

Do not report successful completion before authoritative confirmation.

### Local-only state for durable product state

Do not use localStorage as the authoritative source for cloud-persistent product state.

### One-off visual implementations

Do not repeatedly recreate existing UI patterns.

### Hidden authorization

Do not rely on hidden UI controls as security.

### Raw backend errors

Do not expose implementation details unnecessarily.

### Unbounded dashboard density

Do not fill dashboards with metrics merely because metrics exist.

---

# 30. Design Documentation

Create or update a canonical UX/UI documentation area in the repository.

It should contain, as appropriate:

```text
UX/UI Architecture
Design System
Design Tokens
Component Inventory
Component Usage Rules
Navigation Map
Screen Inventory
Persona/Role Matrix
UX State Matrix
Accessibility Guidelines
Responsive Guidelines
UX Acceptance Checklist
Visual Regression Strategy
```

Documentation must be maintained as the product evolves.

---

# 31. Testing Requirements

Batch U must include automated and manual validation where appropriate.

### Automated

At minimum:

* component tests for critical shared components
* accessibility checks where practical
* route rendering checks
* interaction tests for critical workflows
* visual regression tests for selected critical surfaces

### Manual

Verify:

* desktop
* mobile
* keyboard-only navigation
* critical role workflows
* error states
* empty states
* loading states
* authorization states

---

# 32. Production Verification

Before Batch U is closed, verify the actual deployed product.

Do not rely solely on:

```text
npm test
npm run build
typecheck
```

Production verification must include:

* public job discovery
* search
* job detail
* authentication
* application workflow
* worker workflow
* organization workflow
* verification workflow
* admin workflow
* responsive behavior
* authorization boundaries

The deployed application must be tested using real production data wherever safe.

---

# 33. Regression Protection

Batch U must not break the existing platform.

Mandatory regression checks:

* public job discovery remains functional
* search remains functional
* filters remain functional
* pagination remains functional
* canonical job URLs remain functional
* application flows remain functional
* Batch K organization/workforce functionality remains functional
* Batch L application/CRM functionality remains functional
* Batch M verification functionality remains functional
* authentication remains functional
* RLS/security boundaries remain intact

---

# 34. Required Deliverables

Gemini must deliver:

### A. UX Audit

Complete inventory of existing UX/UI surfaces and findings.

### B. Design System

Canonical tokens and reusable primitives.

### C. Component System

Reusable production components and documented usage.

### D. Navigation / Information Architecture

Canonical route and navigation structure.

### E. Screen State Matrix

Documented loading/empty/error/success/unauthorized/stale states.

### F. Persona Matrix

Mapping of product surfaces to user roles.

### G. Responsive Audit

Desktop/tablet/mobile verification.

### H. Accessibility Audit

Critical accessibility findings and remediation.

### I. Operational Truthfulness Audit

Verify that UI states correspond to authoritative backend states.

### J. Visual Regression Strategy

Critical screens and regression mechanism.

### K. Future Batch UX Contract

Reusable acceptance checklist for all future batches.

---

# 35. Required Evidence in Completion Report

Gemini must not report Batch U as complete merely because the UI was redesigned.

The completion report must include:

```text
Commit SHA
Deployment URL
Files/components changed
Design system location
Component inventory
Screen inventory
Navigation changes
Persona coverage
State coverage
Responsive verification
Accessibility verification
Operational-truthfulness verification
Visual regression results
Automated test results
Typecheck result
Production build result
Production verification results
Regression results
Known limitations
```

For every major claim, provide evidence.

---

# 36. Definition of Done

Batch U is CLOSED only when all of the following are true:

* [ ] Product-wide UX/UI audit completed
* [ ] Canonical design system established
* [ ] Reusable component system established
* [ ] Navigation architecture standardized
* [ ] Major personas covered
* [ ] Critical screens inventoried
* [ ] Critical states implemented
* [ ] Error/empty/loading states implemented
* [ ] Authorization UX reviewed
* [ ] Operational truthfulness reviewed
* [ ] Responsive behavior verified
* [ ] Accessibility baseline implemented
* [ ] Verification UX integrated
* [ ] Application UX integrated
* [ ] Workforce UX integrated
* [ ] Admin UX integrated
* [ ] Visual regression strategy established
* [ ] Future-batch UX contract established
* [ ] Existing production workflows regression-tested
* [ ] Typecheck passes
* [ ] Test suite passes
* [ ] Production build passes
* [ ] Production deployment verified
* [ ] No critical P0/P1 UX issues remain
* [ ] No security boundary has been weakened
* [ ] No fake/optimistic terminal states misrepresent backend truth

---

# 37. Scope Discipline

Batch U is broad in impact but must remain disciplined in implementation.

Do not use Batch U as an excuse to:

* rewrite the entire application
* replace the framework
* replace the backend architecture
* redesign database schemas
* redesign authentication
* rewrite unrelated business logic
* introduce unnecessary dependencies
* rebuild working backend systems

The objective is to establish the **experience layer and governance system**, then systematically bring existing surfaces into compliance.

If an existing backend defect is discovered during UX work, document it and fix it only when required for UX correctness or security. Otherwise record it for the appropriate engineering batch.

---

# 38. Implementation Strategy

Recommended sequence:

```text
Phase 1
Production UX audit
        ↓
Phase 2
Information architecture + screen inventory
        ↓
Phase 3
Design tokens
        ↓
Phase 4
Core component system
        ↓
Phase 5
Navigation/layout system
        ↓
Phase 6
Critical existing surfaces
        ↓
Phase 7
Application + verification + workforce surfaces
        ↓
Phase 8
Responsive + accessibility pass
        ↓
Phase 9
Operational truthfulness audit
        ↓
Phase 10
Visual regression + production verification
        ↓
Phase 11
Future-batch UX governance contract
        ↓
Batch U Gate
```

Do not begin with cosmetic polishing.

Start with architecture, consistency, state completeness, and information hierarchy.

---

# 39. Final Architectural Rule

From this point forward, JobPulse features should be developed through two parallel questions:

### Engineering question

> Is the system technically correct?

and:

### Product question

> Does the user experience accurately, clearly, and consistently expose that correctness?

Both answers must be **yes**.

The goal of Batch U is to ensure that as JobPulse grows from a job aggregator into a workforce/job-search operating system, the product does not become a collection of technically sophisticated but disconnected interfaces.

The UX/UI system becomes part of the architecture.

**Backend truth → Product state → UX representation → User action**

That chain must remain intact across every future batch.

---

# 40. Gemini Execution Rule

Do not interpret this specification as authorization to declare Batch U complete based on screenshots, passing tests, or a successful build alone.

The implementation must be independently auditable.

After Gemini reports completion, the implementation will be reviewed against:

1. GitHub source
2. actual deployed application
3. production behavior
4. existing product architecture
5. component consistency
6. authorization behavior
7. backend state representation
8. responsive behavior
9. accessibility
10. regression risk

**Gemini's completion report is evidence, not proof.**

Batch U should only be marked closed after independent verification confirms that the UX/UI system is actually implemented and functioning in production.


---

# JobPulse 2.0 — Batch V

## Production Reliability & Observability

**Status:** Planned
**Batch:** V
**Type:** Production Infrastructure & Operational Observability
**Primary objective:** Transform JobPulse 2.0 into an observable, self-monitoring system where failures are visible, diagnosable, attributable, and recoverable before users report them.

---

# 1. Executive Objective

Batch V addresses the operational reality of running a multi-tenant workforce and job-intelligence platform in production.

As JobPulse processes thousands of jobs, manages multiple tenant organizations, synchronizes with external Google Sheets APIs, and invokes external AI models, silent failures are unacceptable.

Batch V answers the fundamental operational question:
> **Can we know that JobPulse is unhealthy before users report it?**

---

# 2. Application Observability Matrix

Telemetry is instrumented across all critical subsystems:

| Subsystem | Tracked Telemetry | Success Metrics | Failure Indicators |
|---|---|---|---|
| **Ingestion & Crawling** | Sources discovered, processed, rejected; crawl duration; payload size | `success_rate >= 98%`, crawl latency < 45s | Empty crawl, HTTP 429, schema drift |
| **Durable Sync Queue** | Queue depth, claim latency, processing duration, retry attempts | `sync_events` processed < 5s from claim | Stalled leases, dead-letter count > 0 |
| **Worker Operations** | Active workers, assignment completion time, verification submission | Verification turnaround < 24h | Stuck assignments, upload errors |
| **Authentication & Orgs** | Sign-ins, org switches, token refreshes, membership checks | Auth latency < 200ms | Auth failures > 5%, RLS denial spikes |
| **Google Integrations** | Token refreshes, API quotas, sheet writes, append latency | API response < 1200ms | 401 unrecoverable, 429 quota exhaustion |
| **AI Layer (Batch S)** | Requests, prompt/completion tokens, latency, provider fallbacks | 99th percentile latency < 4s | Fallback exhaustion, schema validation fail |
| **Database & RPCs** | Query latency, lock wait duration, active pool connections | Connection pool < 70% | Lock timeouts, slow queries > 500ms |

---

# 3. Structured Failure Attribution

Every operational failure must generate a structured event answering 8 canonical questions:
1. **What failed?** (Exact error code, message, and exception stack).
2. **Where did it fail?** (File, function, route, worker service).
3. **Which operation caused it?** (`ingest_crawl`, `sync_event`, `verify_application`, `ai_completion`).
4. **Who was involved?** (`organization_id`, `user_id`, `worker_id`, `source_id`, `job_id`).
5. **Was it transient or permanent?** (Network timeout vs invalid schema).
6. **Was a retry attempted?** (Attempt number, backoff delay).
7. **Did the retry succeed?** (Outcome of retry sequence).
8. **What final state was persisted?** (`failed`, `dead_letter`, `stale`, `rolled_back`).

---

# 4. Correlation & Structured Logging

* **Request Correlation IDs**: Every inbound API request and scheduled job receives an `x-correlation-id` (or `x-request-id`). This correlation ID propagates to:
  * Database transaction metadata
  * Background worker queues
  * Outbound HTTP calls to Google and AI providers
  * Error logs and exception captures
* **Safe Logging Standards**:
  * Logs must NEVER contain OAuth tokens, refresh tokens, passwords, encryption keys, or raw PII.
  * Sanitizers strip sensitive headers (`Authorization`, `Cookie`) and JSON keys (`access_token`, `refresh_token`, `token`, `secret`).

---

# 5. Proactive Alerting & Health Indicators

1. **Synthetic Health Check (`/api/health`)**:
   * Evaluates database connectivity, queue depth, external provider connectivity, and storage access.
2. **Automated Operational Alerts**:
   * **Stalled Sync Queue Alert**: `sync_events` pending for > 15 minutes.
   * **Dead-Letter Threshold Alert**: Any event transitioning to `dead_letter`.
   * **Crawl Anomaly Alert**: Zero jobs accepted from an active source over 2 consecutive runs.
   * **AI Error Spike Alert**: Provider failure rate > 5% in a 10-minute window.
   * **Stale Lease Alert**: Stale worker leases exceeding 3 consecutive recovery cycles.

---

# JobPulse 2.0 — Batch W

## Security Operations & Disaster Recovery

**Status:** Planned
**Batch:** W
**Type:** Production Security Governance & Business Continuity
**Primary objective:** Harden JobPulse 2.0 against security threats, privilege escalation, tenant leakage, and establish verified disaster recovery capabilities.

---

# 1. Executive Objective

Batch W transforms security from static configuration into an active **operational discipline**.

It answers two non-negotiable questions:
1. **Can any tenant, worker, or unauthorized user access or modify data belonging to another organization?**
2. **If production catastrophic failure occurs right now, can we restore the system to full operational status with zero data loss?**

---

# 2. Operational Security & Privilege Boundaries

### 2.1 Multi-Tenant Isolation Audit
* **RLS Invariant**: Every query touching tenant data (`applications`, `sync_events`, `job_assignments`, `application_verifications`, `worker_profiles`) must enforce `organization_id` isolation.
* **Negative Authorization Suite**: Adversarial tests verify:
  * Worker A cannot view Worker B's assignments or verifications.
  * Org Admin X cannot view Org Y's sync events or worker profiles.
  * Unauthenticated users cannot invoke private RPCs or access internal storage.
  * Service role key is restricted strictly to backend worker services and never exposed in client bundles.

### 2.2 Credential & Secret Management
* **Zero Secrets in Code**: Environment audits ensure all secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`, `AI_PROVIDER_KEYS`, `ENCRYPTION_KEY`) reside in secure environment managers.
* **Zero-Downtime Secret Rotation**:
  * Documented rotation runbooks for Google OAuth client secrets, database credentials, and AES-256-GCM application encryption keys.
  * Dual-key decryption support during rotation windows to ensure uninterrupted service.

---

# 3. Disaster Recovery & Business Continuity

### 3.1 Backup Architecture
* **Point-in-Time Recovery (PITR)**: Supabase continuous WAL archiving enabled with 7-day retention.
* **Daily Logical Backups**: Automated off-site pg_dump snapshots encrypted and stored in secondary cloud storage.

### 3.2 Restoration Runbooks & Drills
* **Verified Restoration**: A backup that has never been restored is not a backup.
* Rehearsed restoration drill runbook:
  1. Spin up staging database target.
  2. Restore latest logical snapshot.
  3. Replay WAL logs to target recovery timestamp.
  4. Verify data integrity across `jobs`, `applications`, `sync_events`, and `profiles`.
  5. Validate RLS policies and role grants on restored instance.

### 3.3 Incident Response Protocol
* Classification:
  * **SEV-1 (Critical)**: Data loss risk, active security exploit, complete sync outage, or cross-tenant leakage. Response SLA < 15 minutes.
  * **SEV-2 (High)**: Ingestion pipeline failure, AI provider degradation, partial worker dispatch outage. Response SLA < 1 hour.
  * **SEV-3 (Moderate)**: Non-blocking UI defect, individual source parse failure. Response SLA < 4 hours.
* Post-Mortem Requirement: Every SEV-1 and SEV-2 requires a blameless post-mortem document covering Root Cause Analysis (RCA), timeline, impact, and preventive remediation items.

---

# JobPulse 2.0 — Batch X

## Performance, Capacity & Cost Engineering

**Status:** Planned
**Batch:** X
**Type:** Efficiency, Scalability & Financial Sustainability
**Primary objective:** Make JobPulse 2.0 technically performant, horizontally scalable, and economically sustainable under real-world load.

---

# 1. Executive Objective

Batch X ensures that system growth does not lead to database degradation, latency spikes, or runaway infrastructure costs.

The core principle:
> **Predictable performance at predictable cost.**

---

# 2. Database Performance Engineering

* **Query Profiling**: Continuous monitoring of `pg_stat_statements` to detect slow queries (> 200ms).
* **Index Audit & Optimization**:
  * Partial indexes on active queue records (`WHERE status = 'pending'`).
  * GIN indexes for JSONB payloads and full-text search on jobs.
  * Composite indexes on high-frequency tenant queries (`organization_id, status, created_at`).
* **Connection Pooling**: Supabase Supavisor / PgBouncer configuration optimized for transaction-mode pooling to prevent connection exhaustion.
* **Query Amplification Prevention**: Eliminate N+1 query patterns in dashboard and worker feeds through targeted batching.

---

# 3. Ingestion & Queue Capacity

* **Crawl Throughput**: Schedule-aware crawling distributes source crawls across time windows to avoid CPU and network spikes.
* **Queue Concurrency Limits**:
  * Bounded worker concurrency per organization to prevent noisy-neighbor starvation.
  * Exponential backoff with jitter to eliminate thundering-herd issues on external API recovery.
* **Payload Truncation & Archiving**: Archive historical sync events (> 90 days) to secondary tables to maintain lean active table sizes.

---

# 4. AI Unit Economics & Cost Control

* **Cost Attribution**: Real-time tracking of AI costs per organization, per user, and per task type.
* **Token Budgeting**: Strict max-token limits on prompt and completion payloads.
* **Semantic Caching**: Cache idempotent AI responses (e.g. standard job summaries, taxonomy classifications) to avoid duplicate provider invocations.
* **Financial Circuit Breaker**: Automatic throttling if daily tenant or system-wide AI spend exceeds pre-configured budget thresholds.

---

# 5. Capacity Degradation Boundaries

Explicit operational limits established and tested:
* Maximum active sources: 1,000 concurrent sources.
* Maximum daily crawl volume: 50,000 jobs/day.
* Maximum sync queue throughput: 100 events/second.
* Maximum tenant organizations: 500 concurrent organizations.
* Performance SLA: 95% of API requests complete under 250ms; 99% under 1000ms.

---

# JobPulse 2.0 — Batch Y

## Production Acceptance & Launch Certification

**Status:** Planned
**Batch:** Y
**Type:** Production Acceptance, Golden Verification & Formal Certification
**Primary objective:** Evaluate JobPulse 2.0 as a complete, unified production system and certify it against rigorous operational criteria.

---

# 1. Executive Objective

Batch Y is the **final certification layer**.

Here, JobPulse stops being evaluated feature-by-feature and is evaluated as a **complete production system**.

It produces the formal production certification and sign-off demonstrating that the platform can withstand real users, real organizations, real production failures, and real operational load.

---

# 2. Multi-Dimensional Acceptance Criteria

JobPulse 2.0 is certified for production launch only when all 8 dimensions pass:

| Dimension | Certification Criteria | Verification Method |
|---|---|---|
| **1. Functional Integrity** | Discovery, ingestion, assignment, application, verification, sync, and AI workflows execute end-to-end without errors. | Automated End-to-End Golden Test Suite |
| **2. Data Integrity** | Zero orphan records, zero schema corruption, consistent foreign key constraints, verified spreadsheet cell mapping. | Database Integrity Audit Script |
| **3. Security & Isolation** | 100% pass on negative authorization tests; zero cross-tenant leakage; all secrets encrypted; least-privilege RLS enforced. | Adversarial Penetration Test Suite |
| **4. Operational Reliability** | Automatic recovery from worker crashes, sync stalls, API rate limits, and network partitions with zero data loss. | Chaos & Failure Injection Testing |
| **5. Observability Coverage** | Every request correlated; structured JSON logs; health check endpoint operational; alerts fire on simulated failures. | Telemetry & Alert Validation Drill |
| **6. Performance SLAs** | P95 latency < 250ms on core APIs; crawler throughput meets daily target; database connection pool stable under load. | Load & Stress Testing (k6 / Artillery) |
| **7. Cost & Capacity** | AI token spend attributed and capped; crawler memory within bounds; DB growth rate predictable. | Financial & Resource Consumption Audit |
| **8. Disaster Recovery** | Database snapshot restored to isolated environment with data completeness verified; recovery runbook validated. | Dry-Run Restoration Drill |

---

# 3. End-to-End Golden Verification Workflow

The golden verification script executes the canonical end-to-end lifecycle:
1. **Ingestion**: Worker crawls a live test source, normalizes jobs, extracts salary, resolves ATS, and inserts canonical job records.
2. **Search**: Public search discovers and filters the newly ingested job.
3. **Dispatch**: Admin assigns the job to a test worker in Organization A.
4. **Application**: Worker views assignment in `/worker/jobs`, applies, marks as applied, generating an application and audit event.
5. **Verification**: Worker uploads application confirmation screenshot; admin reviews and approves in `/admin/verifications`.
6. **Durable Sync**: Event enqueues in `sync_events`, worker claims via `SKIP LOCKED`, writes row to connected Google Sheet, and marks synced.
7. **Adversarial Interruption**: Injected network failure verifies retry with exponential backoff and claim lease recovery.
8. **AI Assistance**: Grounded CV tailoring generates tailored bullets strictly conforming to the verified worker profile and job description.
9. **Isolation Check**: Organization B attempts to view or modify Organization A's records and receives hard 404/403 RLS denial.

---

# 4. Production Launch Gate & Formal Sign-off

Launch certification requires explicit approval across all 8 dimensions:

```text
[ ] Dimension 1: Functional Integrity Verified
[ ] Dimension 2: Data Integrity Verified
[ ] Dimension 3: Security & Tenant Isolation Verified
[ ] Dimension 4: Reliability & Chaos Recovery Verified
[ ] Dimension 5: Observability & Alerting Verified
[ ] Dimension 6: Performance & Capacity Verified
[ ] Dimension 7: AI Cost & Resource Budgets Verified
[ ] Dimension 8: Disaster Recovery Drill Verified
```

Only when all checkboxes are marked with verified evidence will JobPulse 2.0 be formally certified for full-scale production launch.

---

# 21. Production Engineering Rules & Workflow Standards

## 21.1 Database-First Rule
For every change that affects persisted state:
```text
Database/schema ──> Migration ──> RLS ──> Backend ──> Integration ──> Frontend
```
Never build frontend abstractions around database structures that have not been finalized and migrated.

## 21.2 Security Invariants
Never weaken security boundaries to accelerate development:
* Authentication requirements are inviolable.
* Organization isolation is non-negotiable.
* RLS must be active on every tenant table.
* Secrets and private keys are never committed or exposed client-side.
* Client-provided IDs and states are never trusted without server-side validation.

## 21.3 Production Mindset
Treat the live production database and application as real production infrastructure:
* No test data in production tables.
* No bypassing RLS to debug.
* No silent behavioral changes.
* No marking work complete without verifiable evidence.

## 21.4 7-Phase Execution Framework
Every production task must follow this sequence:
1. **Reconnaissance**: Read repository structure, existing migrations, backend services, and active tests.
2. **Gap Analysis**: Identify existing capabilities, missing elements, and architectural risks.
3. **Implementation Plan**: Break work into atomic steps with explicit file and migration targets.
4. **Implementation**: Smallest production-safe surgical change satisfying requirements.
5. **Verification**: Run typecheck, unit tests, integration tests, migrations, and build.
6. **Adversarial Review**: Attempt to break the implementation (race conditions, auth bypass, failure modes).
7. **Closure**: Record evidence, what changed, test results, and update pipeline documentation.
