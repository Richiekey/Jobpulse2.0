import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobrightAdapter } from '../src/adapters/jobright.adapter.js';
import type { RawJobPayload, CompanySourceConfig } from '@jobpulse/domain';
import { httpClient } from '@jobpulse/shared';

describe('JobrightAdapter URL Resolution & Security Matrix', () => {
  const adapter = new JobrightAdapter();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('has valid platform slug and parser version', () => {
    expect(adapter.platformSlug).toBe('jobright');
    expect(adapter.parserVersion).toBe('jobright_v2');
  });

  it('Case A: original_apply_url wins when present', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-4000-8000-000000000005',
      externalId: 'jr_case_a',
      payload: {
        id: 'jr_case_a',
        title: 'Principal Engineer',
        company_name: 'Stripe',
        description: 'Build core payments.',
        source_job_url: 'https://jobright.ai/jobs/jr_case_a',
        original_apply_url: 'https://stripe.com/careers/apply/999',
        ats_url: 'https://boards.greenhouse.io/stripe/jobs/999',
      },
      payloadHash: 'a'.repeat(64),
      parserVersion: 'jobright_v2',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

    expect(normalized.urls.applyUrl).toBe('https://stripe.com/careers/apply/999');
    expect(normalized.urls.urlResolutionMethod).toBe('explicit_employer_apply');
  });

  it('Case B: ats_url wins when original_apply_url is absent', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-4000-8000-000000000005',
      externalId: 'jr_case_b',
      payload: {
        id: 'jr_case_b',
        title: 'Backend Engineer',
        company_name: 'Netflix',
        description: 'Build streaming video delivery.',
        source_job_url: 'https://jobright.ai/jobs/jr_case_b',
        ats_url: 'https://jobs.lever.co/netflix/lev_123',
      },
      payloadHash: 'b'.repeat(64),
      parserVersion: 'jobright_v2',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

    expect(normalized.urls.applyUrl).toBe('https://jobs.lever.co/netflix/lev_123');
    expect(normalized.urls.urlResolutionMethod).toBe('explicit_ats_form');
  });

  it('Case C: embedded direct ATS URL wins when no explicit apply URLs exist', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-4000-8000-000000000005',
      externalId: 'jr_case_c',
      payload: {
        id: 'jr_case_c',
        title: 'AI Research Scientist',
        company_name: 'OpenAI',
        description: 'Advance foundational intelligence models.',
        source_job_url: 'https://jobright.ai/jobs/jr_case_c',
        embedded_urls: ['https://jobs.ashbyhq.com/openai/ash_456', 'https://openai.com/about'],
      },
      payloadHash: 'c'.repeat(64),
      parserVersion: 'jobright_v2',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

    expect(normalized.urls.applyUrl).toBe('https://jobs.ashbyhq.com/openai/ash_456');
    expect(normalized.urls.urlResolutionMethod).toBe('known_ats_url');
  });

  it('Case D: retains Jobright source URL when no direct ATS URLs exist (no synthesis)', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-4000-8000-000000000005',
      externalId: 'jr_case_d',
      payload: {
        id: 'jr_case_d',
        title: 'Operations Specialist',
        company_name: 'Local Startup',
        description: 'Lead local market operations.',
        source_job_url: 'https://jobright.ai/jobs/jr_case_d',
      },
      payloadHash: 'd'.repeat(64),
      parserVersion: 'jobright_v2',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

    expect(normalized.urls.applyUrl).toBe('https://jobright.ai/jobs/jr_case_d');
    expect(normalized.urls.applyUrl).not.toContain('/apply');
    expect(normalized.urls.applyUrl).not.toContain('#app');
    expect(normalized.urls.urlResolutionMethod).toBe('fallback_source');
  });

  it('Case E: invalid or malicious candidate URLs are safely ignored without SSRF bypass', async () => {
    const rawPayload: RawJobPayload = {
      sourceId: '10000000-0000-4000-8000-000000000005',
      externalId: 'jr_case_e',
      payload: {
        id: 'jr_case_e',
        title: 'Security Analyst',
        company_name: 'Defense Tech',
        description: 'Audit network boundaries.',
        source_job_url: 'https://jobright.ai/jobs/jr_case_e',
        original_apply_url: 'not-a-valid-url',
        embedded_urls: ['javascript:alert(1)', 'ftp://internal.server/apply'],
      },
      payloadHash: 'e'.repeat(64),
      parserVersion: 'jobright_v2',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

    expect(normalized.urls.applyUrl).toBe('https://jobright.ai/jobs/jr_case_e');
    expect(normalized.urls.urlResolutionMethod).toBe('fallback_source');
  });
});

describe('JobrightAdapter Strict Zero-Network Payload Fetch Architecture', () => {
  const adapter = new JobrightAdapter();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetch() consumes candidate.payload directly with zero network requests', async () => {
    const getSpy = vi.spyOn(httpClient, 'get');
    const postSpy = vi.spyOn(httpClient, 'post');

    const candidate = {
      sourceId: '10000000-0000-0000-0000-000000000005',
      externalJobId: 'jr_valid_123',
      discoveryUrl: 'https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md',
      sourceJobUrl: 'https://jobright.ai/jobs/info/jr_valid_123',
      companyIdentifier: '2026-Software-Engineer-New-Grad',
      payload: {
        id: 'jr_valid_123',
        externalJobId: 'jr_valid_123',
        title: 'Cloud Security Architect',
        companyName: 'Guidehouse',
        companyWebsite: 'https://guidehouse.com',
        location: 'Reston, VA',
        workplaceType: 'remote' as const,
        postedAt: '2026-09-03T12:00:00.000Z',
      },
    };

    const rawPayload = await adapter.fetch(candidate);

    expect(rawPayload.sourceId).toBe('10000000-0000-0000-0000-000000000005');
    expect(rawPayload.externalId).toBe('jr_valid_123');
    expect(rawPayload.payload['title']).toBe('Cloud Security Architect');
    expect(rawPayload.payloadHash).toHaveLength(64);

    // Verify ZERO network requests were executed
    expect(getSpy).not.toHaveBeenCalled();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('fetch() throws an explicit error when candidate.payload is missing without network fallback', async () => {
    const getSpy = vi.spyOn(httpClient, 'get');
    const postSpy = vi.spyOn(httpClient, 'post');

    const candidateWithoutPayload = {
      sourceId: '10000000-0000-0000-0000-000000000005',
      externalJobId: 'jr_missing_payload',
      discoveryUrl: 'https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md',
      sourceJobUrl: 'https://jobright.ai/jobs/info/jr_missing_payload',
      companyIdentifier: '2026-Software-Engineer-New-Grad',
    };

    await expect(adapter.fetch(candidateWithoutPayload)).rejects.toThrow(
      /is missing candidate\.payload/
    );

    // Verify ZERO fallback HTTP requests were attempted
    expect(getSpy).not.toHaveBeenCalled();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('fetch() throws an explicit error when candidate.payload is empty without network fallback', async () => {
    const getSpy = vi.spyOn(httpClient, 'get');
    const postSpy = vi.spyOn(httpClient, 'post');

    const candidateWithEmptyPayload = {
      sourceId: '10000000-0000-0000-0000-000000000005',
      externalJobId: 'jr_empty_payload',
      discoveryUrl: 'https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md',
      sourceJobUrl: 'https://jobright.ai/jobs/info/jr_empty_payload',
      companyIdentifier: '2026-Software-Engineer-New-Grad',
      payload: {},
    };

    await expect(adapter.fetch(candidateWithEmptyPayload)).rejects.toThrow(
      /is missing candidate\.payload/
    );

    // Verify ZERO fallback HTTP requests were attempted
    expect(getSpy).not.toHaveBeenCalled();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('proves Jobright adapter contains no session or private login methods', () => {
    expect((adapter as any).acquireSession).toBeUndefined();
    expect((JobrightAdapter as any).clearSessionCache).toBeUndefined();
    expect((JobrightAdapter as any).cachedSessionToken).toBeUndefined();
  });
});
