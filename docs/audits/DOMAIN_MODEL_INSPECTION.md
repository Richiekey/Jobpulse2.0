# Jobpulse2.0 — Domain / Data Model Inspection

## 1. Flow of Data
* **Source**: E.g., an ATS platform (Greenhouse, Lever) or Jobright aggregator.
* **Company**: Resolved definitively. For direct ATS, the company is known. For aggregators, the true employer is extracted and mapped via `resolveEmployerCompanyId`.
* **Job source**: `company_sources` links a company to a `source`.
* **Candidate**: The raw fetched payload.
* **Parser**: `Adapter.parse()` turns payload into a raw object.
* **Normalization**: `Adapter.normalize()` standardizes titles, extracts locations, skills, and salaries.
* **Eligibility**: `JobEligibilityPolicy.evaluate()` acts as a gate. Rejects non-technical, outdated, or poorly located jobs.
* **Canonical Fingerprint**: Generated from `companyId`, `canonicalTitle`, and `locations` to deduplicate.
* **Database Ingestion**: `ingest_job_transaction` RPC inserts/updates the job.
* **jobs / job_sources**: Inserted or updated atomically.
* **Frontend**: Next.js app queries `jobs` joined with `companies`.

## 2. Key Entities

### Companies (`public.companies`)
* **Ownership**: Backend Worker (creation), Frontend (display)
* **PK/Unique**: `id` (UUID), `slug`, `normalized_name`
* **Status**: `status` (active/inactive/pending)
* **Relations**: 1:N with `jobs`, 1:N with `company_sources`

### Jobs (`public.jobs`)
* **Ownership**: Backend Worker (ingestion)
* **PK**: `id` (UUID)
* **Foreign Keys**: `company_id`
* **Status**: `status` (`job_status_enum`: active, suspect, stale, expired, removed)
* **Lifecycle**: Inserted/Updated by worker. Marked `expired` if stale (>30 days).
* **Search/Indexing**: `search_vector` for FTS. `canonical_fingerprint` for deduplication. `canonical_url` for exact matches.
* **Nullability risks**: `salary_min`, `salary_max` are nullable. Application gracefully handles this by estimating salaries on the frontend.

### Job Sources (`public.job_sources`)
* **Ownership**: Backend Worker
* **PK**: `id`
* **Foreign Keys**: `job_id`, `source_id`
* **Unique**: `(source_id, external_job_id)`
* **Purpose**: Tracks the provenance of a job. Crucial for handling cases where multiple sources find the same job.

### Raw Job Payloads (`public.raw_job_payloads`)
* **Ownership**: Backend Worker
* **Purpose**: Audit trail and debugging for parsed JSON. Historically consumed a lot of storage, prompting the `p_store_raw_payload = false` change.

## 3. Discovered Anomalies & Mismatches
* **Database column `jobs.status`**: Typed as `job_status_enum`. The application tries to assign `TEXT` directly in `ingest_job_transaction`, leading to the 42804 error. This mismatch completely halts ingestion.
* **Jobright Indirect ATS Link**: The application forces Jobright to yield the `direct_ats_url` and promotes it inside the `pipeline.ts` instead of treating Jobright identically to other ATS platforms. This is an application-level assumption not strictly guarded by the DB.
* **Nullable Contradictions**: The RPC accepts `TEXT` for `status` but the DB expects an `enum`.

## 4. Conclusion
The domain model is relatively clean and well normalized. However, the strict enforcement of Enums in PostgreSQL has broken the contract with the `ingest_job_transaction` function due to a recent migration mistake.
