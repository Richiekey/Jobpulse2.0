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

---

## 4. Vercel Deployment Topology

### Monorepo Build Strategy

The monorepo uses **deterministic topological package builds**. pnpm's `--recursive` flag
guarantees that workspace dependencies are built before their consumers. This means all
`dist/` artifacts are compiled before `next build` attempts to resolve workspace packages.

**No conditional exports, webpack aliases, or source-field overrides are required.**

### Build Order (verified)

```
pnpm install --frozen-lockfile
        ↓
@jobpulse/shared       (tsc → dist/)
        ↓
@jobpulse/domain       (tsc → dist/)
        ↓
@jobpulse/url-resolution + @jobpulse/validation   (tsc → dist/, parallel)
        ↓
@jobpulse/ats          (tsc → dist/)
        ↓
@jobpulse/web          (next build → .next/)
```

### Vercel Dashboard Settings

| Setting | Value |
|---|---|
| **Root Directory** | `apps/web` |
| **Framework Preset** | Next.js (auto-detected) |
| **Node.js Version** | 20.x |
| **Install Command** | `pnpm install --frozen-lockfile` |
| **Build Command** | `cd ../.. && pnpm --filter @jobpulse/web... run build` |
| **Output Directory** | (default — `.next` auto-detected by Next.js preset) |

### vercel.json

The repository includes a `vercel.json` at the repo root that codifies the build and install
commands. Vercel reads this file from the repository root regardless of the Root Directory
setting.

```json
{
  "buildCommand": "cd ../.. && pnpm --filter @jobpulse/web... run build",
  "installCommand": "pnpm install --frozen-lockfile"
}
```

### Why `--filter @jobpulse/web...` ?

The `...` suffix is a pnpm filter that selects the package **and all its transitive workspace
dependencies**. This builds exactly 6 of 9 workspace projects in topological order, skipping
`@jobpulse/worker` and `@jobpulse/config` (which are not needed for the web deployment).

### Why NOT `pnpm --filter @jobpulse/web build` ?

That command builds **only** `@jobpulse/web` without building its workspace dependencies first.
On a clean checkout (no `dist/` directories), `next build` fails with:

```
Module not found: Can't resolve '@jobpulse/ats'
Module not found: Can't resolve '@jobpulse/shared'
Module not found: Can't resolve '@jobpulse/domain'
```

Because all workspace packages export `./dist/index.js` as their entry point, and those files
do not exist until the packages are built.

---

## 5. Required Environment Variables

### Vercel (Web Application)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (server-side only) |

### Worker Host

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key for privileged operations |

---

## 6. Monorepo Package Architecture

### Workspace Dependency Graph

```
@jobpulse/shared          (no workspace deps)
        ↓
@jobpulse/domain          (→ shared)
        ↓
@jobpulse/url-resolution  (→ domain, shared)
@jobpulse/validation      (→ domain, shared)
        ↓
@jobpulse/ats             (→ domain, shared, url-resolution, validation)
        ↓
@jobpulse/web             (→ ats, domain, shared, url-resolution, validation)
@jobpulse/worker          (→ ats, domain, shared, url-resolution, validation)
```

### Package Entry Points

All workspace packages use the standard TypeScript compilation pattern:

- **Source**: `./src/index.ts` (TypeScript with `.js` extension imports for NodeNext)
- **Build output**: `./dist/index.js` + `./dist/index.d.ts` (compiled by `tsc`)
- **Package exports**: Point to `./dist/index.js` (resolved at build time and runtime)
- **Build command**: `tsc` (each package has its own `tsconfig.json`)

### Runtime Versions

| Tool | Version | Constraint |
|---|---|---|
| **Node.js** | ≥ 20.0.0 | `engines.node` in root `package.json` |
| **pnpm** | ≥ 9.0.0 | `engines.pnpm` in root `package.json` |
| **Next.js** | 15.5.x | `apps/web/package.json` |
| **TypeScript** | 5.7.x | All workspace packages |

---

## 7. Local Development

```bash
# Install dependencies
pnpm install

# Run web app in development (hot reload)
pnpm web:dev

# Run worker in development
pnpm worker:dev

# Full quality gates
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

---

## 8. Clean Build Verification

To simulate a Vercel deployment from a clean state:

```bash
# 1. Remove all build artifacts
find packages apps -name "dist" -type d -exec rm -rf {} + 2>/dev/null
rm -rf apps/web/.next

# 2. Reinstall dependencies
pnpm install --frozen-lockfile

# 3. Run the exact Vercel build command
cd apps/web && cd ../.. && pnpm --filter @jobpulse/web... run build

# 4. Verify quality gates
pnpm typecheck
pnpm test
pnpm lint
```

All steps must succeed before declaring deployment readiness.
