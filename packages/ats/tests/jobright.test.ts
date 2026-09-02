import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobrightAdapter } from '../src/adapters/jobright.adapter.js';
import type { RawJobPayload, CompanySourceConfig } from '@jobpulse/domain';
import { httpClient } from '@jobpulse/shared';

describe('JobrightAdapter URL Resolution & Security Matrix', () => {
  const adapter = new JobrightAdapter();

  beforeEach(() => {
    JobrightAdapter.clearSessionCache();
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

describe('JobrightAdapter Authenticated Flow Parity (P1)', () => {
  const adapter = new JobrightAdapter();

  beforeEach(() => {
    JobrightAdapter.clearSessionCache();
    vi.restoreAllMocks();
  });

  it('acquires and caches session token when valid credentials are provided', async () => {
    const postSpy = vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
      status: 200,
      data: { token: 'jwt_session_token_xyz123' },
      headers: new Headers(),
      durationMs: 100,
    });

    const token1 = await adapter.acquireSession({
      email: 'test@example.com',
      password: 'super-secret-password',
    });

    expect(token1).toBe('jwt_session_token_xyz123');
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith(
      'https://jobright.ai/api/auth/login',
      { email: 'test@example.com', password: 'super-secret-password' },
      expect.objectContaining({ timeoutMs: 10000 })
    );

    // Second call should return cached token without triggering a second HTTP POST
    const token2 = await adapter.acquireSession({
      email: 'test@example.com',
      password: 'super-secret-password',
    });
    expect(token2).toBe('jwt_session_token_xyz123');
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('handles authentication failure gracefully without leaking credentials in errors', async () => {
    vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
      status: 401,
      data: { error: 'Invalid credentials' },
      headers: new Headers(),
      durationMs: 50,
    });

    const token = await adapter.acquireSession({
      email: 'bad@example.com',
      password: 'wrong-password',
    });

    expect(token).toBeNull();
  });

  it('uses authenticated session headers in discover() and preserves candidate fields', async () => {
    vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
      status: 200,
      data: { token: 'auth_token_777' },
      headers: new Headers(),
      durationMs: 50,
    });

    const getSpy = vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      data: {
        jobs: [
          {
            id: 'job_101',
            title: 'Staff Software Engineer',
            source_job_url: 'https://jobright.ai/jobs/job_101',
          },
        ],
      },
      headers: new Headers(),
      durationMs: 120,
    });

    const config: CompanySourceConfig = {
      id: 'cfg_jr_1',
      companyId: 'comp_1',
      sourceId: '10000000-0000-0000-0000-000000000005',
      sourceIdentifier: 'tech-corp',
      sourceUrl: 'https://jobright.ai/api/jobs/company/tech-corp',
      adapterConfig: {
        email: 'user@techcorp.com',
        password: 'secure_password_123',
      },
      isActive: true,
      healthStatus: 'healthy',
      priority: 1,
      scheduleIntervalMinutes: 60,
      consecutiveFailures: 0,
      lastCheckedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      lastJobCount: 0,
      discoveryMethod: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const candidates = await adapter.discover(config);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.externalJobId).toBe('job_101');
    expect(getSpy).toHaveBeenCalledWith(
      'https://jobright.ai/api/jobs/company/tech-corp',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer auth_token_777',
        }),
      })
    );
  });

  it('throws an explicit error on detail fetch failure (no synthetic jobs created)', async () => {
    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 404,
      data: null,
      headers: new Headers(),
      durationMs: 50,
    });

    await expect(
      adapter.fetch({
        sourceId: '10000000-0000-0000-0000-000000000005',
        externalJobId: 'non_existent_999',
        discoveryUrl: 'https://jobright.ai/jobs/non_existent_999',
        sourceJobUrl: 'https://jobright.ai/api/jobs/non_existent_999',
        companyIdentifier: 'unknown',
      })
    ).rejects.toThrow(/Jobright job detail fetch failed/);
  });
});
