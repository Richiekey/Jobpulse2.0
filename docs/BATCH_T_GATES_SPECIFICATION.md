# JobPulse 2.0 — Batch T: Quality Gate & Governance Specification

**Document Version:** 1.0.0  
**Date:** 2026-09-06  
**Status:** **ACTIVE / CANONICAL GOVERNANCE LAYER**  
**Applies To:** Monorepo (`apps/*`, `packages/*`, `supabase`, `docs`, `scripts`)

---

## 1. Executive Mission & Purpose

Batch T establishes the formal **process architecture, engineering controls, and automated quality-gate governance layer** for JobPulse 2.0.

As defined in [`docs/POST_LAUNCH_PRODUCTION_PIPELINE.md`](file:///c:/Users/HP/Documents/Jobpulse2.0/docs/POST_LAUNCH_PRODUCTION_PIPELINE.md#L417-L468), production development progresses through a strict sequential milestone pipeline:

```text
S [PAUSED] ──> T (Gates & Governance) ──> U (UX/UI System) ──> V (Observability) ──> W (Security/DR) ──> X (Capacity) ──> Y (Launch)
```

Batch T ensures that no batch release can be declared certified, merged, or promoted without meeting strict, deterministic, and auditable evidence criteria. It transforms the 8-step quality checklist into an **automated, fail-closed gate engine (`pnpm run gates`)**.

---

## 2. The 4 Gate States

Every evaluated gate must resolve to one of four explicit states:

| Gate State | Definition | Impact on Certification |
|---|---|---|
| **`PASS`** | The gate completed execution and satisfied all deterministic invariants. | Contributes toward certification. |
| **`FAIL`** | The gate executed and failed an invariant (e.g. TypeScript error, test assertion failure, build error). | Process terminates non-zero; certification **FAILS**. |
| **`BLOCKED`** | The gate could not safely execute or prerequisites were unmet (e.g. missing credentials, production target detected, dirty working tree). | Process terminates non-zero; certification is **BLOCKED**. |
| **`SKIPPED`** | The gate was intentionally bypassed (only permitted in the fast local `ci` profile). | Permitted in CI; **PROHIBITS** production certification. |

---

## 3. The 3 Execution Profiles

The gate engine provides three dedicated execution profiles:

### 3.1 Standard Mode (`pnpm run gates`)
- **Purpose**: Full local developer and staging verification.
- **Behavior**: Runs all 8 gates. Required gates must never silently skip.
- **Fail-Closed Rule**: If authenticated Supabase credentials are missing or the target cannot be verified safe, Gate 3, 6, and 7 resolve to `BLOCKED`, and the process exits non-zero.

### 3.2 CI Profile (`pnpm run gates:ci`)
- **Purpose**: Fast, headless CI/PR verification.
- **Behavior**: Executes local static and unit verification (Gates 1, 2, 4, and 5). Live database gates may be `SKIPPED` if external test infrastructure is omitted.
- **Certification Restriction**: The generated artifact is permanently stamped:
  > **`NOT A PRODUCTION CERTIFICATION`**
- The CI profile can **never** produce a `CERTIFIED` verdict.

### 3.3 Audit Profile (`pnpm run gates:audit`)
- **Purpose**: Authoritative production certification sign-off.
- **Behavior**: All 8 gates MUST execute and pass.
- **Enforcements**:
  1. **Working Tree Cleanliness**: The git working tree must have 0 uncommitted changes (unless overridden with `--allow-dirty` accompanied by an explicit audit log).
  2. **Environment Safety**: Target must be an approved non-production Supabase instance (`wvyrivmvpcrhwinzmcyy` or local).
  3. **Live Schema Audit**: Gate 5 performs live database queries verifying column nullability, triggers, and table existence.
  4. **Prerequisite Sequence**: Validates machine-readable batch dependency state (`scripts/batch-sequence.json`).
  5. **Artifact Generation**: Automatically synthesizes `.gates-report.json` and `docs/audits/BATCH_T_CERTIFICATION_EVIDENCE.md`.

---

## 4. The Mandatory 8-Step Gate System

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                            THE 8 MANDATORY GATES                             │
├─────────┬───────────────────────────────┬────────────────────────────────────┤
│ Gate 1  │ Typecheck Integrity           │ pnpm run typecheck                 │
├─────────┼───────────────────────────────┼────────────────────────────────────┤
│ Gate 2  │ Unit & Domain Test Suites     │ pnpm run test                      │
├─────────┼───────────────────────────────┼────────────────────────────────────┤
│ Gate 3  │ Genuine Authenticated Test    │ pnpm run test:authenticated        │
├─────────┼───────────────────────────────┼────────────────────────────────────┤
│ Gate 4  │ Production Build (Workspace)  │ pnpm run build                     │
├─────────┼───────────────────────────────┼────────────────────────────────────┤
│ Gate 5  │ Migration & Schema Integrity  │ check-schema-integrity             │
├─────────┼───────────────────────────────┼────────────────────────────────────┤
│ Gate 6  │ Security & Tenant RLS Fencing │ batch-t-security-boundary          │
├─────────┼───────────────────────────────┼────────────────────────────────────┤
│ Gate 7  │ Observability & Truthfulness  │ batch-t-observability-truth        │
├─────────┼───────────────────────────────┼────────────────────────────────────┤
│ Gate 8  │ Evidence & Certification      │ Internal report synthesis          │
└─────────┴───────────────────────────────┴────────────────────────────────────┘
```

### Detailed Gate Specifications

#### Gate 1: Typecheck Integrity (`pnpm run typecheck`)
- **Scope**: All 8 workspace projects (`@jobpulse/shared`, `domain`, `url-resolution`, `validation`, `ats`, `web`, `worker`).
- **Invariant**: Strict TypeScript compiler execution (`tsc --noEmit`) with zero errors.

#### Gate 2: Unit & Domain Test Suites (`pnpm run test`)
- **Scope**: Package-level unit and domain suites.
- **Invariant**: 100% test pass rate with zero skips across domain entities, ATS adapters, validation guards, and URL resolution logic.

#### Gate 3: Integration (`pnpm run test:authenticated`)
- **Scope**: System integration across PostgREST RPC boundaries and database tables.
- **Target**: Genuine non-production Supabase project (`wvyrivmvpcrhwinzmcyy`).
- **Invariant**: Validates multi-tenant workforce workflows, assignment lifecycles, and operational intelligence against live PostgreSQL.

#### Gate 4: Production Build (`pnpm run build`)
- **Scope**: Full workspace production packaging across all projects:
  - **Shared Libraries (`packages/*`)**: Compiles `@jobpulse/shared`, `@jobpulse/domain`, `@jobpulse/url-resolution`, `@jobpulse/validation`, `@jobpulse/ats` via `tsc`.
  - **Worker Daemon (`apps/worker`)**: Compiles background ingestion and sync daemon into production bundle (`dist/index.js`).
  - **Web Application (`apps/web`)**: Compiles Next.js production bundles, middleware, and generates all 43 static/dynamic routes.
- **Invariant**: Zero build-time syntax, bundling, or type errors across the entire workspace.

#### Gate 5: Migration & Schema Integrity (`scripts/check-schema-integrity.mjs`)
- **Scope**: All SQL files in `supabase/migrations/`.
- **Invariants**:
  - Filename format: `YYYYMMDDHHMMSS_<name>.sql`.
  - Monotonic chronological ordering; zero duplicate timestamps.
  - SQL sanity: non-empty, no unhedged destructive statements (`DROP TABLE` without `IF EXISTS`).
  - Architectural invariants:
    - **R-H01**: `url_resolution_method` is nullable with NO default in Batch R migration.
    - **R-H02**: `error_class` column and `classify_source_error` classification trigger exist.
  - In audit mode: validates live database catalog state against target instance.

#### Gate 6: Security & Tenant Isolation Boundary (`tests/batch-t-security-boundary.test.ts`)
- **Scope**: Dedicated negative authorization matrix.
- **Invariants Tested**:
  1. Anonymous access to protected RPCs is blocked.
  2. Unauthorized cross-organization access returns `403 FORBIDDEN`.
  3. Cross-tenant reads are blocked via PostgREST RLS (0 rows returned).
  4. Cross-tenant writes are blocked via PostgREST RLS (0 rows affected).
  5. Worker vs. Admin privilege boundaries (workers denied admin intelligence).
  6. Org-admin vs. Global-admin boundaries (org admins denied global telemetry).
  7. Privileged RPC abuse protection (`admin_cancel_job_assignment` fenced).

#### Gate 7: Observability & Operational Truthfulness (`tests/batch-t-observability-truth.test.ts`)
- **Scope**: Semantic contracts established by Batch R.
- **Invariants Tested**:
  1. URL resolution truth: NULL resolution method groups under `unresolved`, never `direct`. Zero fabricated confidence score.
  2. Failure taxonomy truth: Failed source runs normalize raw error strings to stable machine-readable classes (`timeout`, `rate_limit`, `unknown`).
  3. Temporal interval vs. active backlog: Disambiguates `startedInWindow` from `inProgress`.
  4. Windowed verifications vs. backlog: Disambiguates `reviewedInWindow` from `pendingCurrent`.
  5. Scope boundary: Global query returns platform-wide catalog; Org-scoped query isolates workforce velocity.

#### Gate 8: Evidence Generation & Certification Synthesis
- **Scope**: Audit artifact generation.
- **Deliverables**:
  - `.gates-report.json`: Machine-readable execution telemetry.
  - `docs/audits/BATCH_T_CERTIFICATION_EVIDENCE.md`: Formatted audit document.
- **Metadata Included**:
  - Batch identity, execution profile, timestamp, duration.
  - Repository, Commit SHA, Git branch, working tree cleanliness.
  - Runtime environment (Node, pnpm versions).
  - Environment safety verdict.
  - Batch sequence governance verdict.
  - Computed certification status.
- **Legal/Audit Notice**: "Evidence metadata generated by automated gate harness. Commit SHA provides commit point-in-time reference. Not a cryptographic digital signature."

---

## 5. Environment Safety — Fail-Closed Policy

Any test or script interacting with live Supabase infrastructure must pass the environment safety check:

1. **Known Production Project Ref**: `rgwutmthzigjmzsmmjnp`
2. **Approved Non-Production Ref**: `wvyrivmvpcrhwinzmcyy` or local `127.0.0.1`
3. **Fail-Closed Triggers**:
   - Target project reference matches `rgwutmthzigjmzsmmjnp` $\rightarrow$ `BLOCKED` (`[SECURITY_GATE_VIOLATION]`).
   - Target project reference cannot be extracted or is missing $\rightarrow$ `BLOCKED` (`FAIL_CLOSED`).
4. **Verification**: Automated unit tests in [`tests/batch-t-environment-safety.test.ts`](file:///c:/Users/HP/Documents/Jobpulse2.0/tests/batch-t-environment-safety.test.ts) verify both negative rejection and positive acceptance.

---

## 6. Batch Sequence Governance State Machine

Dependencies are tracked in machine-readable JSON ([`scripts/batch-sequence.json`](file:///c:/Users/HP/Documents/Jobpulse2.0/scripts/batch-sequence.json)):

```json
{
  "currentBatch": "T",
  "batches": {
    "R": { "status": "CERTIFIED" },
    "S": { "status": "PAUSED" },
    "T": { "status": "IN_PROGRESS", "prerequisites": ["R"] },
    "U": { "status": "BLOCKED", "prerequisites": ["T"] }
  }
}
```

### State Transition Rules
1. **Batch T Prerequisites**: Requires Batch R to be `CERTIFIED`. Batch S is explicitly permitted to be `PAUSED` per roadmap.
2. **Batch U Permitted**: Batch U transitions from `BLOCKED` to `PERMITTED` **only** upon successful certification of Batch T.
3. **Future Batches (V–Y)**: Remain strictly `BLOCKED` until their immediate predecessor is certified.

---

## 7. Operational Runbook

```bash
# 1. Typecheck & Local Sanity
pnpm run typecheck

# 2. Fast CI / Local PR Verification (Non-certification)
pnpm run gates:ci

# 3. Standard Local Verification (Fail-closed on missing env)
pnpm run gates

# 4. Authoritative Production Certification (Requires clean tree + all gates PASS)
pnpm run gates:audit
```
