# JobPulse 2.0 — Architecture Specification

## 1. System Topology & Philosophy

JobPulse 2.0 is an enterprise-grade job aggregation, normalization, URL resolution, and discovery platform built around one core tenet: **Data quality over quantity**.

The platform is architected as a modular monorepo cleanly separating user-facing web applications from asynchronous ingestion workers, unified by shared domain packages and PostgreSQL as the authoritative single source of truth.

```
                         ┌─────────────────────────────────┐
                         │           ATS SOURCES           │
                         │ Greenhouse, Lever, Ashby, etc.  │
                         └────────────────┬────────────────┘
                                          │
                                          ▼
                         ┌─────────────────────────────────┐
                         │         SCRAPER WORKER          │
                         │   (Discovery, Ingestion, URL    │
                         │    Resolution, Normalization)   │
                         └────────────────┬────────────────┘
                                          │
                                          ▼
                         ┌─────────────────────────────────┐
                         │       POSTGRESQL / SUPABASE     │
                         │    (Authoritative Storage,      │
                         │     Indexes, Constraints, RLS)  │
                         └───────┬─────────────────┬───────┘
                                 │                 │
                                 ▼                 ▼
                       ┌──────────────────┐  ┌──────────────────┐
                       │   NEXT.JS WEB    │  │  ADMIN & METRICS │
                       │ (App Router UI,  │  │  (Telemetry,     │
                       │  Search & Feeds) │  │   Data Quality)  │
                       └──────────────────┘  └──────────────────┘
```

---

## 2. Monorepo Organization

```
jobpulse/
├── apps/
│   ├── web/                     # Next.js 15+ App Router application
│   │   ├── app/                 # Routes, server components, API route handlers
│   │   ├── components/          # Reusable UI component library
│   │   ├── features/            # Feature-specific state and views (feed, saved, search)
│   │   ├── hooks/               # Custom React hooks
│   │   └── lib/                 # Web utilities & Supabase browser/server clients
│   └── worker/                  # Background worker & pipeline orchestrator
│       ├── src/
│       │   ├── engine/          # Concurrency, scheduler & distributed lock
│       │   ├── pipeline/        # Ingestion pipeline stages
│       │   └── index.ts         # Worker entrypoint
│       └── tests/
├── packages/
│   ├── domain/                  # Core entities, schemas, normalizers & deduplication
│   ├── ats/                     # Canonical ATS registry, capability matrix & adapters
│   ├── url-resolution/          # Multi-tiered URL resolver & scoring engine
│   ├── validation/              # Strict Zod schemas & SSRF guards
│   ├── config/                  # Shared TypeScript, ESLint & Prettier configs
│   └── shared/                  # Logger, resilient HTTP client, backoff & utilities
├── supabase/
│   ├── migrations/              # Immutable SQL migration files
│   └── seed/                    # Baseline seed data (platforms, sources)
├── docs/                        # Complete technical documentation suite
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

---

## 3. Bounded Contexts & Decoupled Responsibilities

| Context | Responsibility | Package/App |
|---|---|---|
| **Identity & Access** | Profiles, roles (`user`, `admin`), Supabase Auth integration, RLS policy enforcement. | `apps/web`, `supabase` |
| **ATS Registry** | Single authoritative registry of ATS platforms, domain patterns, extraction rules, and adapter capabilities. | `packages/ats` |
| **Ingestion Pipeline** | Multi-stage pipeline: Discover -> Fetch -> Parse -> Normalize -> Resolve -> Validate -> Dedupe -> Persist. | `packages/domain`, `packages/ats`, `apps/worker` |
| **URL Resolution Engine** | Deep URL extraction, classification, canonical vs. apply vs. discovery resolution, confidence scoring. | `packages/url-resolution` |
| **Data Quality & Validation**| Invariant checking, content sanity checks, anti-phishing/SSRF defenses. | `packages/validation` |
| **Authoritative Storage** | Relational integrity, constraints, search vectors, audit trails, and transactional upserts. | `supabase`, PostgreSQL |
| **Search & Discovery** | Full-Text Search ranking (Title > Company > Skills > Description), Keyset cursor pagination. | `apps/web`, PostgreSQL |
| **User Interactions** | User-owned state (saved jobs, hidden jobs, application tracker) with strict RLS defense-in-depth. | `apps/web`, `supabase` |
| **Observability** | Scrape runs, source health metrics, parser version telemetry, and health probes (`/health`, `/ready`). | `apps/worker`, `apps/web` |

---

## 4. Key Architectural Decisions

1. **Monorepo with Strict Domain Boundaries**: Adapters do not talk directly to the database. They return `RawJob` intermediate representations, which are processed by normalizers, validators, and persisting repositories.
2. **Database is the Authoritative Store**: The frontend never acts as the source of truth for saved jobs, applications, or user state. Client-side state is merely a reactive cache.
3. **Resilient Ingestion Isolation**: An external ATS failure or malformed payload will never crash the scraper worker or affect sibling company sources.
4. **Deterministic Deduplication**: Multi-level deduplication starting with deterministic keys (`source_id + external_job_id`) and canonical URL hashes before any fuzzy matching is considered.
