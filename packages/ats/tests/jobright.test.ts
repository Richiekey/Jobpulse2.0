import { describe, it, expect } from 'vitest';
import { JobrightAdapter } from '../src/adapters/jobright.adapter.js';
import type { RawJobPayload } from '@jobpulse/domain';

describe('JobrightAdapter URL Resolution & Security Matrix (Finding 7)', () => {
  const adapter = new JobrightAdapter();

  it('has valid platform slug and parser version', () => {
    expect(adapter.platformSlug).toBe('jobright');
    expect(adapter.parserVersion).toBe('jobright_v1');
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
      parserVersion: 'jobright_v1',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

    expect(normalized.urls.applyUrl).toBe('https://stripe.com/careers/apply/999');
    expect(normalized.urls.urlResolutionMethod).toBe('explicit_employer_apply');
    expect(normalized.urls.urlResolutionConfidence).toBe(0.98);
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
      parserVersion: 'jobright_v1',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

    expect(normalized.urls.applyUrl).toBe('https://jobs.lever.co/netflix/lev_123');
    expect(normalized.urls.urlResolutionMethod).toBe('explicit_ats_form');
    expect(normalized.urls.urlResolutionConfidence).toBe(0.95);
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
      parserVersion: 'jobright_v1',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

    expect(normalized.urls.applyUrl).toBe('https://jobs.ashbyhq.com/openai/ash_456');
    expect(normalized.urls.urlResolutionMethod).toBe('known_ats_url');
    expect(normalized.urls.urlResolutionConfidence).toBe(0.75);
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
      parserVersion: 'jobright_v1',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

    expect(normalized.urls.applyUrl).toBe('https://jobright.ai/jobs/jr_case_d');
    expect(normalized.urls.applyUrl).not.toContain('/apply');
    expect(normalized.urls.applyUrl).not.toContain('#app');
    expect(normalized.urls.urlResolutionMethod).toBe('fallback_source');
    expect(normalized.urls.urlResolutionConfidence).toBe(0.40);
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
      parserVersion: 'jobright_v1',
      fetchedAt: new Date().toISOString(),
    };

    const rawJob = await adapter.parse(rawPayload);
    const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

    // Malicious/invalid candidates rejected -> falls back to clean sourceJobUrl
    expect(normalized.urls.applyUrl).toBe('https://jobright.ai/jobs/jr_case_e');
    expect(normalized.urls.urlResolutionMethod).toBe('fallback_source');
  });
});
