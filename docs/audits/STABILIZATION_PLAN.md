# Jobpulse2.0 — Deep Root Inspection & Stabilization Plan

## 1. Executive Summary
This document summarizes the comprehensive deep-root inspection of the Jobpulse2.0 repository and production database. The immediate production ingestion blocker (a PostgreSQL datatype mismatch) has been resolved. The system is structurally sound, but several anomalies and architectural drifts were identified and documented. With the ingestion pipeline stabilized, monetization work can safely commence.

## 2. Completed Passes

### Pass 1: Repository Topology
* Mapped the workspace structure (pnpm monorepo).
* Verified the separation of concerns: `apps/worker` for ingestion orchestration and `apps/web` for frontend display.
* Discovered critical ingestion scripts, ATS adapters, and domain libraries.

### Pass 2: Documented Intent vs. Actual Implementation
* Confirmed the intended 8-stage ingestion pipeline is implemented.
* Identified that Stage 8b (Jobright Direct ATS URL Promotion) was added outside the standard pipeline to enforce job-board bypass.
* Documented a discrepancy where `plan.md` intended to reduce storage pressure by conditional raw payload ingestion (`p_store_raw_payload = false`), but the SQL implementation introduced a severe type mismatch error.

### Pass 3: Domain & Data Model Inspection
* The domain model effectively tracks provenance (`job_sources`), resolves aggregators back to authentic employers (`resolveEmployerCompanyId`), and prevents duplicates via `canonical_fingerprint`.
* **Resolved Issue**: The `42804` datatype mismatch on `jobs.status` (where a `TEXT` was assigned to a `job_status_enum`) completely halted ingestion on update. This was fixed by applying the `20260930020000_fix_ingest_status_enum_type.sql` migration directly to the Supabase database.

### Pass 4: ATS / Ingestion Pipeline Verification
* Evaluated the adapter suite (Greenhouse, Lever, Workday, etc.).
* Analyzed the `JobrightAdapter`. Verified that it retrieves payloads from GitHub Markdown files.
* Clarified the "zero yield" error for the `2026-Internship` Jobright collection: The adapter explicitly rejects jobs older than 14 days relative to the scrape date (`maxAgeMs`). Thus, an inactive GitHub repository correctly returns 0 valid candidates. This is a deliberate invariant, not a bug.

### Pass 5: Final Remediation & Testing
* **Fix Pass 1**: Safely applied `20260930020000_fix_ingest_status_enum_type.sql` to the production Supabase project via MCP.
* **Controlled Production Test**: Ran a targeted one-shot worker execution. Verified that the ingestion pipeline executes without atomic transaction errors and correctly resolves application URLs.

## 3. Findings Classification
* **CONFIRMED — CODE**: The 14-day age limit in `JobrightAdapter` rejecting older jobs.
* **CONFIRMED — DATABASE**: The `job_status_enum` mismatch causing the `42804` ingestion regression. (Now fixed).
* **CONFIRMED — PRODUCTION**: Pipeline now actively ingesting jobs without transaction rollback errors.
* **DOCUMENTED INTENT**: Conditional raw payload storage implemented to save database space (`p_store_raw_payload = false`).

## 4. Next Steps
With the core backend pipeline unblocked and data integrity restored, the system is in a stable state. You may safely proceed with the planned frontend or monetization changes.
