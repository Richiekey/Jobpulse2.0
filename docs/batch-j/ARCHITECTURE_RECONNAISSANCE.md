# Batch J — Architecture Reconnaissance

## J1 Deliverable: Current System Audit

---

## 1. Current Ingestion Architecture

### Execution Path

```
SOURCE (company_sources row)
  ↓
SCHEDULE (SourceScheduler.filterAndOrderEligibleSources)
  ↓
LOCK (try_acquire_scrape_lock — distributed advisory lock, 15min TTL)
  ↓
DISCOVER (adapter.discover → JobCandidate[])
  ↓
FETCH (adapter.fetch → RawJobPayload)
  ↓
PARSE (adapter.parse → RawJob)
  ↓
NORMALIZE (adapter.normalize → NormalizedJob)
  ↓
VALIDATE (adapter.validate → JobValidationResult)
  ↓
SALARY ENRICH (SalaryExtractor.extractFromText + normalize)
  ↓
DEDUPLICATE (DeduplicationEngine.generateCanonicalFingerprint)
  ↓
STORE (ingest_job_transaction RPC — atomic upsert)
  ↓
RECONCILE (reconcile_company_source_job_lifecycle — only if crawl is complete)
  ↓
TELEMETRY (scrape_run_sources record)
```

### Key Components

| Component | File | Responsibility |
|---|---|---|
| ScraperRunner | `apps/worker/src/engine/runner.ts` | Orchestrates full crawl cycle with locking, scheduling, concurrency |
| IngestionPipeline | `apps/worker/src/engine/pipeline.ts` | Single-candidate 8-stage processing |
| SourceScheduler | `packages/domain/src/scheduler.ts` | Schedule eligibility, priority ordering |
| SourceHealthEngine | `packages/domain/src/health.ts` | Health state machine (healthy → degraded → failing → disabled) |
| JobLifecycleService | `packages/domain/src/job-lifecycle.ts` | Lifecycle reconciliation safety guards |
| DeduplicationEngine | `packages/domain/src/deduplication.ts` | Level-3 canonical fingerprinting |
| SalaryExtractor | `packages/domain/src/salary-extractor.ts` | Salary extraction + normalization + annualization |
| Normalizer | `packages/domain/src/normalizer.ts` | Title, workplace, employment, location, salary, skills normalization |

---

## 2. Existing Adapter Contract

```typescript
interface ATSAdapter {
  readonly platformSlug: string;
  readonly parserVersion: string;
  detect(url: string, html?: string): ATSDetectionResult;
  validateSource(config: CompanySourceConfig): Promise<SourceValidationResult>;
  discover(config: CompanySourceConfig): Promise<JobCandidate[]>;
  fetch(candidate: JobCandidate): Promise<RawJobPayload>;
  parse(rawPayload: RawJobPayload): Promise<RawJob>;
  normalize(rawJob: RawJob, payloadHash: string): Promise<NormalizedJob>;
  validate(job: NormalizedJob): JobValidationResult;
  resolveApplicationUrl(candidate: JobCandidate, raw: RawJob): Promise<string>;
}
```

### Adapter Registry

- `ATSAdapterRegistry` — static Map-based registry with factory pattern
- `ATS_DEFINITIONS` — catalog of known platforms (slug, domains, URL patterns, capabilities)
- `getAdapterForSource()` — safe adapter resolution returning null on failure
- Auto-registration at import time in `packages/ats/src/index.ts`

### Currently Implemented Adapters

| ATS | Slug | File | API Type | Browser Required |
|---|---|---|---|---|
| Greenhouse | `greenhouse` | `greenhouse.adapter.ts` (9.5KB) | Public JSON API | No |
| Lever | `lever` | `lever.adapter.ts` (9.2KB) | Public JSON API | No |
| Ashby | `ashby` | `ashby.adapter.ts` (9.0KB) | Public JSON API | No |
| Jobright | `jobright` | `jobright.adapter.ts` (7.5KB) | Structured data extraction | Yes (cataloged) |

### Cataloged but NOT Implemented

| ATS | Slug | Note |
|---|---|---|
| Workday | `workday` | `isImplemented: false`, `requiresBrowserRendering: true` |

### Adapter Capabilities Model

```typescript
capabilities: {
  hasPublicApi: boolean;
  supportsIncrementalSync: boolean;
  providesStructuredData: boolean;
  requiresBrowserRendering: boolean;
}
```

---

## 3. Existing Source/Company Model

### Company Entity

| Field | Type | Purpose |
|---|---|---|
| id | uuid | Primary key |
| name | text | Display name |
| normalized_name | text | Deterministic search signal |
| slug | text | URL-safe identifier |
| domain | text | Root domain |
| website | text | Company website |
| careers_url | text | Careers page URL |
| logo_url | text | Logo |
| description | text | Description |
| industry | text | Industry classification |
| company_size | text | Size range |
| status | text | active / inactive / pending_verification |
| metadata | jsonb | Extensible metadata |

### Source Entity (sources table)

| Field | Type | Purpose |
|---|---|---|
| id | uuid | Primary key |
| ats_platform_id | uuid FK | Links to ats_platforms |
| type | text | employer_ats / aggregator / job_board / career_site / manual |
| name | text | Source name |
| domain | text | Source domain |
| adapter_name | text | **Key field** — maps to adapter registry slug |
| status | text | healthy / degraded / failing / disabled |
| metadata | jsonb | Extensible |

### Company-Source Config (company_sources table)

| Field | Type | Purpose |
|---|---|---|
| id | uuid | Primary key |
| company_id | uuid FK | Owner company |
| source_id | uuid FK | Links to sources |
| source_identifier | text | Board token / slug (e.g., "stripe") |
| source_url | text | Crawl URL |
| adapter_config | jsonb | ATS-specific config |
| is_active | boolean | Activation flag |
| health_status | text | healthy / degraded / failing / disabled |
| priority | int | Crawl priority (lower = higher) |
| schedule_interval_minutes | int | Crawl frequency |
| consecutive_failures | int | Failure counter |
| last_checked_at | timestamptz | Last crawl attempt |
| last_success_at | timestamptz | Last successful crawl |
| last_failure_at | timestamptz | Last failure |
| last_error | text | Error message |
| last_job_count | int | Jobs found last crawl |
| discovery_method | text | manual / auto_detected / sitemap / api |

### ATS Platforms Table (ats_platforms)

| Field | Type | Purpose |
|---|---|---|
| id | uuid | Primary key |
| name | text | Display name |
| slug | text | Unique identifier |
| domains | text[] | Known domains |
| job_url_patterns | text[] | URL pattern strings |
| is_active | boolean | Active flag |

---

## 4. Current Feed/Filter Architecture

### Feed API: `GET /api/jobs/feed`

**Validated parameters** (Zod schema):

| Param | Type | Current Support |
|---|---|---|
| `limit` | int (1–50) | ✅ |
| `cursor` | string | ✅ Keyset pagination |
| `q` | string (max 200) | ✅ PostgreSQL FTS (websearch) |
| `workplace` | enum | ✅ remote / hybrid / on_site / all |
| `employment` | enum | ✅ full_time / part_time / contract / internship / temporary / other / all |
| `company_id` | uuid | ✅ Single company |
| `salary_min` | number | ✅ Range overlap filter |
| `salary_max` | number | ✅ Range overlap filter |
| `currency` | string | ✅ Currency isolation |
| `has_salary` | boolean | ✅ Salary disclosed |
| `skill` | string (comma-sep) | ✅ GIN array contains |
| `location` | string | ✅ GIN array contains (single value) |
| `posted_after` | ISO datetime | ✅ Date filter |

### Missing Filters (Required for Batch J)

| Filter | Status | Notes |
|---|---|---|
| **Job Function** | ❌ Not implemented | No column, no taxonomy |
| **ATS / Job Board** | ❌ Not implemented | No ATS column on jobs table |
| **Location (multi-select)** | ⚠️ Partial | Single value only, no structured location |
| **Company (multi-select)** | ⚠️ Partial | Single UUID only |
| **Date Posted (preset)** | ⚠️ Partial | Raw ISO datetime, no presets in API |
| **Employment (multi-select)** | ⚠️ Partial | Single value only |
| **Workplace (multi-select)** | ⚠️ Partial | Single value only |

### Pagination

Keyset cursor pagination using `(posted_at DESC, id DESC)` compound sort. Cursor is base64-encoded `{postedAt, id}` pair. Stable and deterministic.

### Sort

Fixed: `posted_at DESC, id DESC`. No alternative sort options.

---

## 5. Existing Search Indexes

| Index | Columns | Type | Where |
|---|---|---|---|
| `idx_jobs_feed` | status, posted_at DESC, id DESC | B-tree | `status = 'active'` |
| `idx_jobs_company_id` | company_id | B-tree | — |
| `idx_jobs_workplace` | workplace_type | B-tree | — |
| `idx_jobs_employment` | employment_type | B-tree | — |
| `idx_jobs_skills` | skills | GIN | — |
| `idx_jobs_locations` | locations | GIN | — |
| `idx_jobs_search_vector` | search_vector | GIN | — |
| `idx_jobs_salary` | salary_min, salary_max | B-tree | `salary_min IS NOT NULL` |
| `idx_jobs_canonical_fingerprint` | canonical_fingerprint | B-tree | — |
| `idx_jobs_status_company_misses` | status, company_id, consecutive_misses | B-tree | — |
| `idx_jobs_annualized_salary` | annualized_min, annualized_max | B-tree | — |
| `idx_jobs_has_salary` | has_salary | B-tree | — |

### Missing Indexes (Required for Batch J)

- **No ATS index** — no column exists yet
- **No job_function index** — no column exists yet
- **No structured location index** — locations is text[] with GIN, but no country/city decomposition

---

## 6. Existing Relevant Migrations

17 migrations (20260829000001 through 20260901000017), covering:

1. Initial schema (tables, enums, indexes, RLS, FTS)
2. Atomic ingestion RPC + deduplication constraints
3. Security hardening (SSRF, RLS, privilege boundaries)
4. Distributed locks + dispatch queue
5. Worker token authorization
6. Company source intelligence (health, scheduling)
7. Transactional onboarding + identity
8. Outbound clicks + application tracking
9. Admin metrics + job lifecycle reconciliation
10. Atomic scrape scheduling
11. Job alerts + notifications
12. Alert delivery idempotency
13. Alert claim lifecycle
14. Salary compensation intelligence
15. Production readiness fixes
16. Security advisor hardening
17. is_admin RLS fix

---

## 7. Existing Test Coverage

### Domain Tests (13 files)

| Test | Coverage Area |
|---|---|
| normalizer.test.ts | Title, workplace, employment, location normalization |
| deduplication.test.ts | Canonical fingerprinting |
| deduplication-match.test.ts | Cross-source duplicate detection |
| salary-extractor.test.ts | Salary parsing + normalization |
| company-model.test.ts | Company slug, domain extraction, normalization |
| job-lifecycle-service.test.ts | Lifecycle reconciliation safety |
| application-lifecycle-service.test.ts | Application state transitions |
| source-scheduler-health.test.ts | Schedule eligibility, health state machine |
| onboarding-service.test.ts | Source onboarding validation |
| alert-matching.test.ts | Alert criteria matching |
| schema-integrity.test.ts | Database type consistency |
| security-privilege-boundaries.test.ts | Security invariants |
| slug-migration-collision.test.ts | Slug uniqueness |

### ATS Tests

| Test | Coverage |
|---|---|
| packages/ats/tests/ | Adapter-specific tests |
| packages/validation/tests/ | Job validation rules |
| packages/url-resolution/tests/ | URL resolution pipeline |

---

## 8. Existing Technical Limitations

### L1 — No ATS column on jobs table
Jobs are linked to sources via `job_sources`, but there's no direct ATS identifier on the `jobs` table. Filtering by ATS requires a join through `job_sources → sources → ats_platforms`.

### L2 — No job function classification
No column, no taxonomy, no classification logic. Titles are normalized but not categorized.

### L3 — Flat location model
Locations are stored as `text[]` — no structured decomposition into country/region/city/remote.

### L4 — Single-value filters
Current API accepts single values for workplace, employment, company. Multi-select requires comma-separated parsing or array parameters.

### L5 — No URL-persistent filter state
Frontend manages filter state in React state, not URL search params.

### L6 — Limited ATS catalog
Only 5 platforms cataloged (4 implemented). Workday cataloged but not implemented.

### L7 — Workday requires browser rendering
The `requiresBrowserRendering: true` flag means Workday can't be crawled with simple HTTP — it uses dynamic JSON APIs behind their career site.

---

## 9. Recommended Extension Points

### E1 — ATS Column on Jobs (Denormalized)
Add `ats_platform_slug text` to `jobs` table. Populate during `ingest_job_transaction`. This avoids expensive joins for feed filtering.

### E2 — Job Function Taxonomy
Add `job_functions` lookup table + `job_function_slug text` column on `jobs`. Classify during normalization using deterministic title-based rules.

### E3 — Structured Location
Add `location_country text`, `location_region text`, `location_city text` columns. Parse during normalization. Keep existing `locations text[]` as raw preservation.

### E4 — Multi-Select Filter Pattern
Change API params to accept comma-separated values: `workplace=remote,hybrid` → split → `IN (...)` query.

### E5 — URL Filter State
Use Next.js `useSearchParams` + `router.push` to persist all filters in URL.

### E6 — Adapter Framework
The existing adapter interface is already generic enough. New ATS adapters just need to implement the same interface. The registry pattern supports auto-registration. **No framework redesign needed.**

### E7 — Company Onboarding
The existing `onboard_company_and_source` RPC + admin API already supports configuration-driven onboarding. Extend with new ATS-specific adapter configs.

### E8 — Worker Infrastructure
The existing polling daemon + queue pattern can handle new ATS sources without modification. Only adapter implementations need to be added.
