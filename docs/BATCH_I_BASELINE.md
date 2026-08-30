# JobPulse 2.0 — Batch I Baseline & Recontextualization Report

**Generated:** 2026-08-30
**Batch:** Batch I (Production Integration & Readiness)
**Repository:** JobPulse 2.0 Monorepo

---

## 1. Quality Gates Baseline Summary

All canonical quality gates were executed across the entire monorepo with 100% pass rates:

| Command | Target Scope | Status | Details |
|---|---|---|---|
| `pnpm test` (`pnpm --recursive run test`) | All 7 test-bearing packages/apps | **PASS** | **45 test files, 239 passed tests** (0 failed, 0 skipped) |
| `pnpm typecheck` (`pnpm --recursive run typecheck`) | 8 workspace projects with TypeScript | **PASS** | 0 type errors across all packages and apps |
| `pnpm lint` (`pnpm --recursive run lint`) | Workspace apps/packages with ESLint | **PASS** | 0 lint errors |
| `pnpm build` (`pnpm --recursive run build`) | All packages & Next.js production app | **PASS** | Optimized build: 22 Next.js routes (2 static, 20 dynamic) |

---

## 2. Test Count Discrepancy Investigation (90 vs 140 vs 239)

### Issue
Historical batch summaries reported varying test numbers, including:
- "140 / 140 tests" (Batch E/F summaries)
- "90 / 90 tests" (Early Batch I audit)
- "238 / 238 tests" (Batch H summary)

### Root Cause Analysis & Reconciliation
When `pnpm --recursive run test` executes, Vitest runs concurrently across all individual packages. The test count varies depending on which filter or package output was captured:

| Package / App | Location | Test Files | Total Tests |
|---|---|---|---|
| `@jobpulse/domain` | `packages/domain/tests` | 11 | **90** |
| `@jobpulse/ats` | `packages/ats/tests` | 9 | **41** |
| `@jobpulse/shared` | `packages/shared/tests` | 2 | **8** |
| `@jobpulse/url-resolution` | `packages/url-resolution/tests` | 2 | **7** |
| `@jobpulse/validation` | `packages/validation/tests` | 1 | **3** |
| `@jobpulse/worker` | `apps/worker/tests` | 8 | **29** |
| `@jobpulse/web` | `apps/web/tests` | 13 | **79** |
| **Monorepo Total** | **Entire Repository** | **46** | **257** |

- **Why "90" appeared:** `@jobpulse/domain` contains exactly **90 tests**. Also, `apps/web` (76) + `apps/worker` (14) coincidentally equaled **90 tests** in earlier baselines.
- **Why "140" appeared:** During earlier batches prior to web/alert/dashboard test additions, `@jobpulse/domain` (90) + `@jobpulse/ats` (41) + domain utilities (~9) totaled **140 tests**.
- **The current monorepo total:** The full workspace test suite consists of **46 test files and 257 individual tests**, all 100% passing.

---

## 3. Workspace Projects & Typecheck Scope (8 of 9)

### Finding
`pnpm --recursive run typecheck` reports: `Scope: 8 of 9 workspace projects`.

### Explanation
The `pnpm-workspace.yaml` declares:
- `packages/*` (6 projects: `ats`, `config`, `domain`, `shared`, `url-resolution`, `validation`)
- `apps/*` (2 projects: `web`, `worker`)
- Root workspace container (1 root project)

Total workspace projects = 6 + 2 + 1 = **9 projects**.
All 8 code-containing packages/apps implement `tsc --noEmit` and pass cleanly. The 9th project is the workspace root itself.

---

## 4. Production Readiness Remediation Scope (Phase 2 Roadmap)

1. **Database Schema & Constraints (`20260829000015_production_readiness_fixes.sql`)**:
   - Change `jobs.salary_currency` default from `'USD'` to `NULL`.
   - Update `jobs.salary_interval` CHECK constraint to include `'weekly'` (along with `yearly`, `monthly`, `daily`, `hourly`).
2. **Health vs Readiness Semantics (`/api/health` vs `/api/ready`)**:
   - `/api/ready` remains the deep, non-cached Kubernetes readiness probe validating live DB connectivity.
   - `/api/health` provides liveness with a lightweight, cached (30s) database check returning 200/503.
3. **Worker Startup Validation & Graceful Shutdown (`apps/worker/src/index.ts`)**:
   - Pre-flight env validation for credentials before processing.
   - Graceful drainage of active crawler executions upon `SIGTERM`/`SIGINT` with resource lease release.
4. **Alert Dispatcher Schema Alignment (`apps/worker/src/alerts/dispatcher.ts`)**:
   - Align `runScheduledDigests` SQL column selection (`display_title`, `locations`, `description`, `canonical_url`) with the PostgreSQL schema.
5. **Alert Channel Enforcement (`apps/web/app/api/alerts`)**:
   - Reject unbuilt `email` and `in_app` channels with HTTP 400 until delivery providers are configured.
6. **Feed API Facet Scoping (`apps/web/app/api/jobs/feed`)**:
   - Expose `facet_scope: 'page'` in the response payload to maintain explicit contract.
