# JobPulse 2.0 — URL Resolution Engine

## 1. The Multi-URL Model

A single generic "url" field creates confusion and data loss. JobPulse 2.0 enforces 5 distinct URL semantics:

| URL Field | Definition | Example |
|---|---|---|
| `discovery_url` | Where JobPulse first found the posting. | `https://jobright.ai/jobs/12345` |
| `source_job_url` | The landing page hosted by the source provider. | `https://boards.greenhouse.io/stripe/jobs/5678` |
| `canonical_url` | The canonical employer-branded public job posting. | `https://stripe.com/jobs/listing/5678` |
| `apply_url` | The direct application form URL where the user submits their resume. | `https://boards.greenhouse.io/stripe/jobs/5678#app` |
| `original_apply_url`| The raw original application URL recovered before transformations. | `https://api.jobright.ai/redirect?target=...` |

---

## 2. URL Candidate Ranking Hierarchy

When processing a posting (especially from aggregators like Jobright), multiple potential URLs are extracted. The `URLResolver` scores each candidate according to strict priority:

```
Priority 1: Explicit Employer Apply URL (e.g. company.com/careers/apply/...)
     ▼
Priority 2: Explicit Direct ATS Application Form (e.g. boards.greenhouse.io/...#app)
     ▼
Priority 3: Schema.org / JSON-LD structured data URL
     ▼
Priority 4: Embedded Application Links discovered inside HTML / JS state
     ▼
Priority 5: Known ATS URL pattern detected in page text
     ▼
Priority 6: Generic external apply link
     ▼
Priority 7: Fallback Source URL
```

---

## 3. Resolution Confidence & Telemetry

Every resolved job includes:
- `url_resolution_method`:
  - `explicit_original_url` (1.0 confidence)
  - `structured_data` (0.95 confidence)
  - `embedded_json` (0.9 confidence)
  - `html_extraction` (0.8 confidence)
  - `ats_pattern` (0.75 confidence)
  - `fallback` (0.4 confidence)
- `url_resolution_confidence`: Floating point value between `0.0` and `1.0`.

This metadata enables immediate identification and debugging of unoptimized or degraded URL extractions.
