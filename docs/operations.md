# JobPulse 2.0 — Operations, Monitoring & Health Checks

## 1. Operational Telemetry & Metrics

JobPulse 2.0 tracks operational health across four pillars:

### 1.1 Scraper Telemetry
- `jobs_discovered_total`
- `jobs_inserted_total`
- `jobs_updated_total`
- `jobs_rejected_total` (due to validation failures)
- `adapter_execution_duration_seconds`
- `adapter_error_rate_per_source`

### 1.2 URL Resolution Quality
- `url_resolution_success_rate`
- `url_resolution_by_method` (`explicit_original_url`, `structured_data`, `embedded_json`, `ats_pattern`, `fallback`)
- `jobright_resolved_to_ats_percentage`

### 1.3 Feed & Search Performance
- `feed_query_latency_ms` (target: < 50ms p95)
- `search_query_latency_ms` (target: < 100ms p95)
- `api_error_rate_5xx`

---

## 2. Health & Readiness Probes

### `/health` (Liveness)
- Simple HTTP 200 response confirming the Node.js event loop is responsive.
- Used by orchestrators (Kubernetes / ECS / Fly) to detect process deadlocks.

### `/ready` (Readiness)
- Executes a lightweight query (`SELECT 1`) against the PostgreSQL database.
- Checks memory usage and external connectivity.
- Returns HTTP 200 if ready to serve traffic, or HTTP 503 Service Unavailable if degraded.
