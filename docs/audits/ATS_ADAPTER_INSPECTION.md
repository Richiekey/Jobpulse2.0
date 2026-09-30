# Jobpulse2.0 — ATS & Ingestion Pipeline Inspection

## 1. Flow Overview
1. **Worker Boot**: `apps/worker/src/index.ts` either acts as a daemon polling for queued scrape runs, or runs a one-shot execution via CLI args (`--run-id`, `--company`, `--source`).
2. **Runner**: `ScraperRunner` claims pending scrape runs and dispatches to adapters based on source `ats_platform_slug`.
3. **Adapter Suite**: (`packages/ats/src/adapters/`)
   - `GreenhouseAdapter`
   - `LeverAdapter`
   - `WorkdayAdapter`
   - `SmartRecruitersAdapter`
   - `JobrightAdapter`
   - (Others: Ashbys, iCIMS, Oracle, SuccessFactors)
4. **Pipeline**: `IngestionPipeline` (in `apps/worker/src/engine/pipeline.ts`) passes candidates through the 8 stages.
5. **Database Transaction**: Final stage executes the `ingest_job_transaction` PostgreSQL RPC.

## 2. Jobright Adapter Specifics
* **Discovery Method**: Fetches `README.md` from GitHub repositories (e.g., `jobright-ai/2026-Internship`) instead of parsing standard ATS APIs.
* **Date Fencing**: `JobrightAdapter.parseMarkdownTable` implements a strict 14-day age limit (`maxAgeMs = 14 * 24 * 60 * 60 * 1000`). If a GitHub table's job has a `postedAt` date older than 14 days relative to the scrape time, it is silently dropped and tallied as `rowsRejected`.
* **Zero Yield Explained**: The "2026-Internship" repository likely has not had new jobs added in the last 14 days, resulting in `rowsRejected == totalRows`. This is expected behavior given the hardcoded invariant, but it manifests as a "zero yield" error to the uninitiated.

## 3. Worker Anomalies
* **Database Dependency**: The worker explicitly requires a direct Supabase Service Role key and uses `supabase.rpc()` to execute `ingest_job_transaction`. Because `ingest_job_transaction` is currently throwing error 42804, the worker is failing 100% of pipeline executions on update.

## 4. Remediation Steps required
1. Fix the `ingest_job_transaction` migration.
2. Consider making `maxAgeMs` configurable per source, or expose `rowsRejected` due to age as a distinct metric to avoid confusing operators regarding adapter health.
