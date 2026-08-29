# JobPulse 2.0 — Security & Threat Modeling Specification

## 1. Security Architecture Principles

1. **Authentication != Authorization**: Knowing a user's identity is not authorization to access a resource. Ownership must be cryptographically and relationally enforced.
2. **Defense in Depth**: Database-level Row Level Security (RLS) is active on every user-owned table. Even if an API handler has a bug, the database rejects unauthorized queries.
3. **Least Privilege**: The frontend only receives the Supabase Anon Publishable Key. The `service_role` key is strictly isolated to backend background workers and secure server-only contexts.
4. **Zero Trust in External Data**: External ATS websites, webhooks, and raw payloads are treated as untrusted and potentially adversarial input.

---

## 2. Row Level Security (RLS) Matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | `auth.uid() = id` (or admin) | `auth.uid() = id` | `auth.uid() = id` | `auth.uid() = id` |
| `jobs` | Public (`status = 'active'`) | `service_role` only | `service_role` only | `service_role` only |
| `companies` | Public | `service_role` / Admin | `service_role` / Admin | Admin only |
| `saved_jobs` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `hidden_jobs` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `applications` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `user_preferences` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `user_integrations` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `scrape_runs` | Admin / `service_role` | `service_role` only | `service_role` only | Admin only |
| `raw_job_payloads` | Admin / `service_role` | `service_role` only | `service_role` only | Admin only |

---

## 3. Server-Side Request Forgery (SSRF) Defenses

When the worker resolves URLs, extracts job pages, or follows redirects, it passes all target URLs through a strict SSRF guard:

1. **IP Range Blacklisting**:
   - Loopback (`127.0.0.0/8`, `::1`)
   - Private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
   - Link-local addresses (`169.254.0.0/16`, `fe80::/10`)
   - Cloud metadata services (`169.254.169.254`, `metadata.google.internal`)
2. **Protocol Whitelisting**: Only `http:` and `https:` schemes are permitted. Schemes such as `file:`, `ftp:`, `gopher:`, or `data:` are immediately rejected.
3. **Redirect Target Revalidation**: Every HTTP 3xx redirect destination is validated before following.

---

## 4. Threat Model & Mitigation Matrix

| Threat | Attack Vector | Impact | Mitigation |
|---|---|---|---|
| **Cross-Tenant Data Leak** | User A queries `/api/saved` with User B's `user_id`. | Unauthorized access to job hunting history. | Supabase RLS enforces `auth.uid() = user_id`. API routes ignore client-supplied `user_id` and read session claims directly. |
| **Scraper Abuse & Denial of Service** | Malicious user floods scraper triggers. | Resource exhaustion, ATS IP bans. | Scraper execution is strictly gated behind Admin role and distributed lock. |
| **Payload Injection / XSS** | ATS description contains malicious `<script>` tags. | XSS execution in job detail viewer. | HTML sanitization via DOMPurify / sanitize-html before rendering. Strict Content Security Policy (CSP). |
| **Malicious Apply URL** | Job source provides phishing URL. | User gets redirected to credential harvester. | URL resolver validates against known ATS domains and parses URL syntax strictly before publishing. |
| **Secret Leakage** | `SUPABASE_SERVICE_ROLE_KEY` committed to Git or bundle. | Full database bypass. | Git pre-commit hooks, secret scanning in CI, env variable linting. |
