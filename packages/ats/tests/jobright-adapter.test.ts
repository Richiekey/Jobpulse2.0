import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobrightAdapter } from '../src/adapters/jobright.adapter.js';
import { httpClient } from '@jobpulse/shared';
import type { CompanySourceConfig } from '@jobpulse/domain';

describe('JobrightAdapter Restoration & GitHub Discovery Suite', () => {
  let adapter: JobrightAdapter;

  const mockConfig: CompanySourceConfig = {
    sourceId: '10000000-0000-0000-0000-000000000005',
    companyId: '20000000-0000-0000-0000-000000000009',
    sourceIdentifier: '2026-Software-Engineer-New-Grad',
    sourceUrl: 'https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md',
    isActive: true,
  };

  const sampleMarkdownTable = `
# 2026 Software Engineer New Grad Job Board

| Company | Job Title | Location | Work Model | Date Posted |
| ----- | --------- |  --------- | ---- | ------- |
| **[Guidehouse](https://guidehouse.com)** | **[DevSecOps Cloud Engineer](https://jobright.ai/jobs/info/6a7cb1a377d5f033c4b90040?utm_campaign=SWE)** | San Antonio, TX, United States | Remote | Sep 03 |
| ↳ | **[Cloud Security Analyst](https://jobright.ai/jobs/info/6a7cb1a377d5f033c4b90041?utm_campaign=SWE)** | Washington, DC, United States | Hybrid | Sep 03 |
| ↳ | **[Junior DevOps Engineer](https://jobright.ai/jobs/info/6a7cb1a377d5f033c4b90042?utm_campaign=SWE)** | Reston, VA, United States | On Site | Sep 02 |
| **[Draper](https://www.draper.com)** | **[Software Quality Engineer](https://jobright.ai/jobs/info/6a9955c750bfe8474621f9c1?utm_campaign=SWE)** | Cambridge, MA, United States | On Site | Sep 01 |
| **[Macy's](http://www.macysjobs.com)** | **[Software Engineer](https://jobright.ai/jobs/info/6a996a5b8a8b765bc55f2dd6?utm_campaign=SWE)** | New York, NY, United States | Hybrid | Aug 30 |
| **[Stripe](https://stripe.com)** | **[Frontend Engineer](https://jobright.ai/jobs/info/6a1234567890123456789012?utm_campaign=SWE)** | Seattle, WA | Remote | 2026-08-28 |
| **[Datadog](https://datadog.com)** | **[Backend Systems Engineer](https://jobright.ai/jobs/info/6a2345678901234567890123?utm_campaign=SWE)** | Boston, MA | Onsite | Aug 27 |
| **[Snowflake](https://snowflake.com)** | **[Core DB Engineer](https://jobright.ai/jobs/info/6a3456789012345678901234?utm_campaign=SWE)** | San Mateo, CA | Hybrid | Aug 25 |
| **[Palantir](https://palantir.com)** | **[Forward Deployed Engineer](https://jobright.ai/jobs/info/6a4567890123456789012345?utm_campaign=SWE)** | New York, NY | On-site | Aug 20 |
| **[Figma](https://figma.com)** | **[Graphics Platform Engineer](https://jobright.ai/jobs/info/6a5678901234567890123456?utm_campaign=SWE)** | San Francisco, CA | Remote | Aug 15 |
`;

  beforeEach(() => {
    vi.restoreAllMocks();
    adapter = new JobrightAdapter();
  });

  it('Test 1 — README discovery: Mock GitHub raw README and verify successful retrieval', async () => {
    const getSpy = vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: sampleMarkdownTable,
      url: 'https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md',
    });

    const candidates = await adapter.discover(mockConfig);
    expect(getSpy).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md',
      expect.anything()
    );
    expect(candidates.length).toBe(10);
  });

  it('Test 2 — master fallback: Master returns 404, Main succeeds, verifies fallback', async () => {
    vi.spyOn(httpClient, 'get')
      .mockRejectedValueOnce(new Error('HTTP_ERROR: Status 404'))
      .mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: sampleMarkdownTable,
        url: 'https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/main/README.md',
      });

    const candidates = await adapter.discover(mockConfig);
    expect(candidates.length).toBe(10);
    expect(candidates[0]?.discoveryUrl).toContain('/main/README.md');
  });

  it('Test 3 — Markdown parsing: Fixture containing 10+ jobs verifies candidates created', () => {
    const result = adapter.parseMarkdownTable(
      sampleMarkdownTable,
      '2026-Software-Engineer-New-Grad',
      new Date('2026-09-03T12:00:00Z')
    );

    expect(result.candidates).toHaveLength(10);
    expect(result.rowsParsed).toBe(10);
    expect(result.rowsRejected).toBe(0);
  });

  it('Test 4 — Jobright ID extraction: Extracts clean externalJobId handling query parameters', () => {
    const row = `| **[Test](https://test.com)** | **[Engineer](https://jobright.ai/jobs/info/6a7cb1a377d5f033c4b90040?utm_campaign=Test&utm_source=123)** | NYC | Remote | Sep 03 |`;
    const result = adapter.parseMarkdownTable(row, 'test-repo');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.externalJobId).toBe('6a7cb1a377d5f033c4b90040');
    expect(result.candidates[0]?.sourceJobUrl).toBe(
      'https://jobright.ai/jobs/info/6a7cb1a377d5f033c4b90040'
    );
  });

  it('Test 5 — Company inheritance: ↳ inherits previous company and website', () => {
    const tableWithInheritance = `
| Company | Job Title | Location | Work Model | Date Posted |
| ----- | --------- |  --------- | ---- | ------- |
| **[Guidehouse](https://guidehouse.com)** | **[Job 1](https://jobright.ai/jobs/info/id1)** | Austin, TX | Remote | Sep 03 |
| ↳ | **[Job 2](https://jobright.ai/jobs/info/id2)** | Dallas, TX | Hybrid | Sep 03 |
| ↳ | **[Job 3](https://jobright.ai/jobs/info/id3)** | Houston, TX | Onsite | Sep 03 |
`;
    const result = adapter.parseMarkdownTable(tableWithInheritance, 'test-repo');

    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0]?.companyName).toBe('Guidehouse');
    expect(result.candidates[1]?.companyName).toBe('Guidehouse');
    expect(result.candidates[2]?.companyName).toBe('Guidehouse');

    expect(result.candidates[0]?.companyWebsite).toBe('https://guidehouse.com');
    expect(result.candidates[1]?.companyWebsite).toBe('https://guidehouse.com');
    expect(result.candidates[2]?.companyWebsite).toBe('https://guidehouse.com');

    // Asserts never named '↳'
    expect(result.candidates.some((c) => c.companyName === '↳')).toBe(false);
  });

  it('Test 6 — Workplace normalization: Remote, Hybrid, On Site, Onsite, On-site normalize correctly', () => {
    const tableWorkplace = `
| Company | Job Title | Location | Work Model | Date Posted |
| ----- | --------- |  --------- | ---- | ------- |
| Comp | **[Job 1](https://jobright.ai/jobs/info/id1)** | NY | Remote | Sep 03 |
| Comp | **[Job 2](https://jobright.ai/jobs/info/id2)** | SF | Hybrid | Sep 03 |
| Comp | **[Job 3](https://jobright.ai/jobs/info/id3)** | LA | On Site | Sep 03 |
| Comp | **[Job 4](https://jobright.ai/jobs/info/id4)** | CHI | Onsite | Sep 03 |
| Comp | **[Job 5](https://jobright.ai/jobs/info/id5)** | BOS | On-site | Sep 03 |
`;
    const result = adapter.parseMarkdownTable(tableWorkplace, 'test-repo');

    expect(result.candidates[0]?.workplaceType).toBe('remote');
    expect(result.candidates[1]?.workplaceType).toBe('hybrid');
    expect(result.candidates[2]?.workplaceType).toBe('onsite');
    expect(result.candidates[3]?.workplaceType).toBe('onsite');
    expect(result.candidates[4]?.workplaceType).toBe('onsite');
  });

  it('Test 7 — Date parsing: Sep 03, Aug 30, and rollover handled relative to crawl time', () => {
    const crawlDate = new Date('2026-09-03T12:00:00Z');
    const parsedSep = adapter.parseDate('Sep 03', crawlDate);
    expect(parsedSep).toContain('2026-09-03');

    const parsedAug = adapter.parseDate('Aug 30', crawlDate);
    expect(parsedAug).toContain('2026-08-30');

    // Year rollover test: crawl in January, post date in December -> previous year
    const janCrawl = new Date('2026-01-10T12:00:00Z');
    const parsedDec = adapter.parseDate('Dec 28', janCrawl);
    expect(parsedDec).toContain('2025-12-28');
  });

  it('Test 8 — Missing optional columns: rows missing optional values still produce valid candidates', () => {
    const minimalRow = `| MinimalCo | **[Software Engineer](https://jobright.ai/jobs/info/min_01)** | | | |`;
    const result = adapter.parseMarkdownTable(minimalRow, 'test-repo');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.title).toBe('Software Engineer');
    expect(result.candidates[0]?.companyName).toBe('MinimalCo');
    expect(result.candidates[0]?.workplaceType).toBe('unspecified');
  });

  it('Test 9 — Malformed row isolation: one malformed row does not prevent other jobs from being parsed', () => {
    const tableWithBrokenRow = `
| Company | Job Title | Location | Work Model | Date Posted |
| ----- | --------- |  --------- | ---- | ------- |
| **[GoodCo](https://good.com)** | **[Dev](https://jobright.ai/jobs/info/good1)** | Austin, TX | Remote | Sep 03 |
| Broken row without cells or link |
| | | | | |
| **[AnotherCo](https://another.com)** | **[QA](https://jobright.ai/jobs/info/good2)** | Dallas, TX | On Site | Sep 03 |
`;
    const result = adapter.parseMarkdownTable(tableWithBrokenRow, 'test-repo');

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.externalJobId).toBe('good1');
    expect(result.candidates[1]?.externalJobId).toBe('good2');
  });

  it('Test 10 — Empty repository: returns empty array cleanly without crashing', async () => {
    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: '# Empty Repository\n\nNo jobs available right now.\n',
      url: 'https://raw.githubusercontent.com/jobright-ai/empty/master/README.md',
    });

    const candidates = await adapter.discover({
      ...mockConfig,
      sourceIdentifier: 'empty',
    });
    expect(candidates).toEqual([]);
  });

  it('Test 11 — Repository HTTP failure surfaces as source-level failure', async () => {
    vi.spyOn(httpClient, 'get')
      .mockRejectedValueOnce(new Error('HTTP_ERROR: Status 404'))
      .mockRejectedValueOnce(new Error('HTTP_ERROR: Status 404'));

    await expect(adapter.discover(mockConfig)).rejects.toThrow('Failed to fetch Jobright README');
  });

  it('Test 12 — Duplicate IDs: Duplicate Jobright IDs in same README do not create duplicate candidates', () => {
    const duplicateTable = `
| Company | Job Title | Location | Work Model | Date Posted |
| ----- | --------- |  --------- | ---- | ------- |
| **[CompA](https://a.com)** | **[Title 1](https://jobright.ai/jobs/info/duplicate_id)** | Austin, TX | Remote | Sep 03 |
| **[CompB](https://b.com)** | **[Title 2](https://jobright.ai/jobs/info/duplicate_id)** | Dallas, TX | Hybrid | Sep 03 |
`;
    const result = adapter.parseMarkdownTable(duplicateTable, 'test-repo');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.externalJobId).toBe('duplicate_id');
  });

  it('Test 13 — No per-job HTTP: discover downloads README and fetch performs 0 Jobright detail requests', async () => {
    const getSpy = vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: sampleMarkdownTable,
      url: 'https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md',
    });

    const candidates = await adapter.discover(mockConfig);
    expect(candidates.length).toBe(10);
    expect(getSpy).toHaveBeenCalledTimes(1);

    // Fetch all 10 candidates
    for (const candidate of candidates) {
      const rawPayload = await adapter.fetch(candidate);
      expect(rawPayload.sourceId).toBe(mockConfig.sourceId);
      expect(rawPayload.externalId).toBe(candidate.externalJobId);
      expect(rawPayload.payload).toBeTruthy();
    }

    // Zero additional HTTP calls during fetch
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('Test 14 — Application URL correctness: Does NOT synthesize /application or guess employer URLs', async () => {
    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: sampleMarkdownTable,
      url: 'https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md',
    });

    const [candidate] = await adapter.discover(mockConfig);
    const rawPayload = await adapter.fetch(candidate!);
    const rawJob = await adapter.parse(rawPayload);

    expect(rawJob.rawApplyUrl).toBeUndefined();
    expect(rawJob.sourceJobUrl).toBe(
      'https://jobright.ai/jobs/info/6a7cb1a377d5f033c4b90040'
    );

    const appUrl = await adapter.resolveApplicationUrl(candidate!, rawJob);
    // Preserves sourceJobUrl, does NOT fabricate /application
    expect(appUrl).toBe('https://jobright.ai/jobs/info/6a7cb1a377d5f033c4b90040');
    expect(appUrl).not.toContain('/application');
  });

  it('Test 15 — Payload determinism: Equivalent parsed rows produce deterministic payload hashes', async () => {
    vi.spyOn(httpClient, 'get').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: sampleMarkdownTable,
      url: 'https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md',
    });

    const candidates1 = await adapter.discover(mockConfig);
    const payload1 = await adapter.fetch(candidates1[0]!);

    const candidates2 = await adapter.discover(mockConfig);
    const payload2 = await adapter.fetch(candidates2[0]!);

    expect(payload1.payloadHash).toBe(payload2.payloadHash);
  });

  it('Test 16 — Idempotency: Running the same repository twice produces valid identical candidates', async () => {
    vi.spyOn(httpClient, 'get').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: sampleMarkdownTable,
      url: 'https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md',
    });

    const run1 = await adapter.discover(mockConfig);
    const run2 = await adapter.discover(mockConfig);

    expect(run1.length).toBe(run2.length);
    for (let i = 0; i < run1.length; i++) {
      expect(run1[i]?.externalJobId).toBe(run2[i]?.externalJobId);
      expect(run1[i]?.sourceJobUrl).toBe(run2[i]?.sourceJobUrl);
    }
  });

  it('Test 17 — Hardened URL Extraction: captures embedded URLs and direct ATS apply links in sourceMetadata', () => {
    const markdownWithAts = `
| Company | Job Title | Location | Work Model | Date Posted |
| ----- | --------- |  --------- | ---- | ------- |
| **[Acme](https://acme.com)** | **[Engineer](https://jobright.ai/jobs/info/acme_123)** [Direct Apply](https://boards.greenhouse.io/acme/jobs/999) [Greenhouse Board](https://boards.greenhouse.io/acme) | New York, NY | Remote | Sep 03 |
`;
    const result = adapter.parseMarkdownTable(markdownWithAts, 'test-repo');
    expect(result.candidates).toHaveLength(1);
    const row = result.candidates[0];
    expect(row).toBeDefined();
    // Direct Apply text routes to original_apply_url
    expect(row?.original_apply_url).toBe('https://boards.greenhouse.io/acme/jobs/999');
    // Non-apply ATS link routes to ats_url
    expect(row?.ats_url).toBe('https://boards.greenhouse.io/acme');
  });

  it('Test 18 — URL Confidence Ranking: direct ATS URL wins over Jobright fallback link', async () => {
    const markdownWithAts = `
| Company | Job Title | Location | Work Model | Date Posted |
| ----- | --------- |  --------- | ---- | ------- |
| **[Acme](https://acme.com)** | **[Engineer](https://jobright.ai/jobs/info/acme_123)** [Direct Apply](https://boards.greenhouse.io/acme/jobs/999) | New York, NY | Remote | Sep 03 |
`;
    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: markdownWithAts,
      url: 'https://raw.githubusercontent.com/jobright-ai/test/master/README.md',
    });

    const [candidate] = await adapter.discover(mockConfig);
    const rawPayload = await adapter.fetch(candidate!);
    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

    // Invariant: Direct ATS apply URL must win over Jobright info fallback
    expect(normalized.urls.applyUrl).toBe('https://boards.greenhouse.io/acme/jobs/999');
    expect(normalized.urls.urlResolutionConfidence).toBeGreaterThanOrEqual(0.75);
    expect(normalized.urls.sourceJobUrl).toBe('https://jobright.ai/jobs/info/acme_123');
  });

  it('Test 19 — URL Pure Fallback: when no direct ATS link exists, Jobright URL is 0.40 confidence fallback', async () => {
    const markdownNoAts = `
| Company | Job Title | Location | Work Model | Date Posted |
| ----- | --------- |  --------- | ---- | ------- |
| **[SimpleCo](https://simple.com)** | **[Analyst](https://jobright.ai/jobs/info/simple_456)** | Chicago, IL | Onsite | Sep 03 |
`;
    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: markdownNoAts,
      url: 'https://raw.githubusercontent.com/jobright-ai/test/master/README.md',
    });

    const [candidate] = await adapter.discover(mockConfig);
    const rawPayload = await adapter.fetch(candidate!);
    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

    // Fallback confidence must strictly be 0.40
    expect(normalized.urls.applyUrl).toBe('https://jobright.ai/jobs/info/simple_456');
    expect(normalized.urls.urlResolutionConfidence).toBe(0.4);
  });
});
