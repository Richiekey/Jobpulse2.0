# JobPulse 2.0 — Post-Launch Production Pipeline

## Batches K–R: Workforce Operations, Application Tracking & Automation

---

## Architecture Assessment

> This document captures the finalized K–R roadmap, grounded in a comprehensive audit
> of the existing A–J architecture. No K–R implementation is included — this is the
> locked production pipeline for systematic post-launch execution.

---

## 1. Current Architecture Inventory

### 1.1 Database Tables (20 tables)

| Table | Purpose | K–R Relevance |
|---|---|---|
| `jobs` | Job listings with lifecycle states | Core — job assignment, application target |
| `companies` | Company profiles | Core — employer context |
| `company_sources` | Company ↔ source mapping | Unaffected |
| `sources` | ATS source definitions | Unaffected |
| `job_sources` | Job ↔ source mapping | Unaffected |
| `applications` | **Application tracking** | **Directly reusable for Batch L** |
| `profiles` | User profiles (id, email, full_name, avatar_url, role) | **Extend for Batch K worker profiles** |
| `user_integrations` | Integration configs (provider, config JSONB) | **Directly reusable for Batch N** |
| `user_preferences` | User filter preferences | Extend for worker preferences |
| `saved_jobs` | Saved/bookmarked jobs | Unaffected |
| `hidden_jobs` | Hidden/dismissed jobs | Unaffected |
| `outbound_clicks` | Apply click tracking | **Reusable for Batch L Apply action** |
| `job_alerts` | Alert definitions | Unaffected |
| `job_alert_deliveries` | Alert delivery records | Unaffected |
| `job_alert_delivered_jobs` | Alert ↔ job delivery tracking | Unaffected |
| `scrape_runs` | Scraping execution records | Unaffected |
| `scrape_run_sources` | Per-source scrape results | Unaffected |
| `scrape_locks` | Distributed scrape locking | Unaffected |
| `raw_job_payloads` | Raw ingested payloads | Unaffected |
| `ats_platforms` | ATS platform definitions | Unaffected |

### 1.2 Existing Enums

| Enum | Values | K–R Relevance |
|---|---|---|
| `application_status_enum` | saved, applied, screening, interview, offer, rejected, withdrawn, archived | **Directly matches Batch L lifecycle** |
| `sync_status_enum` | pending, synced, failed | **Directly matches Batch O sync states** |
| `job_status_enum` | active, suspect, stale, expired, removed | Unaffected |

### 1.3 Existing RPCs/Functions (application-relevant)

| Function | Purpose | K–R Relevance |
|---|---|---|
| `is_admin()` | Checks admin role via profiles | **Extend for K4 org-level roles** |
| `handle_new_user()` | Auto-creates profile on auth signup | **Extend for K2 worker onboarding** |
| `ingest_job_transaction()` | Atomic job upsert | Unaffected |
| `claim_next_pending_scrape_run()` | Queue-based work claiming | **Pattern reusable for O sync queue** |
| `try_acquire_scrape_lock()` | Distributed locking | **Pattern reusable for O idempotency** |
| `verify_worker_access()` | Worker token authorization | Unaffected |
| `get_admin_system_metrics()` | System metrics | **Extend for R operational metrics** |
| `onboard_company_and_source()` | Atomic onboarding | Unaffected |
| `reconcile_company_source_job_lifecycle()` | Job lifecycle state machine | Unaffected |
| `claim_undelivered_alert_jobs()` | Alert claim pattern | **Pattern reusable for O sync claims** |
| `mark_alert_jobs_delivered()` | Delivery confirmation | **Pattern reusable for O sync confirmation** |
| `prevent_role_escalation()` | Trigger preventing privilege escalation | **Essential for K4 permissions** |

### 1.4 Existing API Routes

| Route | Methods | Auth | K–R Relevance |
|---|---|---|---|
| `/api/jobs/feed` | GET | Public (anon) | Unaffected |
| `/api/jobs/[id]` | GET | Public (anon) | Unaffected |
| `/api/jobs/[id]/apply` | POST | Authenticated | **Batch L Apply action** |
| `/api/applications` | GET, POST | Authenticated | **Directly reusable for Batch L** |
| `/api/applications/[id]` | GET, PATCH, DELETE | Authenticated | **Directly reusable for Batch L** |
| `/api/saved` | GET, POST, DELETE | Authenticated | Unaffected |
| `/api/companies` | GET | Public | Unaffected |
| `/api/alerts` | GET, POST | Authenticated | Unaffected |
| `/api/alerts/[id]` | GET, PATCH, DELETE | Authenticated | Unaffected |
| `/api/alerts/deliveries` | GET | Authenticated | Unaffected |
| `/api/salaries/benchmarks` | GET | Public | Unaffected |
| `/api/admin/metrics` | GET | Admin | **Extend for Q/R metrics** |
| `/api/admin/sources` | GET, POST | Admin | Unaffected |
| `/api/admin/sources/detect` | POST | Admin | Unaffected |
| `/api/admin/sources/onboard` | POST | Admin | Unaffected |
| `/api/admin/sources/validate` | POST | Admin | Unaffected |
| `/api/admin/scrape/trigger` | POST | Admin | Unaffected |
| `/api/health` | GET | Public | Unaffected |
| `/api/ready` | GET | Public | Unaffected |

### 1.5 Authentication Architecture

| Component | Current State | K–R Impact |
|---|---|---|
| Supabase Auth | Active (email/password, OAuth-ready) | Foundation for K2 worker auth |
| `handle_new_user()` trigger | Creates profile row on signup | Extend for org/worker association |
| `AuthGuard.requireAuthenticatedUser()` | Validates Supabase session | Reusable as-is |
| `AuthGuard.requireAdmin()` | Checks `profiles.role = 'admin'` | **Must extend for K4 org-level roles** |
| `prevent_role_escalation()` | Database trigger on profiles | **Must extend for new roles** |
| `profiles` table | id, email, full_name, avatar_url, role | **Must extend for K3 worker profiles** |

### 1.6 Storage Infrastructure

| Component | Current State | K–R Impact |
|---|---|---|
| Supabase Storage | **No buckets exist** | **Must create for M screenshots** |

### 1.7 Worker Infrastructure

| Component | Current State | K–R Impact |
|---|---|---|
| `ScraperRunner` | Polling daemon with queue-based execution | **Pattern reusable for O sync worker** |
| `GracefulShutdownManager` | Signal handling + task tracking | Reusable for sync worker |
| `claim_next_pending_scrape_run()` | PostgreSQL advisory-lock queue | **Pattern for O sync queue** |
| `pipeline.ts` | Multi-stage ingestion pipeline | Pattern for sync pipeline |
| Exponential backoff (`@jobpulse/shared`) | Bounded retry with jitter | **Directly reusable for O retry** |

### 1.8 Existing Constraints (Application Deduplication)

| Constraint | Definition | K–R Impact |
|---|---|---|
| `uq_user_job_application` | UNIQUE(user_id, job_id) | **Directly implements L3 idempotency** |

---

## 2. Gap Analysis: What Must Be Introduced

### 2.1 New Tables Required

| Batch | Table | Purpose | Notes |
|---|---|---|---|
| K | `organizations` | Org boundary | New entity |
| K | `organization_members` | User ↔ org membership with role | New entity |
| K | `worker_profiles` | Extended profile data (resume, education, etc.) | Separated from `profiles` |
| K | `job_assignments` | Admin assigns jobs to workers | New entity |
| L | `application_events` | Application lifecycle event log | New entity (audit trail) |
| M | `application_verifications` | Screenshot evidence records | New entity |
| N | *(none — extend `user_integrations`)* | Google OAuth tokens | Extend existing `config` JSONB |
| O | `sync_events` | Durable sync queue | New entity (mirrors `scrape_runs` pattern) |

### 2.2 Table Extensions Required

| Table | New Columns | Batch |
|---|---|---|
| `profiles` | `organization_id` (FK) | K |
| `applications` | `worker_id`, `assigned_by`, `verification_status` | K/L/M |
| `user_integrations` | `organization_id`, `encrypted_refresh_token` | N |

### 2.3 New Enums Required

| Enum | Values | Batch |
|---|---|---|
| `org_role_enum` | owner, admin, worker | K |
| `assignment_status_enum` | assigned, in_progress, completed, skipped | K |
| `verification_status_enum` | pending, verified, rejected | M |
| `sync_event_status_enum` | pending, processing, synced, failed, dead_letter | O |

### 2.4 New Storage Buckets Required

| Bucket | Purpose | Access Policy | Batch |
|---|---|---|---|
| `verification-screenshots` | Application evidence images | Worker can upload own; admin can read org | M |
| `resumes` | Worker resume/CV storage | Worker can upload own; admin can read org | K (or P) |

### 2.5 New API Routes Required

| Route | Methods | Auth | Batch |
|---|---|---|---|
| `/api/organizations` | GET, POST | Admin/Owner | K |
| `/api/organizations/members` | GET, POST, PATCH, DELETE | Admin/Owner | K |
| `/api/workers/me` | GET, PATCH | Worker | K |
| `/api/workers/me/profile` | GET, PUT | Worker | K |
| `/api/assignments` | GET, POST, PATCH | Admin (manage), Worker (view own) | K |
| `/api/applications/[id]/verify` | POST | Worker (upload), Admin (review) | M |
| `/api/integrations/google/connect` | GET (initiate OAuth) | Authenticated | N |
| `/api/integrations/google/callback` | GET (OAuth callback) | System | N |
| `/api/integrations/google/sheets` | GET (list sheets), POST (bind sheet) | Authenticated (personal) / Org Admin (org) | N |
| `/api/sync/status` | GET | Worker (own sync status) / Org Member (org sync status) | O |
| `/api/sync/retry` | POST | Worker (own failed events) / Org Admin (org failed events) | O |
| `/api/admin/workers` | GET, POST, PATCH | Admin | Q |
| `/api/admin/assignments` | GET, POST, PATCH | Admin | Q |
| `/api/admin/verifications` | GET, PATCH | Admin | Q |
| `/api/admin/sync` | GET | Admin | Q |
| `/api/admin/analytics` | GET | Admin | R |

### 2.6 New RLS Policies Required

| Table | Policy | Logic | Batch |
|---|---|---|---|
| `organizations` | Org members can view own org | `user_id IN org_members` | K |
| `organization_members` | Members see own org members | `organization_id` match | K |
| `worker_profiles` | Worker sees own; admin sees org | `user_id` or org admin | K |
| `job_assignments` | Worker sees own; admin manages org | `worker_id` or org admin | K |
| `application_events` | Worker sees own app events | `application.user_id` | L |
| `application_verifications` | Worker uploads own; admin reviews org | `worker_id` or org admin | M |
| `sync_events` | Worker & Org Isolation | `auth.uid() = user_id OR is_org_admin(org_id, auth.uid())` | O |

---

## 3. Reusability Matrix

### What Can Be Reused Directly

| Existing Asset | Reused By | Confidence |
|---|---|---|
| `applications` table + schema | L (application workflow) | ✅ High — schema already matches |
| `application_status_enum` | L (lifecycle states) | ✅ High — exact match |
| `sync_status_enum` | O (sync states) | ✅ High — pending/synced/failed |
| `uq_user_job_application` constraint | L3 (duplicate protection) | ✅ High — idempotency built-in |
| `user_integrations` table | N (Google OAuth) | ✅ High — provider + config JSONB |
| `outbound_clicks` table | L1 (Apply tracking) | ✅ High — already tracks clicks |
| `AuthGuard` class | All batches | ✅ High — extend with role checks |
| `claim_next_pending_scrape_run()` pattern | O (sync queue) | ✅ High — proven queue pattern |
| `exponentialBackoff()` from `@jobpulse/shared` | O (retry logic) | ✅ High — already tested |
| `ScraperRunner` daemon pattern | O (sync worker) | ✅ High — proven daemon loop |
| `prevent_role_escalation()` trigger | K4 (permission enforcement) | ⚡ Extend — add new roles |
| `handle_new_user()` trigger | K2 (worker onboarding) | ⚡ Extend — add org association |
| `get_admin_system_metrics()` RPC | R (operational metrics) | ⚡ Extend — add workforce metrics |

### What Must Be Built New

| Component | Batch | Notes |
|---|---|---|
| Organization entity + membership | K | No existing multi-tenant concept |
| Worker profile (extended fields) | K | `profiles` only has name/email/avatar |
| Job assignment system | K | No existing assignment concept |
| Application event log | L | No existing event sourcing for applications |
| Screenshot upload + verification | M | No storage buckets exist |
| Google OAuth flow | N | `user_integrations` exists but no OAuth implementation |
| Sync event queue + worker | O | New — but mirrors existing scrape queue pattern |
| Worker command center UI | P | New pages |
| Employer/admin command center UI | Q | Extends existing admin page |
| Analytics/reporting layer | R | Extends existing metrics RPC |

---

## 4. Architectural Risks

### Risk 1: Multi-Tenancy Retrofit

**Risk**: The current architecture is single-tenant (one admin, users are independent). Adding organizations requires careful retrofitting of `profiles`, `applications`, `user_integrations`, and all RLS policies.

**Mitigation**: K must be designed as a clean additive layer — `organization_id` columns should be nullable initially to preserve backward compatibility with existing single-user flows.

### Risk 2: Worker Profile vs Auth Profile

**Risk**: `profiles` is tightly coupled to `auth.users` via the `handle_new_user()` trigger and the PK is `auth.uid()`. Worker profiles (resume, education, etc.) should NOT live in this table — it conflates identity with application data.

**Mitigation**: Create a separate `worker_profiles` table with a FK to `profiles.id`. The `profiles` table remains the auth-identity record; `worker_profiles` holds application-specific data.

### Risk 3: OAuth Token Security

**Risk**: Google OAuth refresh tokens are highly sensitive. The existing `user_integrations.config` is a plain JSONB column. Storing refresh tokens in plaintext JSONB is a security concern.

**Mitigation**: Options:
1. Use Supabase Vault (if available on the plan) for encrypted secret storage
2. Encrypt tokens at the application layer before storing in JSONB
3. Store tokens server-side only, never expose via RLS SELECT policies

**Decision**: ❓ OPEN — requires plan-level investigation.

### Risk 4: Sync Worker Deployment

**Risk**: The existing worker runs on a dedicated host for scraping. The Google Sheets sync worker needs similar infrastructure. Running two workers increases operational complexity.

**Mitigation**: Extend the existing worker daemon with a second poll loop for sync events, rather than deploying a separate process. The existing `GracefulShutdownManager` already supports multiple concurrent tasks.

### Risk 5: Application Model Extension

**Risk**: The existing `applications` table uses `user_id` as the owner. In a workforce context, the worker is the applicant, but the admin manages assignments. Adding `worker_id` alongside `user_id` could create confusion.

**Mitigation**: In the K–R model, `user_id` becomes the worker's auth ID (workers ARE users). The `assigned_by` column tracks the admin who assigned the job. No column rename is needed — the semantic shift is: `user_id` = the worker who applied.

---

## 5. Batch Dependency Graph

```
Batch A–J (COMPLETE — Production Foundation)
    ↓
Batch K (Worker & Organization Architecture)
    ↓
Batch L (Application Workflow)
    ↓ ↘
Batch M    Batch N
(Screenshots)  (Google Sheets)
    ↓ ↙
Batch O (Application Sync Engine)
    ↓
Batch P (Worker Command Center)
    ↓
Batch Q (Employer Command Center)
    ↓
Batch R (Operational Intelligence)
```

---

## 6. Finalized Batch Specifications

### Batch K — Worker & Organization Architecture

**New tables**: `organizations`, `organization_members`, `worker_profiles`, `job_assignments`
**Modified tables**: `profiles` (add `organization_id`), `applications` (add `assigned_by`)
**New enum**: `org_role_enum`, `assignment_status_enum`
**New RLS**: Organization isolation policies on all new tables
**New APIs**: `/api/organizations/*`, `/api/workers/*`, `/api/assignments`
**Extend**: `handle_new_user()`, `prevent_role_escalation()`, `AuthGuard`
**New auth role**: `worker` (in addition to existing `user` and `admin`)

### Batch L — Application Workflow

**Reuses**: `applications` table (as-is), `application_status_enum`, `uq_user_job_application`, `outbound_clicks`
**New table**: `application_events`
**New API behavior**: Separate Apply (opens URL, records click) from Mark Applied (creates application)
**Key invariant**: Mark Applied is idempotent via existing UNIQUE constraint

### Batch M — Screenshot Verification

**New table**: `application_verifications`
**New enum**: `verification_status_enum`
**New storage bucket**: `verification-screenshots`
**New RLS**: Storage policies + table RLS for org isolation
**New APIs**: `/api/applications/[id]/verify`

### Batch N — Google Sheets Integration

**Reuses**: `user_integrations` table
**New APIs**: `/api/integrations/google/*`
**Security concern**: OAuth token encryption (❓ OPEN)
**No new tables** — extend `user_integrations.config` JSONB

### Batch O — Application Sync Engine

**Status**: Implemented & Hardened (Migrations 0037 & 0038)
**Primary Invariant**: Google Sheets failure never causes application data loss.

#### Architecture & Queue State Machine
Replication to Google Sheets is performed asynchronously via the durable `public.sync_events` database queue. Applications are committed transactionally to PostgreSQL first; changes enqueue sync events that are processed by the worker daemon.

**Queue State Machine Transitions**:
- `pending → processing`: Claimed by worker via `claim_next_pending_sync_events` using PostgreSQL `FOR UPDATE SKIP LOCKED`. Issues `claim_token` and records `processing_started_at`.
- `failed → processing`: Retried after backoff interval elapses.
- `processing → synced`: Successfully replicated to Google Sheet via `complete_sync_event(p_event_id, p_claim_token, p_external_row_id)`.
- `processing → failed`: Transient failure (HTTP 429/5xx, timeouts) via `fail_sync_event(..., p_is_non_retryable = false)`.
- `processing → dead_letter`: Permanent failure (HTTP 400/401/403/404) or `attempts >= max_attempts` via `fail_sync_event(..., p_is_non_retryable = true)`.
- `dead_letter → pending`: Operator/admin manual replay via `POST /api/sync/retry`.

#### Hardened Concurrency & Remediation Invariants
1. **Fencing & Stale-Worker Protection**: `complete_sync_event` and `fail_sync_event` require a matching `claim_token UUID` and `status = 'processing'`. Stale worker completions/failures after a lease expiry are rejected by the database.
2. **`processing → pending` Race Elimination**: When an application is updated while its sync event is in `processing`, the trigger updates `pending_payload` without mutating `status`. Upon completion of the in-flight execution, `complete_sync_event` detects `pending_payload`, records the row ID from the first write, and re-enqueues the event as `pending` with the updated payload. Stale payloads never overwrite newer application states.
3. **Processing Lease Recovery**: Stale processing events older than 5 minutes (`processing_started_at < NOW() - 300s`) are safely recovered by `recover_stale_sync_events`, returning them to retryable status without losing attempt counts.
4. **Existing Application Backfill**: When a user or organization binds a spreadsheet in `POST /api/integrations/google/sheets`, `enqueue_existing_applications_for_sync(integration_id, limit)` identifies all pre-existing applications and enqueues them for background synchronization idempotently and boundedly.
5. **Integration Ownership Immutability**: Each sync event is permanently bound to the `integration_id` snapshot captured at enqueue. Changing or reconnecting integrations does not mutate pending events.
6. **Error Classification**:
   - *Retryable*: HTTP 429, 500, 502, 503, 504, `ETIMEDOUT`, `ECONNRESET`, network failures.
   - *Non-Retryable*: HTTP 400 (malformed), 401 (invalid/revoked token), 403 (insufficient permissions), 404 (spreadsheet not found). Non-retryable errors immediately transition to `dead_letter`.
7. **Authorization Model**:
   - `GET /api/sync/status`: Authenticated workers can view their own personal sync counts and recent events; organization members can view their organization's sync events (`?organizationId=...`). Non-members receive 403.
   - `POST /api/sync/retry`: Workers can retry their own failed/dead_letter events; Organization Admins can batch retry organization events. Replaying `pending`, `processing`, or `synced` events is rejected with 400. Manual replay preserves automatic retry history and enforces a maximum of 5 manual replays.
8. **Known Scalability Constraint**: Google Sheets Column-A lookup (`values/Sheet!A:A`) provides reliable O(N) row deduplication for individual and SMB volumes (<10,000 rows). For enterprise scales exceeding Google Sheets limits, bulk batch sync or direct database export should be scheduled.

### Batch P — Worker Command Center

**New UI pages**: `/worker/jobs`, `/worker/applications`, `/worker/profile`, `/worker/activity`, `/worker/integrations`
**Reuses**: Existing component patterns from homepage/admin
**No new tables** — consumes K–O APIs

### Batch Q — Employer Command Center

**Extends**: Existing `/admin` page
**New UI sections**: Worker management, assignment management, verification review, sync monitoring
**Reuses**: Existing admin API patterns
**New APIs**: `/api/admin/workers`, `/api/admin/assignments`, `/api/admin/verifications`

### Batch R — Operational Intelligence

**Extends**: `get_admin_system_metrics()` RPC
**New APIs**: `/api/admin/analytics`
**Key principle**: Metrics derive from authoritative data, no duplicated counting logic
**No new tables** — aggregate queries on existing K–Q tables

---

## 7. Open Questions

| ID | Question | Impact | Status |
|---|---|---|---|
| Q1 | Which Supabase plan features are available? (Vault, Edge Functions, etc.) | N — OAuth token encryption strategy | ❓ OPEN |
| Q2 | Should organizations support multiple admins from launch, or start with single-owner? | K — complexity vs. MVP | ❓ OPEN |
| Q3 | Should the sync worker be a separate process or integrated into the existing scraper daemon? | O — deployment topology | ⚡ PROVISIONAL: Integrated |
| Q4 | Should worker profiles support multiple resumes/CVs? | K3 — schema design | ❓ OPEN |
| Q5 | What Google Sheets column mapping should be used for synced applications? | O — sync payload design | ❓ OPEN |
| Q6 | Should screenshots be stored with expiring signed URLs or permanent storage? | M — storage cost vs. auditability | ❓ OPEN |

---

## 8. Execution Protocol

```
OBSERVE LIVE SYSTEM (current)
        ↓
BATCH K — Schema + RLS + API + Tests
        ↓
BATCH L — Workflow + Integration Tests
        ↓
BATCH M + N — Parallel (independent)
        ↓
BATCH O — Sync Engine + Worker Extension
        ↓
BATCH P — Worker UI
        ↓
BATCH Q — Admin UI Extension
        ↓
BATCH R — Analytics Layer
```

Each batch follows the mandatory gate:

```
┌─────────────────────────────┐
│        BATCH GATE           │
├─────────────────────────────┤
│ Typecheck        ✅         │
│ Tests            ✅         │
│ Lint             ✅         │
│ Production Build ✅         │
│ Database         ✅         │
│ RLS/Security     ✅         │
│ Integration      ✅         │
│ Regression       ✅         │
└─────────────────────────────┘
```

---

## 9. Cross-Batch Engineering Rules

1. **Don't break existing architecture** — reuse domain services, lifecycle, Supabase patterns, RPCs, auth, storage, worker, observability, validation
2. **Database first** — Schema → Constraints → RLS → Domain → API → Worker → UI → Tests
3. **Security is mandatory** — worker data, org isolation, resumes, screenshots, OAuth, Sheets, applications
4. **Everything asynchronous must be durable** — survive restart, crash, network failure, API timeout, outage, deployment
5. **Idempotency everywhere** — applications, sync events, Sheets writes, screenshot uploads, assignments

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
