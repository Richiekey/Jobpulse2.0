# Jobpulse2.0 — Cross-System Reconstruction & Root Cause Reconciliation (Pass 11 & 12)

## 1. Cross-System Flow & Constraints
The lifecycle of data spans multiple independent systems:
1. **GitHub (Jobright)**: Acts as the source of truth for certain job lists.
2. **Worker (`ScraperRunner`)**: Periodically wakes up, queries the ATS/GitHub endpoints.
3. **Domain Core**: Maps data. Crucially, tests rely on hardcoded dates, meaning deterministic tests failed when the system clock passed a 14-day window. (This was reconstructed and fixed in the test suite).
4. **Supabase (Database)**: Holds data using strictly typed Enums (`job_status_enum`) and executes `ingest_job_transaction`.
5. **Next.js Web**: Displays the data based on complex joins.

## 2. Root Cause Reconciliation of Incident #1
* **Symptom**: Complete ingestion failure and "zero yield" alerts for `Jobright` sources.
* **Root Cause 1 (42804 Error)**: Commit `a394f5e426f6d6da5344e4c13d83e26ea321fdb2` introduced a conditional raw-payload ingestion feature to save storage, altering the `ingest_job_transaction` RPC. During this, `v_target_status` was declared as `TEXT` instead of `public.job_status_enum`. Postgres implicitly blocked the cast during the `UPDATE public.jobs SET status=v_target_status` statement, crashing the pipeline.
* **Root Cause 2 (Zero Yield)**: The `JobrightAdapter` implements an explicit 14-day freshness boundary (`maxAgeMs`). Because the "2026-Internship" markdown repo was not updated recently, all rows fell outside the 14-day window and were rejected by the parser. This was not a system bug, but a correct execution of business logic that confused operations.

## 3. Stabilization Confirmation
The RPC type mismatch was permanently corrected by applying `20260930020000_fix_ingest_status_enum_type.sql`.
The test suite's transient failures regarding the 14-day freshness rule were permanently corrected by mocking system time in `vitest`.

The full system is now stable and reconciled.
