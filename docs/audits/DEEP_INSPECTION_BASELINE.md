# Jobpulse2.0 — Deep Inspection Baseline

## 1. Repository Baseline

* **Current Branch**: `main`
* **HEAD Commit**: `eaa20c5cc81a6c578bff48a745cec1f75278c100`
* **Repository Status**: Clean working tree (`nothing to commit, working tree clean`)
* **Tracked File Count**: 505
* **Directory Structure**:
  * `apps/` (web, worker)
  * `packages/` (ai, ats, config, curation, domain, shared, url-resolution, validation)
  * `supabase/` (migrations, seed, .temp)
  * `.github/workflows/` (jobpulse-scraper.yml)
  * `scripts/`
  * `docs/`
  * `tests/`
* **Package Manager**: pnpm (version 10.32.1)
* **Workspace Structure**: `apps/*` and `packages/*`
* **Build/Test/Lint/Typecheck Commands**:
  * `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`
  * Worker specific: `worker:dev`, `worker:once`, `worker:start`
  * Web specific: `web:dev`, `web:build`, `web:start`
  * DB generation: `db:types`
* **Environment/Configuration Files**:
  * `.env`, `.env.example`, `.env.local`, `.env.vercel`, `.env.vercel.prod`
  * `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
* **Deployment Configuration**:
  * `vercel.json` (Vercel setup, cron jobs)
* **GitHub Actions**:
  * `jobpulse-scraper.yml` (Automated scraper dispatcher)
* **Vercel Configuration**:
  * Build command: `pnpm --filter @jobpulse/web build`
  * Install command: `pnpm install --frozen-lockfile`
  * Crons: `/api/cron/retention` at `0 3 * * *`

## 2. Database Baseline

* **Supabase Project ID**: `yankxoyaqzzkxcilsnxq`
* **Current Migration State**: 62 migrations (based on `supabase/migrations` count)
* **Schema Inventory (public schema)**:
  * `profiles`
  * `companies`
  * `ats_platforms`
  * `sources`
  * `company_sources`
  * `jobs`
  * `job_sources`
  * `raw_job_payloads`
  * `scrape_runs`
  * `scrape_run_sources`
  * `saved_jobs`
  * `hidden_jobs`
  * `applications`
  * `user_preferences`
  * `user_integrations`
  * `scrape_locks`
  * `outbound_clicks`
  * `job_alerts`
  * `job_alert_deliveries`
  * `job_alert_delivered_jobs`
  * `job_functions`
  * `organizations`
  * `organization_members`
  * `worker_profiles`
