# JobPulse 2.0 — Database Design & Schema Specification

## 1. Schema Topology

The database architecture is designed in PostgreSQL 17 / Supabase to provide strict relational integrity, guaranteed deduplication, flexible provenance tracking, full-text search, and Row Level Security (RLS) enforcement.

```
                          ┌───────────────┐
                          │  auth.users   │
                          └───────┬───────┘
                                  │ (1:1)
                                  ▼
                          ┌───────────────┐
                          │   profiles    │
                          └───────┬───────┘
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      │ (1:N)                     │ (1:N)                     │ (1:N)
      ▼                           ▼                           ▼
┌───────────┐               ┌───────────┐               ┌──────────────┐
│saved_jobs │               │hidden_jobs│               │ applications │
└─────┬─────┘               └─────┬─────┘               └──────┬───────┘
      │                           │                            │
      └───────────────────────────┼────────────────────────────┘
                                  │ (N:1)
                                  ▼
                          ┌───────────────┐       (1:N)       ┌───────────────┐
                          │     jobs      │◄──────────────────┤  job_sources  │
                          └───────┬───────┘                   └───────┬───────┘
                                  │ (N:1)                             │ (N:1)
                                  ▼                                   ▼
                          ┌───────────────┐       (1:N)       ┌───────────────┐
                          │   companies   │◄──────────────────┤    sources    │
                          └───────┬───────┘                   └───────┬───────┘
                                  │ (1:N)                             │ (N:1)
                                  ▼                                   ▼
                          ┌───────────────┐                   ┌───────────────┐
                          │company_sources│                   │ ats_platforms │
                          └───────────────┘                   └───────────────┘
```

---

## 2. Table Catalog

### 2.1 Core Entities

- **`profiles`**: User metadata, application settings, role permissions (`user`, `admin`).
- **`companies`**: Normalized company registry (`id`, `name`, `normalized_name`, `website`, `careers_url`, `logo_url`, `industry`, `status`).
- **`ats_platforms`**: Registry of supported ATS systems (`name`, `slug`, `domains`, `capabilities`, `is_active`).
- **`sources`**: Ingestion sources (`id`, `type`, `name`, `domain`, `adapter_name`, `status`, `metadata`).
- **`company_sources`**: Dynamic mapping between a company and an ATS source (`company_id`, `source_id`, `source_identifier`, `adapter_config`, `health_status`, `consecutive_failures`).

### 2.2 Job & Provenance Entities

- **`jobs`**: Canonical job postings (`id`, `company_id`, `canonical_title`, `display_title`, `description`, `employment_type`, `workplace_type`, `locations`, `salary_min`, `salary_max`, `salary_currency`, `salary_interval`, `skills`, `posted_at`, `first_seen_at`, `last_seen_at`, `expires_at`, `status`, `canonical_url`, `apply_url`, `original_apply_url`, `url_resolution_method`, `url_resolution_confidence`, `search_vector`).
- **`job_sources`**: Ingestion provenance (`job_id`, `source_id`, `external_job_id`, `discovery_url`, `source_job_url`, `raw_payload_hash`, `first_seen_at`, `last_seen_at`, `is_primary`) with `UNIQUE(source_id, external_job_id)`.
- **`raw_job_payloads`**: Raw payload audit trail with parser versioning (`source_id`, `external_id`, `payload`, `payload_hash`, `parser_version`, `fetched_at`).

### 2.3 Operations & Scraper Tracking

- **`scrape_runs`**: Scraper batch telemetry (`started_at`, `completed_at`, `status`, `companies_attempted`, `companies_succeeded`, `companies_failed`, `jobs_discovered`, `jobs_inserted`, `jobs_updated`, `jobs_rejected`, `error_summary`).
- **`scrape_run_sources`**: Granular per-source metrics within a run.

### 2.4 User Interactions (User-Owned State)

- **`saved_jobs`**: Bookmarked jobs (`user_id`, `job_id`, `created_at`) with `UNIQUE(user_id, job_id)`.
- **`hidden_jobs`**: Dismissed jobs from feed (`user_id`, `job_id`, `created_at`) with `UNIQUE(user_id, job_id)`.
- **`applications`**: Application tracking (`user_id`, `job_id`, `status`, `applied_at`, `notes`, `sync_status`, `synced_at`, `created_at`, `updated_at`).
- **`user_preferences`**: Feed preferences, keyword filters, alert settings.
- **`user_integrations`**: External integrations (Google Sheets, Drive, AI) per user.

---

## 3. Database Constraints & Invariants

1. **Uniqueness**:
   - `job_sources(source_id, external_job_id)` ensures duplicate source payloads are safely handled.
   - `saved_jobs(user_id, job_id)` prevents double-saving.
   - `hidden_jobs(user_id, job_id)` prevents duplicate hides.
   - `applications(user_id, job_id)` maintains a single active tracking lifecycle per job.
2. **Foreign Key Integrity**:
   - Cascading deletions are used for user state when a user profile is deleted.
   - Job deletions preserve application history through soft deletion or `ON DELETE SET NULL` constraints.
3. **Data Checks**:
   - `CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max)`.
   - `CHECK (status IN ('active', 'stale', 'expired', 'removed'))`.
   - `CHECK (workplace_type IN ('remote', 'hybrid', 'on_site', 'unspecified'))`.
   - `CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'internship', 'temporary', 'other'))`.

---

## 4. Indexing Strategy

- **Feed Queries**:
  - `CREATE INDEX idx_jobs_feed ON jobs (status, posted_at DESC, id DESC) WHERE status = 'active';`
  - `CREATE INDEX idx_jobs_company ON jobs (company_id);`
  - `CREATE INDEX idx_jobs_workplace ON jobs (workplace_type);`
  - `CREATE INDEX idx_jobs_skills ON jobs USING GIN (skills);`
- **Full-Text Search**:
  - `CREATE INDEX idx_jobs_search_vector ON jobs USING GIN (search_vector);`
- **Keyset Pagination**:
  - Stable sorting using `(posted_at DESC, id DESC)`.
