# Jobpulse2.0 — Documented Intent vs Actual Implementation

## 1. Pipeline Architecture
* **Documented Intent**: 8-Stage Pipeline (`DISCOVER → INGEST → PARSE → NORMALIZE → VALIDATE → RESOLVE → DEDUPLICATE → STORE → INDEX`).
* **Actual Implementation**: The pipeline exists in `apps/worker/src/engine/pipeline.ts` and mostly matches the 8 stages. Stage 8b (Jobright Direct ATS URL Promotion) was bolted onto the pipeline.
* **Discrepancy**: The `ingest_job_transaction` RPC has a PostgreSQL datatype mismatch (error 42804) causing ingestion failure.
* **Risk**: High (P0). The system cannot ingest new or update existing jobs due to the type mismatch.

## 2. Ingestion Retention & Storage
* **Documented Intent**: V2 designed to reduce storage pressure by avoiding storing raw payloads unnecessarily (`p_store_raw_payload = false`).
* **Actual Implementation**: `pipeline.ts` passes `p_store_raw_payload: false` to the `ingest_job_transaction` RPC. However, the RPC function itself has a datatype mismatch where `v_target_status` (`TEXT`) is assigned to `jobs.status` (`job_status_enum`).
* **Discrepancy**: The SQL function was deployed with a type mismatch, breaking the contract.
* **Risk**: High (P0). Complete ingestion pipeline failure.

## 3. Web Feed Deduplication
* **Documented Intent**: (From `plan.md`) Feed-level deduplication and data quality should be handled by a curation engine.
* **Actual Implementation**: To be verified fully, but V2 `plan.md` noted it was missing initially.
* **Discrepancy**: TBD.
* **Risk**: Low (P3/P4).

## 4. ATS Adapter Suite
* **Documented Intent**: (From `walkthrough.md`) Tier-1 adapters added (Workday, SmartRecruiters, iCIMS, SuccessFactors, Oracle).
* **Actual Implementation**: The adapters exist in `packages/ats/src/adapters/`.
* **Discrepancy**: The Jobright adapter was cited as returning zero jobs ("2026-Internship") in recent runs.
* **Risk**: Medium (P2).

## 5. Security & Validation
* **Documented Intent**: SSRF IP guards, strict domain validation.
* **Actual Implementation**: `ssrf.ts` is implemented.
* **Discrepancy**: Needs deep code inspection in PASS 8.
* **Risk**: Pending.
