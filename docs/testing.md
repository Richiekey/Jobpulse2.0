# JobPulse 2.0 — Testing Strategy & Quality Gates

## 1. Test Pyramid & Automation Levels

```
                     ┌──────────────────┐
                     │   E2E Tests      │  Full pipeline & user journeys (Playwright)
                     ├──────────────────┤
                     │ Integration Tests│  Database repositories, API endpoints, RLS
                     ├──────────────────┤
                     │ Contract Tests   │  ATS fixtures, rate limit backoff, SSRF
                     ├──────────────────┤
                     │   Unit Tests     │  Normalizers, URL resolvers, validators
                     └──────────────────┘
```

---

## 2. ATS Adapter Contract Tests & Golden Fixtures

Every ATS adapter must execute against sanitized, real-world golden fixtures stored in `packages/ats/tests/fixtures/`:
- `fixtures/greenhouse/job_board_list.json`
- `fixtures/greenhouse/job_detail_standard.json`
- `fixtures/greenhouse/job_detail_multilocation.json`
- `fixtures/lever/postings_list.json`
- `fixtures/ashby/job_board.json`
- `fixtures/jobright/jobright_page.html`

### Mandatory Assertions for Every Adapter:
1. Returns valid non-empty `JobCandidate[]` on discovery.
2. Extracts stable, deterministic `external_job_id`.
3. Normalizes title, workplace type, and location correctly.
4. Handles empty lists without throwing.
5. Handles malformed JSON and 404/500 HTTP responses gracefully.
6. Sanitizes HTML descriptions and extracts apply URLs without tracking bloat.

---

## 3. Security & Invariant Test Suites

Automated tests in `supabase/tests/` or integration suites verify:
- **Tenant Isolation**: User A cannot read, mutate, or delete User B's saved jobs or applications.
- **Admin Gating**: Non-admin users cannot trigger scraper runs or mutate ATS definitions.
- **Deduplication Invariant**: Ingesting the same external job payload twice results in an update/refresh, never a duplicate record.
