import type {
  JobCandidate,
  RawJobPayload,
  RawJob,
  NormalizedJob,
  CompanySourceConfig,
  SourceValidationResult,
  ATSDetectionResult,
} from '@jobpulse/domain';
import { Normalizer, DeduplicationEngine } from '@jobpulse/domain';
import { URLResolver, type UrlCandidate } from '@jobpulse/url-resolution';
import { JobValidator, type JobValidationResult } from '@jobpulse/validation';
import { httpClient, logger } from '@jobpulse/shared';
import type { ATSAdapter } from '../adapter.interface.js';

export interface JobrightListing {
  id: string | number;
  title: string;
  company_name?: string;
  description?: string;
  location?: string;
  locations?: string[];
  workplace_type?: string;
  employment_type?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_interval?: string;
  posted_at?: string;
  source_job_url?: string;
  original_apply_url?: string;
  ats_url?: string;
  embedded_urls?: string[];
  [key: string]: unknown;
}

export class JobrightAdapter implements ATSAdapter {
  public readonly platformSlug = 'jobright';
  public readonly parserVersion = 'jobright_v2';

  // Server-side session token cache (never exposed to client)
  private static cachedSessionToken: string | null = null;
  private static sessionExpiresAt: number = 0;

  /**
   * Clears the in-memory cached session (useful for test isolation and re-authentication).
   */
  public static clearSessionCache(): void {
    JobrightAdapter.cachedSessionToken = null;
    JobrightAdapter.sessionExpiresAt = 0;
  }

  /**
   * Secure server-side session acquisition using configured credentials.
   * Credentials precedence: adapterConfig -> process.env (JOBRIGHT_EMAIL, JOBRIGHT_PASSWORD).
   * Credentials and tokens are NEVER leaked into error messages, responses, or client bundles.
   */
  public async acquireSession(credentials?: { email?: string; password?: string }): Promise<string | null> {
    // Return cached session if still valid
    if (JobrightAdapter.cachedSessionToken && Date.now() < JobrightAdapter.sessionExpiresAt) {
      return JobrightAdapter.cachedSessionToken;
    }

    const email = credentials?.email || (typeof process !== 'undefined' ? process.env['JOBRIGHT_EMAIL'] : undefined);
    const password = credentials?.password || (typeof process !== 'undefined' ? process.env['JOBRIGHT_PASSWORD'] : undefined);

    if (!email || !password) {
      return null;
    }

    try {
      const response = await httpClient.post<{
        token?: string;
        access_token?: string;
        sessionId?: string;
        data?: { token?: string };
      }>(
        'https://jobright.ai/api/auth/login',
        { email, password },
        {
          timeoutMs: 10000,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (response.status === 200 && response.data) {
        const token =
          response.data.token ||
          response.data.access_token ||
          response.data.sessionId ||
          response.data.data?.token;

        if (token) {
          JobrightAdapter.cachedSessionToken = token;
          JobrightAdapter.sessionExpiresAt = Date.now() + 3600 * 1000; // 1 hour TTL
          return token;
        }
      }

      logger.warn(`[Jobright] Authentication endpoint returned HTTP ${response.status} without a valid session token`);
      return null;
    } catch (err: any) {
      // Safe sanitized log: NEVER include password or email in error messages
      logger.warn(`[Jobright] Session acquisition failed: ${err?.message || 'Network error'}`);
      return null;
    }
  }

  public detect(url: string): ATSDetectionResult {
    const urlPattern = /jobright\.ai\/jobs\/([a-zA-Z0-9_-]+)/i;
    const match = url.match(urlPattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'jobright',
        boardIdentifier: match[1],
        confidence: 0.95,
        sourceUrl: url,
      };
    }

    return {
      detected: false,
      atsType: null,
      boardIdentifier: null,
      confidence: 0,
      sourceUrl: url,
    };
  }

  public async validateSource(config: CompanySourceConfig): Promise<SourceValidationResult> {
    const start = Date.now();
    const url = config.sourceUrl || `https://jobright.ai/api/jobs/company/${config.sourceIdentifier}`;

    try {
      const creds = {
        email: (config.adapterConfig?.['email'] as string) || undefined,
        password: (config.adapterConfig?.['password'] as string) || undefined,
      };
      const sessionToken = await this.acquireSession(creds);

      const headers: Record<string, string> = { Accept: 'application/json' };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const response = await httpClient.get<{ jobs?: JobrightListing[] }>(url, {
        timeoutMs: 10000,
        headers,
      });
      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data?.jobs && Array.isArray(response.data.jobs)) {
        return {
          isValid: true,
          atsType: 'jobright',
          boardIdentifier: config.sourceIdentifier,
          jobsDiscoveredCount: response.data.jobs.length,
          sampleJobTitles: response.data.jobs.slice(0, 3).map((j) => j.title),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'jobright',
        boardIdentifier: config.sourceIdentifier,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `Jobright returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: any) {
      return {
        isValid: false,
        atsType: 'jobright',
        boardIdentifier: config.sourceIdentifier,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err.message || 'Validation request failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const url = companySource.sourceUrl || `https://jobright.ai/api/jobs/company/${companySource.sourceIdentifier}`;
    const creds = {
      email: (companySource.adapterConfig?.['email'] as string) || undefined,
      password: (companySource.adapterConfig?.['password'] as string) || undefined,
    };
    const sessionToken = await this.acquireSession(creds);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    const response = await httpClient.get<{ jobs?: JobrightListing[] }>(url, { headers });

    if (!response.data?.jobs || !Array.isArray(response.data.jobs)) {
      return [];
    }

    return response.data.jobs.map((job) => ({
      sourceId: companySource.sourceId,
      externalJobId: String(job.id),
      discoveryUrl: url,
      sourceJobUrl: job.source_job_url || `https://jobright.ai/jobs/${job.id}`,
      companyIdentifier: companySource.sourceIdentifier,
    }));
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const detailUrl = candidate.sourceJobUrl.startsWith('http')
      ? candidate.sourceJobUrl
      : `https://jobright.ai/api/jobs/${candidate.externalJobId}`;

    const sessionToken = await this.acquireSession();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    const response = await httpClient.get<Record<string, unknown>>(detailUrl, {
      timeoutMs: 12000,
      headers,
    });

    if (response.status !== 200 || !response.data) {
      throw new Error(`Jobright job detail fetch failed for candidate ${candidate.externalJobId} at ${detailUrl} with HTTP ${response.status}`);
    }

    // Attach original candidate URLs into raw payload
    const payload = {
      ...response.data,
      sourceJobUrl: candidate.sourceJobUrl,
      discoveryUrl: candidate.discoveryUrl,
    };
    const payloadHash = DeduplicationEngine.hashPayload(payload);

    return {
      sourceId: candidate.sourceId,
      externalId: candidate.externalJobId,
      payload,
      payloadHash,
      parserVersion: this.parserVersion,
      fetchedAt: new Date().toISOString(),
    };
  }

  public async parse(rawPayload: RawJobPayload): Promise<RawJob> {
    const p = rawPayload.payload as unknown as Partial<JobrightListing>;

    const locations: string[] = [];
    if (Array.isArray(p.locations)) {
      for (const loc of p.locations) {
        if (typeof loc === 'string' && loc.trim()) locations.push(loc.trim());
      }
    } else if (typeof p.location === 'string' && p.location.trim()) {
      locations.push(p.location.trim());
    }

    const sourceJobUrl = (p.source_job_url as string) || (rawPayload.payload['sourceJobUrl'] as string) || `https://jobright.ai/jobs/${rawPayload.externalId}`;
    const originalApplyUrl = (p.original_apply_url as string) || null;
    const atsUrl = (p.ats_url as string) || null;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId: rawPayload.externalId,
      rawTitle: p.title || 'Untitled Role',
      rawDescription: p.description || '',
      rawDescriptionHtml: null,
      rawEmploymentType: p.employment_type || null,
      rawWorkplaceType: p.workplace_type || null,
      rawLocations: locations.length > 0 ? locations : ['Unspecified'],
      rawSalary: p.salary_min && p.salary_max ? `$${p.salary_min} - $${p.salary_max}` : null,
      rawPostedAt: p.posted_at || new Date().toISOString(),
      rawApplyUrl: originalApplyUrl || atsUrl || sourceJobUrl,
      discoveryUrl: (rawPayload.payload['discoveryUrl'] as string) || sourceJobUrl,
      sourceJobUrl,
      sourceMetadata: {
        company_name: p.company_name,
        ats_url: atsUrl,
        original_apply_url: originalApplyUrl,
        embedded_urls: p.embedded_urls || [],
        isAuthenticated: Boolean(JobrightAdapter.cachedSessionToken),
      },
    };
  }

  public async normalize(raw: RawJob, payloadHash: string): Promise<NormalizedJob> {
    const urlCandidates: UrlCandidate[] = [];
    const meta = raw.sourceMetadata || {};

    // 1. Direct employer application URL (highest priority)
    if (typeof meta['original_apply_url'] === 'string' && meta['original_apply_url'].trim()) {
      urlCandidates.push({
        url: meta['original_apply_url'].trim(),
        sourceType: 'explicit_employer_apply',
      });
    }

    // 2. Direct ATS form URL
    if (typeof meta['ats_url'] === 'string' && meta['ats_url'].trim()) {
      urlCandidates.push({
        url: meta['ats_url'].trim(),
        sourceType: 'explicit_ats_form',
      });
    }

    // 3. Check embedded URLs for direct ATS patterns
    if (Array.isArray(meta['embedded_urls'])) {
      for (const embeddedUrl of meta['embedded_urls']) {
        if (typeof embeddedUrl === 'string' && URLResolver.isDirectAtsUrl(embeddedUrl)) {
          urlCandidates.push({
            url: embeddedUrl,
            sourceType: 'known_ats_url',
          });
        }
      }
    }

    // 4. Fallback source job URL
    urlCandidates.push({
      url: raw.sourceJobUrl,
      sourceType: 'fallback_source',
    });

    const resolvedUrls = URLResolver.resolve({
      discoveryUrl: raw.discoveryUrl || `https://jobright.ai/jobs/${raw.externalJobId}`,
      sourceJobUrl: raw.sourceJobUrl,
      candidates: urlCandidates,
      fallbackCanonicalUrl: urlCandidates[0]?.url || raw.sourceJobUrl,
    });

    return Normalizer.normalize(raw, resolvedUrls, payloadHash);
  }

  public validate(job: NormalizedJob): JobValidationResult {
    return JobValidator.validate(job);
  }

  public async resolveApplicationUrl(candidate: JobCandidate, raw: RawJob): Promise<string> {
    const meta = raw.sourceMetadata || {};
    if (typeof meta['original_apply_url'] === 'string' && meta['original_apply_url'].trim()) {
      return meta['original_apply_url'].trim();
    }
    if (typeof meta['ats_url'] === 'string' && meta['ats_url'].trim()) {
      return meta['ats_url'].trim();
    }
    return raw.sourceJobUrl || candidate.sourceJobUrl || '';
  }
}
