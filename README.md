# JobPulse 2.0 — Production Job Discovery & Aggregation Engine

JobPulse 2.0 is an enterprise-grade job aggregation, normalization, and discovery platform built from the ground up for high data quality, direct ATS application resolution, zero noise, and real-time observability.

---

## 🌟 Core System Highlights

- **8-Stage Ingestion Pipeline**:
  `DISCOVER → INGEST → PARSE → NORMALIZE → VALIDATE → RESOLVE → DEDUPLICATE → STORE → INDEX`
- **Zero-Noise Direct ATS Resolution**:
  Identifies and ranks true employer application form URLs across Greenhouse, Lever, Ashby, and Workday rather than trapping users on third-party aggregators.
- **SSRF & Data Integrity Guards**:
  Blocks loopback, private IPv4/IPv6 ranges, cloud metadata endpoints (`169.254.169.254`), and content spam.
- **3-Tier Deduplication Engine**:
  Payload SHA-256 change hashing, tracking-parameter-stripped URL cleaning, and canonical fingerprinting.
- **PostgreSQL Full-Text Search**:
  Automatic database triggers maintaining GIN-indexed search vectors over titles, companies, locations, and skills.
- **Keyset Cursor Pagination**:
  High-efficiency feed API querying `(posted_at DESC, id DESC)` for instant scrolling without table scan overhead.
- **Personal Productivity Tools**:
  Job bookmarking, interview stage tracker (Screening, Interview, Offer, Rejected), and interviewer note-taking.

---

## 🏗️ Architecture & Monorepo Topology

```
Jobpulse2.0/
├── packages/
│   ├── shared/            # Structured JSON logger, SSRF-guarded HTTP client, exponential jitter backoff
│   ├── domain/            # Canonical Job models, Normalizer, and DeduplicationEngine
│   ├── validation/        # Zod schemas, SSRF IP guards, and JobValidator
│   ├── url-resolution/    # Multi-tier candidate hierarchy and confidence scoring
│   └── ats/               # Adapter interfaces, registry, Greenhouse, Lever, and Ashby adapters
├── apps/
│   ├── worker/            # Ingestion pipeline runner, concurrency controls, and Supabase audit logger
│   └── web/               # Next.js 15 App Router web feed, search, and application tracker
├── supabase/
│   ├── migrations/        # Production PostgreSQL schema, RLS policies, GIN indexes, FTS triggers
│   └── seed/              # Baseline seed data for ATS platforms and top employers
└── docs/                  # 14 complete architecture and operational specifications
```

---

## 📚 Technical Documentation Suite

Complete technical specifications are located in [`docs/`](file:///docs):
- [`docs/architecture.md`](file:///docs/architecture.md) — System topology & bounded contexts
- [`docs/database.md`](file:///docs/database.md) — Relational schema, indexing & RLS
- [`docs/security.md`](file:///docs/security.md) — Threat model & SSRF defense
- [`docs/ats-system.md`](file:///docs/ats-system.md) — ATS adapter contracts & registry
- [`docs/ingestion-pipeline.md`](file:///docs/ingestion-pipeline.md) — 8-stage pipeline specification
- [`docs/url-resolution.md`](file:///docs/url-resolution.md) — Candidate hierarchy & confidence engine
- [`docs/scraping.md`](file:///docs/scraping.md) — Concurrency, rate limits & jitter backoff
- [`docs/job-lifecycle.md`](file:///docs/job-lifecycle.md) — State machine & missed-scrape invariants
- [`docs/authentication.md`](file:///docs/authentication.md) — Supabase Auth & RBAC
- [`docs/api.md`](file:///docs/api.md) — REST endpoints & keyset cursor pagination
- [`docs/testing.md`](file:///docs/testing.md) — Test pyramid & contract fixtures
- [`docs/deployment.md`](file:///docs/deployment.md) — Infrastructure & production deployment
- [`docs/operations.md`](file:///docs/operations.md) — Metrics, telemetry & health probes
- [`docs/disaster-recovery.md`](file:///docs/disaster-recovery.md) — PITR backups & incident response

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Supabase Project (PostgreSQL 15+)

### 2. Environment Setup
Copy the environment template and configure your Supabase credentials:
```bash
cp .env.example .env
```

### 3. Install Dependencies & Build
```bash
pnpm install
pnpm build
```

### 4. Run Automated Tests
```bash
pnpm test
```

### 5. Run Live Ingestion Scraper
```bash
# Ingest Stripe jobs from Greenhouse
pnpm --filter @jobpulse/worker start --company=stripe

# Ingest all configured company boards
pnpm --filter @jobpulse/worker start
```

### 6. Start Web Application
```bash
pnpm --filter @jobpulse/web dev
# Access feed at http://localhost:3000
```

---

## 🔒 Security & Privacy

- **Row Level Security (RLS)** is enabled on all tables in Supabase.
- **Authoritative Data Integrity**: State transitions, URL validation, and sanitization are computed authoritatively on the backend.
- **SSRF Hardened**: Outbound HTTP requests block loopback addresses (`127.0.0.1`), metadata endpoints (`169.254.169.254`), and non-routable private subnets.

---

## 📄 License
MIT License. Built for production scale.
