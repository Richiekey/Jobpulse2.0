import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JobrightDetailEnrichedAdapter } from '../src/adapters/jobright-detail-enriched.adapter.js';
import { httpClient } from '@jobpulse/shared';
import type { JobCandidate } from '@jobpulse/domain';

describe('Jobright direct ATS URL enrichment', () => {
  const originalEmail = process.env.JOBRIGHT_EMAIL;
  const originalPassword = process.env.JOBRIGHT_PASSWORD;
  const originalCap = process.env.JOBRIGHT_DETAIL_FETCH_CAP;

  const candidate: JobCandidate = {
    sourceId: 'source-jobright',
    externalJobId: '6a7cb1a377d5f033c4b90040',
    discoveryUrl: 'https://raw.githubusercontent.com/jobright-ai/test/master/README.md',
    sourceJobUrl: 'https://jobright.ai/jobs/info/6a7cb1a377d5f033c4b90040',
    companyIdentifier: 'test',
    payload: {
      id: '6a7cb1a377d5f033c4b90040',
      externalJobId: '6a7cb1a377d5f033c4b90040',
      title: 'DevSecOps Cloud Engineer',
      companyName: 'Guidehouse',
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.JOBRIGHT_EMAIL = 'test@example.com';
    process.env.JOBRIGHT_PASSWORD = 'test-password';
    process.env.JOBRIGHT_DETAIL_FETCH_CAP = '50';
  });

  afterEach(() => {
    if (originalEmail === undefined) delete process.env.JOBRIGHT_EMAIL;
    else process.env.JOBRIGHT_EMAIL = originalEmail;
    if (originalPassword === undefined) delete process.env.JOBRIGHT_PASSWORD;
    else process.env.JOBRIGHT_PASSWORD = originalPassword;
    if (originalCap === undefined) delete process.env.JOBRIGHT_DETAIL_FETCH_CAP;
    else process.env.JOBRIGHT_DETAIL_FETCH_CAP = originalCap;
  });

  it('resolves originalUrl from Jobright helper payload and marks it as ATS URL', async () => {
    const loginHeaders = new Headers();
    loginHeaders.set('set-cookie', 'SESSION_ID=test-session; Path=/; HttpOnly');

    vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: loginHeaders,
      data: {},
      url: 'https://jobright.ai/swan/auth/login/pwd',
    });

    const detailHtml = `
      <html>
        <script id="jobright-helper-job-detail-info">
          {"jobResult":{"originalUrl":"https://boards.greenhouse.io/guidehouse/jobs/123456"}}
        </script>
      </html>
    `;

    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/html' }),
      data: detailHtml,
      url: 'https://jobright.ai/jobs/info/6a7cb1a377d5f033c4b90040',
    });

    const adapter = new JobrightDetailEnrichedAdapter();
    const payload = await adapter.fetch(candidate);

    expect(payload.payload.original_apply_url).toBe('https://boards.greenhouse.io/guidehouse/jobs/123456');
    expect(payload.payload.ats_url).toBe('https://boards.greenhouse.io/guidehouse/jobs/123456');
    expect(payload.parserVersion).toBe('jobright_v3_direct_ats');
  });

  it('falls back to JSON-LD url when helper payload is unavailable', async () => {
    const loginHeaders = new Headers();
    loginHeaders.set('set-cookie', 'SESSION_ID=test-session; Path=/; HttpOnly');

    vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: loginHeaders,
      data: {},
      url: 'https://jobright.ai/swan/auth/login/pwd',
    });

    const detailHtml = `
      <script type="application/ld+json">
        {"@type":"JobPosting","url":"https://jobs.ashbyhq.com/guidehouse/abc123"}
      </script>
    `;

    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/html' }),
      data: detailHtml,
      url: 'https://jobright.ai/jobs/info/6a7cb1a377d5f033c4b90040',
    });

    const adapter = new JobrightDetailEnrichedAdapter();
    const payload = await adapter.fetch(candidate);

    expect(payload.payload.original_apply_url).toBe('https://jobs.ashbyhq.com/guidehouse/abc123');
    expect(payload.payload.ats_url).toBe('https://jobs.ashbyhq.com/guidehouse/abc123');
  });
});
