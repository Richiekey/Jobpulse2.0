# JobPulse 2.0 — Scraping Engine, Rate Limiting & Resilience

## 1. Core Scraping Architecture

The scraping engine in `apps/worker` is responsible for continuous, non-disruptive job ingestion across hundreds of company sources.

```
┌────────────────────────────────────────────────────────┐
│                   SCRAPER ENGINE                       │
│                                                        │
│  ┌──────────────────┐            ┌──────────────────┐  │
│  │ Distributed Lock │            │  Rate Limiter    │  │
│  │  (Postgres lock) │            │  (Domain/ATS)    │  │
│  └────────┬─────────┘            └────────┬─────────┘  │
│           │                               │            │
│           ▼                               ▼            │
│  ┌──────────────────────────────────────────────────┐  │
│  │               Worker Pool Orchestrator           │  │
│  │         (Bounded Concurrency: 5-10 workers)      │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           │                            │
│         ┌─────────────────┼─────────────────┐          │
│         ▼                 ▼                 ▼          │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   │
│  │ Greenhouse  │   │    Lever    │   │    Ashby    │   │
│  │   Adapter   │   │   Adapter   │   │   Adapter   │   │
│  └─────────────┘   └─────────────┘   └─────────────┘   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Distributed Locking

To prevent overlapping full scraper runs or concurrent mutations of stale job states, scraper execution requires acquiring a PostgreSQL advisory lock or row-level lock:

```sql
SELECT pg_try_advisory_lock(hashtext('jobpulse_scraper_lock'));
```

If lock acquisition fails, the secondary run exits gracefully without causing data corruption.

---

## 3. Rate Limiting & Bounded Concurrency

1. **Global Concurrency Limit**: Maximum 10 concurrent HTTP requests across all worker threads.
2. **Per-Domain Rate Limit**: Maximum 2 requests per second per ATS host (e.g. `boards.greenhouse.io`).
3. **Per-Company Rate Limit**: Minimum 500ms delay between consecutive requests for the same company.
4. **Adaptive Backoff**: When an HTTP `429 Too Many Requests` or `503 Service Unavailable` is encountered, the worker obeys the `Retry-After` header or performs exponential backoff:
   $$\text{Delay} = \text{base} \times 2^{\text{attempt}} + \text{jitter}$$

---

## 4. HTTP Client Abstraction

All external requests use a unified, hardened HTTP client:
- Enforces strict request timeouts (default 10s).
- Enforces response size ceilings (maximum 5MB to prevent memory exhaustion).
- Applies rotating standard user agents.
- Passes all destinations through the SSRF prevention layer.
- Captures granular latency and status telemetry.
