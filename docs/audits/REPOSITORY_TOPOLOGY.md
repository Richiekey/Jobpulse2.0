# Jobpulse2.0 — Repository Topology Map

## 1. Apps (`apps/`)

* **`@jobpulse/web`**
  * **Purpose**: Next.js user-facing web application.
  * **Responsibilities**: Job search, filtering, user authentication, saved jobs, applied jobs tracking.
  * **Dependencies**: All internal packages, `@supabase/ssr`, `lucide-react`, `next`, `zod`.
  * **Owner/Domain**: Frontend, User Experience.

* **`@jobpulse/worker`**
  * **Purpose**: Node.js/TypeScript background worker engine.
  * **Responsibilities**: Orchestrates the scraping lifecycle, ingestion pipeline, data normalization, database RPC calls, and lifecycle events (like retention/cleanup).
  * **Dependencies**: `@jobpulse/ats`, `@jobpulse/domain`, `@jobpulse/shared`, `@jobpulse/url-resolution`, `@jobpulse/validation`.
  * **Owner/Domain**: Backend, Ingestion, Automation.
  * **Entry Points**: `src/index.ts` (dev, once, start scripts).

## 2. Packages (`packages/`)

* **`@jobpulse/ats`**
  * **Purpose**: Scraper adapters and discovery strategies.
  * **Responsibilities**: Contains ATS-specific extraction logic, discovery orchestration, and the adapter registry.
  * **Key Interfaces**: `adapter.interface.ts`.
  * **Dependencies**: `domain`, `url-resolution`, `validation`.

* **`@jobpulse/domain`**
  * **Purpose**: Core business logic and data normalization.
  * **Responsibilities**: Location parsing, skills taxonomy, salary estimation, job normalization logic.

* **`@jobpulse/validation`**
  * **Purpose**: Input validation and security.
  * **Responsibilities**: Zod schemas, SSRF protection (`ssrf.ts`).

* **`@jobpulse/url-resolution`**
  * **Purpose**: Resolves and canonicalizes URLs.
  * **Responsibilities**: Redirect following, UTM stripping.

* **`@jobpulse/ai` & `@jobpulse/curation`**
  * **Purpose**: Enrichment, AI evaluation, and curation logic (likely heavily involving Jobright).

* **`@jobpulse/shared` & `@jobpulse/config`**
  * **Purpose**: Common utilities (e.g., HTML sanitization, salary formatting).

## 3. Infrastructure & Scripts

* **`supabase/`**
  * **Purpose**: Database schema, migrations (62 files), and seed data.
  * **Responsibilities**: Single source of truth for DB schema and RPC definitions.

* **`scripts/`**
  * **Purpose**: One-off operations, backfills, and audit runners.
  * **Important Files**: `run-batch-gates.ts` (test/audit orchestration).
  * **Legacy/Temporary Code Identified**: `backfill-jobright-enrichment.mjs`, `fix-corrupted-jobright-jobs.mjs`, `run-corpus-purge.mjs`, `apply-migration-*.js`. These indicate recent data corruption or migration fixes related to "Jobright".

* **`.github/workflows/`**
  * **Purpose**: CI/CD and cron orchestration.
  * **Important Files**: `jobpulse-scraper.yml` (dispatches the worker).

* **`tests/`**
  * **Purpose**: Integration tests, including authenticated RLS boundary tests and intelligence tests.

## 4. Notable Findings

* **Suspicious/Temporary Code**: Several `.mjs` scripts in `scripts/` dedicated to fixing corrupted "Jobright" jobs. This correlates with the reported Jobright regressions.
* **Architecture Shift**: The system appears to have moved towards a monorepo setup (`apps/` vs `packages/`) using `pnpm` workspaces, isolating the ATS scraping from the worker engine.
