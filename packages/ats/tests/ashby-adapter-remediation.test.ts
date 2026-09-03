import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AshbyAdapter } from '../src/adapters/ashby.adapter.js';
import { httpClient } from '@jobpulse/shared';
import type { CompanySourceConfig, JobCandidate } from '@jobpulse/domain';

describe('AshbyAdapter Remediation Verification Suite', () => {
  let adapter: AshbyAdapter;

  const mockConfig: CompanySourceConfig = {
    sourceId: '10000000-0000-0000-0000-000000000003',
    companyId: '20000000-0000-0000-0000-000000000001',
    sourceIdentifier: 'test-co',
    sourceUrl: 'https://jobs.ashbyhq.com/test-co',
    isActive: true,
  };

  const sampleBoardJobs = [
    {
      id: 'job-1',
      title: 'Senior Software Engineer',
      location: 'San Francisco, CA',
      secondaryLocations: [
        {
          location: 'New York, NY',
          address: {
            postalAddress: {
              addressLocality: 'New York',
              addressRegion: 'NY',
              addressCountry: 'US',
            },
          },
        },
      ],
      department: 'Engineering',
      team: 'Core Platform',
      employmentType: 'FullTime',
      isRemote: false,
      jobUrl: 'https://jobs.ashbyhq.com/test-co/job-1',
      applyUrl: 'https://jobs.ashbyhq.com/test-co/job-1/application',
      publishedAt: '2026-08-30T10:00:00.000Z',
      descriptionPlain: 'Build distributed systems at scale.',
      descriptionHtml: '<p>Build distributed systems at scale.</p>',
      compensation: {
        compensationTierSummary: '$180,000 - $240,000 USD',
        scrapeableCompensationSalarySummary: '$180,000 - $240,000',
        compensationTiers: [
          {
            tierSummary: '$180,000 - $240,000 USD',
            components: [
              {
                summary: '$180,000 - $240,000',
                compensationType: 'Salary',
                interval: '1 YEAR',
                currencyCode: 'USD',
                minValue: 180000,
                maxValue: 240000,
              },
            ],
          },
        ],
      },
    },
    {
      id: 'job-2',
      title: 'Remote Product Designer',
      location: 'Remote, US',
      isRemote: true,
      jobUrl: 'https://jobs.ashbyhq.com/test-co/job-2',
      applyUrl: 'https://jobs.ashbyhq.com/test-co/job-2/application',
      publishedAt: '2026-08-31T12:00:00.000Z',
      descriptionHtml: '<p>Design delightful user experiences.</p><br/><p>Work from anywhere.</p>',
    },
    {
      id: 'job-3',
      title: 'Data Analyst',
      location: 'Austin, TX',
      employmentType: 'Contract',
      isRemote: false,
      jobUrl: 'https://jobs.ashbyhq.com/test-co/job-3',
      publishedAt: '2026-09-01T08:00:00.000Z',
      descriptionPlain: 'Analyze behavioral cohorts and SQL metrics.',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    adapter = new AshbyAdapter();
  });

  it('Test 1 — Board payload ingestion: 3 jobs in board response all reach parsing & normalization', async () => {
    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: { jobs: sampleBoardJobs },
      url: 'https://api.ashbyhq.com/posting-api/job-board/test-co?includeCompensation=true',
    });

    const candidates = await adapter.discover(mockConfig);
    expect(candidates).toHaveLength(3);

    for (const candidate of candidates) {
      const rawPayload = await adapter.fetch(candidate);
      const rawJob = await adapter.parse(rawPayload);
      const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);
      const validation = adapter.validate(normalized);

      expect(validation.isValid).toBe(true);
      expect(normalized.canonicalTitle).toBeTruthy();
    }
  });

  it('Test 2 — No per-job HTTP requests: Assert exactly 1 board call and 0 /job/{id} calls', async () => {
    const getSpy = vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: { jobs: sampleBoardJobs },
      url: 'https://api.ashbyhq.com/posting-api/job-board/test-co?includeCompensation=true',
    });

    const candidates = await adapter.discover(mockConfig);
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith(
      'https://api.ashbyhq.com/posting-api/job-board/test-co?includeCompensation=true'
    );

    // Fetch all candidates
    for (const candidate of candidates) {
      await adapter.fetch(candidate);
    }

    // Still exactly 1 call total: 0 individual /job/{id} calls!
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('Test 3 — Complete payload preservation: compensation, locations, employmentType, descriptions', async () => {
    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: { jobs: [sampleBoardJobs[0]!] },
      url: 'https://api.ashbyhq.com/posting-api/job-board/test-co?includeCompensation=true',
    });

    const [candidate] = await adapter.discover(mockConfig);
    const rawPayload = await adapter.fetch(candidate!);
    const rawJob = await adapter.parse(rawPayload);

    expect(rawJob.rawTitle).toBe('Senior Software Engineer');
    expect(rawJob.rawSalary).toBe('$180,000 - $240,000 USD');
    expect(rawJob.rawLocations).toContain('San Francisco, CA');
    expect(rawJob.rawLocations).toContain('New York, NY');
    expect(rawJob.rawLocations).toContain('New York, NY, US');
    expect(rawJob.rawEmploymentType).toBe('FullTime');
    expect(rawJob.sourceMetadata?.['department']).toBe('Engineering');
    expect(rawJob.sourceMetadata?.['team']).toBe('Core Platform');

    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);
    expect(normalized.salary?.min).toBe(180000);
    expect(normalized.salary?.max).toBe(240000);
    expect(normalized.salary?.currency).toBe('USD');
    expect(normalized.salary?.interval).toBe('yearly');
  });

  it('Test 4 — Multiple locations: Primary + secondary + structured postalAddress', async () => {
    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: { jobs: [sampleBoardJobs[0]!] },
      url: 'https://api.ashbyhq.com/posting-api/job-board/test-co?includeCompensation=true',
    });

    const [candidate] = await adapter.discover(mockConfig);
    const rawPayload = await adapter.fetch(candidate!);
    const rawJob = await adapter.parse(rawPayload);

    expect(rawJob.rawLocations.length).toBeGreaterThanOrEqual(3);
    expect(rawJob.rawLocations).toEqual(
      expect.arrayContaining(['San Francisco, CA', 'New York, NY', 'New York, NY, US'])
    );
  });

  it('Test 5 — Remote classification: explicit isRemote=true and inference', async () => {
    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: { jobs: [sampleBoardJobs[1]!] },
      url: 'https://api.ashbyhq.com/posting-api/job-board/test-co?includeCompensation=true',
    });

    const [candidate] = await adapter.discover(mockConfig);
    const rawPayload = await adapter.fetch(candidate!);
    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

    expect(rawJob.rawWorkplaceType).toBe('remote');
    expect(normalized.workplaceType).toBe('remote');
  });

  it('Test 6 — Missing description fallback: HTML to plain text conversion when plain is missing', async () => {
    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: { jobs: [sampleBoardJobs[1]!] }, // job-2 has descriptionHtml only
      url: 'https://api.ashbyhq.com/posting-api/job-board/test-co?includeCompensation=true',
    });

    const [candidate] = await adapter.discover(mockConfig);
    const rawPayload = await adapter.fetch(candidate!);
    const rawJob = await adapter.parse(rawPayload);

    expect(rawJob.rawDescription).toContain('Design delightful user experiences');
    expect(rawJob.rawDescription).toContain('Work from anywhere');
    expect(rawJob.rawDescription).not.toContain('<p>');
  });

  it('Test 7 — Invalid individual job isolation: Malformed job does not abort valid jobs', async () => {
    const mixedJobs = [
      ...sampleBoardJobs,
      {
        id: 'bad-job',
        title: '', // Missing title
        location: '',
      },
    ];

    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: { jobs: mixedJobs },
      url: 'https://api.ashbyhq.com/posting-api/job-board/test-co?includeCompensation=true',
    });

    const candidates = await adapter.discover(mockConfig);
    expect(candidates).toHaveLength(4);

    const validCount: boolean[] = [];
    for (const candidate of candidates) {
      const rawPayload = await adapter.fetch(candidate);
      const rawJob = await adapter.parse(rawPayload);
      const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);
      const validation = adapter.validate(normalized);
      validCount.push(validation.isValid);
    }

    // 3 valid jobs, 1 invalid job
    expect(validCount.filter(Boolean)).toHaveLength(3);
    expect(validCount.filter((v) => !v)).toHaveLength(1);
  });

  it('Test 8 — Board-level HTTP failure surfaces as source-level failure', async () => {
    vi.spyOn(httpClient, 'get').mockRejectedValueOnce(new Error('SERVER_ERROR: Status 500'));

    await expect(adapter.discover(mockConfig)).rejects.toThrow('SERVER_ERROR: Status 500');
  });

  it('Test 9 — Idempotency: Running same board payload twice produces consistent payload hashes', async () => {
    vi.spyOn(httpClient, 'get').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: { jobs: [sampleBoardJobs[0]!] },
      url: 'https://api.ashbyhq.com/posting-api/job-board/test-co?includeCompensation=true',
    });

    const candidates1 = await adapter.discover(mockConfig);
    const rawPayload1 = await adapter.fetch(candidates1[0]!);

    const candidates2 = await adapter.discover(mockConfig);
    const rawPayload2 = await adapter.fetch(candidates2[0]!);

    expect(rawPayload1.payloadHash).toBe(rawPayload2.payloadHash);
    expect(rawPayload1.externalId).toBe(rawPayload2.externalId);
  });

  it('Test 10 — Application URL correctness: Uses explicit applyUrl without synthesizing /application', async () => {
    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      data: { jobs: [sampleBoardJobs[0]!] },
      url: 'https://api.ashbyhq.com/posting-api/job-board/test-co?includeCompensation=true',
    });

    const [candidate] = await adapter.discover(mockConfig);
    const rawPayload = await adapter.fetch(candidate!);
    const rawJob = await adapter.parse(rawPayload);

    expect(rawJob.rawApplyUrl).toBe('https://jobs.ashbyhq.com/test-co/job-1/application');
    expect(rawJob.sourceJobUrl).toBe('https://jobs.ashbyhq.com/test-co/job-1');

    const appUrl = await adapter.resolveApplicationUrl(candidate!, rawJob);
    expect(appUrl).toBe('https://jobs.ashbyhq.com/test-co/job-1/application');

    // Case 2: Job with no explicit applyUrl
    const jobWithoutApply = {
      id: 'job-no-apply',
      title: 'Engineer',
      jobUrl: 'https://jobs.ashbyhq.com/test-co/custom-job-path',
      publishedAt: '2026-09-01T00:00:00Z',
    };
    const rawPayload2 = await adapter.fetch({
      sourceId: mockConfig.sourceId,
      externalJobId: 'job-no-apply',
      discoveryUrl: 'https://api.ashbyhq.com/posting-api/job-board/test-co',
      sourceJobUrl: 'https://jobs.ashbyhq.com/test-co/custom-job-path',
      companyIdentifier: 'test-co',
      payload: jobWithoutApply,
    });
    const rawJob2 = await adapter.parse(rawPayload2);
    // INVARIANT: Do NOT synthesize /application!
    expect(rawJob2.rawApplyUrl).toBe('https://jobs.ashbyhq.com/test-co/custom-job-path');
    expect(rawJob2.rawApplyUrl).not.toContain('/application');
  });
});
