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
| `/api/integrations/google/sheets` | GET (list sheets) | Authenticated | N |
| `/api/sync/status` | GET | Admin | O |
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
| `sync_events` | Admin-only visibility | org admin check | O |

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

**New table**: `sync_events`
**New enum**: `sync_event_status_enum`
**Reuses**: `claim_next_pending_scrape_run()` pattern, `exponentialBackoff()`, `ScraperRunner` daemon pattern
**Extends**: Worker daemon with sync poll loop
**Key invariant**: Google Sheets failure never causes application data loss

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
