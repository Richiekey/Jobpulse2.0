# JobPulse 2.0 — Production Ingestion Pipeline

## 1. End-to-End Pipeline Stages

Every job flows through a deterministic, auditable multi-stage pipeline:

```
┌──────────────┐
│  DISCOVERY   │  Identify active job IDs & URLs (e.g. ATS API endpoint, feeds, sitemaps)
└──────┬───────┘
       │ JobCandidate
       ▼
┌──────────────┐
│    FETCH     │  Retrieve raw job payload (JSON API response / HTML document)
└──────┬───────┘
       │ RawJobPayload (stored with payload_hash & parser_version)
       ▼
┌──────────────┐
│    PARSE     │  Extract raw title, raw description, raw locations, raw salary, raw URLs
└──────┬───────┘
       │ RawJob
       ▼
┌──────────────┐
│  NORMALIZE   │  Standardize title, workplace type, locations, salary range, ISO dates
└──────┬───────┘
       │ NormalizedJob
       ▼
┌──────────────┐
│URL RESOLUTION│  Determine canonical_url, apply_url, original_apply_url with confidence score
└──────┬───────┘
       │ ResolvedJob
       ▼
┌──────────────┐
│  VALIDATE    │  Check data invariants, URL safety, non-empty fields, date plausibility
└──────┬───────┘
       │ ValidatedJob
       ▼
┌──────────────┐
│ DEDUPLICATE  │  Deterministic level-1/2/3 matching; link to existing canonical job or create new
└──────┬───────┘
       │ CanonicalJob + JobSource
       ▼
┌──────────────┐
│ PERSISTENCE  │  Atomic database upsert (jobs, job_sources, raw_job_payloads) & search indexing
└──────────────┘
```

---

## 2. Discovery vs. Ingestion Separation

- **Discovery** answers: *"What jobs currently exist for this company?"*
  - Lightweight scan that outputs a stream of `JobCandidate` items (`external_id`, `url`, `source_id`).
  - Allows fast diffing against existing database records without fetching heavy payloads.
- **Ingestion** answers: *"What are the exact details of this specific job?"*
  - Fetches the payload, parses fields, executes URL resolution, and produces the normalized entity.
  - Allows parallel retries and granular rate limiting per company.

---

## 3. Raw Payload Auditing & Parser Versioning

For operational debugging, raw payloads are recorded in `raw_job_payloads`:
- `source_id`: The source platform.
- `external_id`: Unique job identifier at the source.
- `payload`: Raw JSON / HTML content.
- `payload_hash`: SHA-256 hash of the payload to detect content changes.
- `parser_version`: e.g. `greenhouse_v1`, `lever_v1`, `jobright_v1`.
- `fetched_at`: Timestamp when the payload was acquired.

When an ATS changes its markup, engineers can inspect the historical raw payloads, update the adapter parser, and replay parsing locally.
