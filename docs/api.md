# JobPulse 2.0 — API Architecture & Contracts

## 1. Route Design

All API routes follow standard RESTful patterns with JSON payloads, cursor pagination, and structured error responses.

```
/api/jobs/feed              GET     - Query public feed with cursor pagination
/api/jobs/[id]              GET     - Get detailed job posting by ID
/api/search                 GET     - Full-text search with faceted filters
/api/companies              GET     - List verified companies
/api/saved                  GET     - List user's saved jobs
/api/saved                  POST    - Save a job (body: { jobId })
/api/saved/[jobId]          DELETE  - Remove a saved job
/api/hidden                 GET     - List user's hidden jobs
/api/hidden                 POST    - Hide a job from feed (body: { jobId })
/api/hidden/[jobId]         DELETE  - Unhide a job
/api/applications           GET     - Get user's application tracker
/api/applications           POST    - Record a new job application
/api/applications/[id]      PATCH   - Update application status / notes
/api/user/profile           GET     - Fetch current user profile & role
/api/user/integrations      GET     - Fetch user integration credentials
/api/admin/scrape/trigger   POST    - Trigger scrape run (Admin only)
/api/admin/metrics          GET     - Fetch operational telemetry (Admin only)
/health                     GET     - Process liveness check
/ready                      GET     - Process readiness check (DB connection verified)
```

---

## 2. Keyset / Cursor Pagination Schema

For high-throughput, stable feed traversal, pagination relies on keyset ordering:

### Request Query Parameters:
```
GET /api/jobs/feed?cursor=2026-08-28T14:30:00Z:a89c1f2e-1234&limit=20&workplace=remote&q=react
```

### Response Payload:
```json
{
  "data": [
    {
      "id": "a89c1f2e-1234",
      "canonical_title": "Senior Frontend Engineer",
      "display_title": "Senior Frontend Engineer (React/TypeScript)",
      "company": {
        "id": "c1a2b3c4-5678",
        "name": "Acme Corp",
        "logo_url": "https://...",
        "website": "https://acme.com"
      },
      "workplace_type": "remote",
      "employment_type": "full_time",
      "locations": ["San Francisco, CA", "Remote"],
      "salary": {
        "min": 160000,
        "max": 200000,
        "currency": "USD",
        "interval": "yearly"
      },
      "skills": ["TypeScript", "React", "Next.js"],
      "posted_at": "2026-08-28T14:30:00Z",
      "canonical_url": "https://acme.com/jobs/senior-frontend",
      "apply_url": "https://boards.greenhouse.io/acme/jobs/123#app"
    }
  ],
  "pagination": {
    "next_cursor": "2026-08-27T10:15:00Z:f4b2e1d0-9988",
    "has_more": true
  }
}
```
