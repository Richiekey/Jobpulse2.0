# Jobpulse2.0 — Database Deep Inspection (Pass 6)

## 1. Schema & Topology
The database comprises 62 migrations mapping complex relations between Users, Organizations, Applications, Jobs, and Integrations.
Key Tables:
- `users`, `organizations`, `org_members`
- `companies`, `jobs`, `job_sources`, `raw_job_payloads`
- `applications`, `application_events`, `sync_events`
- `user_integrations`

## 2. Advanced Features & Triggers
- **Full Text Search**: A search vector trigger (`trg_jobs_search_vector_update`) keeps FTS queries fast.
- **State Machines**: Verification states are strictly guarded by `trg_enforce_verification_state_machine`.
- **Immutability**: `trg_prevent_application_event_mutation` enforces an append-only architecture for audit events.
- **Async Synchronization**: `trg_enqueue_application_sync` automatically pushes `sync_events` for external Google Sheets CRM syncing. This had a known infinite loop defect that was properly patched in `20260926000000_fix_sync_trigger_infinite_loop.sql` by adding equality guards (`IS NOT DISTINCT FROM`).

## 3. Findings
- **Data Integrity**: Highly robust. Security definer functions and strict Row Level Security (RLS) govern the relationships.
- **Constraint Fencing**: Orphan retention, immutability, and state transitions are explicitly constrained at the database boundary, protecting against application-level regressions.
- **RPC Contracts**: Other than the previously repaired `ingest_job_transaction`, no other anomalies were found in RPC parameter types.

The database is extremely mature for a V2 product.
