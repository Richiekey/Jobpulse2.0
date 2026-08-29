# JobPulse 2.0 — ATS Registry & Adapter Architecture

## 1. Unified ATS Registry

The ATS registry is the canonical source of truth for all supported applicant tracking systems. It powers:
1. ATS detection from URLs.
2. Ingestion adapter selection.
3. URL resolution priority rules.
4. Validation patterns and analytics categorization.

```typescript
export interface ATSDefinition {
  id: string;
  name: string;
  slug: string;
  domains: string[];
  jobUrlPatterns: RegExp[];
  applyUrlPatterns: RegExp[];
  capabilities: {
    hasPublicApi: boolean;
    supportsIncrementalSync: boolean;
    providesStructuredData: boolean;
    requiresBrowserRendering: boolean;
  };
}
```

### Supported Platforms Roster

- **Greenhouse**: `boards.greenhouse.io`, `job-boards.greenhouse.io`
- **Lever**: `jobs.lever.co`
- **Ashby**: `jobs.ashbyhq.com`
- **Workday**: `*.myworkdayjobs.com`
- **iCIMS**: `*.icims.com`
- **Jobvite**: `jobs.jobvite.com`
- **BambooHR**: `*.bamboohr.com/careers`
- **Recruitee**: `*.recruitee.com`
- **Teamtailor**: `*.teamtailor.com`
- **SmartRecruiters**: `jobs.smartrecruiters.com`
- **Jobright**: Special secondary source / discovery aggregator

---

## 2. Adapter Lifecycle Contract

Every ATS adapter must implement the strict `ATSAdapter` interface:

```typescript
export interface ATSAdapter {
  readonly platformSlug: string;
  readonly parserVersion: string;

  /**
   * Discovers job postings/candidates for a given company configuration.
   */
  discover(companySource: CompanySourceConfig): Promise<JobCandidate[]>;

  /**
   * Fetches raw payload for a candidate.
   */
  fetch(candidate: JobCandidate): Promise<RawJobPayload>;

  /**
   * Parses raw payload into an intermediate RawJob representation.
   */
  parse(rawPayload: RawJobPayload): Promise<RawJob>;

  /**
   * Normalizes RawJob into a canonical NormalizedJob representation.
   */
  normalize(rawJob: RawJob): Promise<NormalizedJob>;

  /**
   * Validates NormalizedJob against data quality rules.
   */
  validate(job: NormalizedJob): ValidationResult;
}
```

---

## 3. Separation of Concerns: Adapters vs. Persistence

Adapters never touch database tables directly.

```
[External ATS]
      │
      ▼
[ATS Adapter] ──(discover/fetch/parse)──► [RawJob]
                                             │
                                             ▼
                                      [Normalizer]
                                             │
                                             ▼
                                     [NormalizedJob]
                                             │
                                             ▼
                                     [URL Resolver]
                                             │
                                             ▼
                                       [Validator]
                                             │
                                             ▼
                                    [Database Upsert]
```

This strict separation ensures:
- Adapters can be unit-tested in complete isolation using fixture JSON/HTML files.
- Upgrading an adapter parser does not require database migration changes.
- Ingestion errors can be categorized and tracked per parser version.
