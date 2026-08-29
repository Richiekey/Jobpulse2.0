# JobPulse 2.0 — Authentication & Authorization

## 1. Authentication Engine

JobPulse 2.0 delegates cryptographic authentication and session management to **Supabase Auth**:
- Secure PKCE OAuth flows (GitHub, Google, LinkedIn).
- Email & password authentication with email verification.
- JWT bearer tokens signed by Supabase Auth with standard claims (`sub` = user UUID).
- Automatic JWT refresh and local session caching via `@supabase/ssr` in Next.js App Router.

---

## 2. Authorization Hierarchy & Roles

Roles are stored in the `profiles` table and verified at the database and API route layer:

```
[Anonymous Visitor]
      │
      ├─► Public Read: Active jobs, companies, search feed
      │
[Authenticated User]
      │
      ├─► Full Personal State: Saved jobs, hidden jobs, application tracker
      ├─► Profile settings & integrations
      │
[Admin User]
      │
      ├─► Scraper operations & telemetry
      ├─► Company & ATS source management
      └─► Ingestion logs & manual scrape triggering
```

---

## 3. Defense-in-Depth Implementation

1. **Database Level**: PostgreSQL Row Level Security (RLS) policies evaluate `auth.uid() = user_id`. Even with direct SQL queries from an authenticated context, cross-tenant data access is blocked.
2. **Server-Side API Route Level**: Next.js route handlers extract the user session via Supabase server helper and enforce identity before executing application business logic.
3. **Frontend Level**: UI state conditionally displays actions based on user session, without treating frontend state as authoritative.
