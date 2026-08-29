# JobPulse 2.0 — Deployment & Infrastructure Specification

## 1. Hosting Architecture

```
                  ┌───────────────────────┐
                  │    Vercel Platform    │
                  │  (Next.js 15 App UI,  │
                  │   Edge & API Handlers)│
                  └───────────┬───────────┘
                              │
                              ├────────────────────────┐
                              │                        │
                              ▼                        ▼
                  ┌───────────────────────┐  ┌───────────────────────┐
                  │  Dedicated Worker Host│  │   Supabase Platform   │
                  │  (Fly.io / ECS / VPS) │  │  (Postgres 17, Auth,  │
                  │  - Concurrency Pool   │  │   Storage, Edge Funcs)│
                  │  - Scraper Scheduler  │  └───────────────────────┘
                  │  - Async Job Engine   │
                  └───────────────────────┘
```

---

## 2. Infrastructure Isolation Principle

- **Web Application**: Deployed on Vercel for instant CDN edge distribution, SSR, and dynamic React Server Components.
- **Worker Engine**: Deployed as a persistent long-running container process on a dedicated host (e.g. Fly.io, Railway, or AWS ECS) with persistent event loops, distributed locking, and stable IP addresses. Long-running scraping tasks must never run inside Vercel serverless request timeouts.
- **Database & Auth**: Managed by Supabase (Postgres 17 with connection pooling, automatic failover, and SSL enforcement).

---

## 3. Environment Separation Matrix

| Environment | Database Target | Auth URL | Deployment Target |
|---|---|---|---|
| **Development** | Local / Dev Supabase Branch | `http://localhost:3000` | Localhost |
| **Staging** | Staging Supabase Project | `https://staging.jobpulse.io` | Vercel Preview |
| **Production** | Production Supabase Project | `https://jobpulse.io` | Vercel Production |
