import type { JobCandidate } from '@jobpulse/domain';
import { URLResolver } from '@jobpulse/url-resolution';
import { httpClient, logger } from '@jobpulse/shared';
import { JobrightAdapter } from './jobright.adapter.js';

const JOBRIGHT_LOGIN_URL = 'https://jobright.ai/swan/auth/login/pwd';
const JOBRIGHT_ORIGIN = 'https://jobright.ai';
const JOBRIGHT_DETAIL_PREFIX = 'https://jobright.ai/jobs/info/';
const DEFAULT_DETAIL_FETCH_CAP = 50;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

let cachedSessionId: string | null = null;
let sessionExpiresAt = 0;

function isExternalHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.hostname.toLowerCase().endsWith('jobright.ai');
  } catch {
    return false;
  }
}

function chooseDirectUrl(value: unknown): string | undefined {
  return isExternalHttpUrl(value) ? value.trim() : undefined;
}

function extractHelperPayload(html: string): Record<string, unknown> | null {
  const match = html.match(
    /<script[^>]*id=["']jobright-helper-job-detail-info["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (match?.[1]) {
    try {
      const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>;
      const jobResult = parsed['jobResult'];
      if (jobResult && typeof jobResult === 'object') return jobResult as Record<string, unknown>;
    } catch {
      // Fall through to __NEXT_DATA__
    }
  }

  const nextDataMatch = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (nextDataMatch?.[1]) {
    try {
      const parsed = JSON.parse(nextDataMatch[1].trim()) as Record<string, unknown>;
      const pageProps = (parsed['props'] as any)?.pageProps;
      const jr = pageProps?.dataSource?.jobResult || pageProps?.jobResult;
      if (jr && typeof jr === 'object') return jr as Record<string, unknown>;
    } catch {
      // Ignore
    }
  }

  return null;
}

function extractJsonLdUrl(html: string): string | undefined {
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1]?.trim() || '') as Record<string, unknown>;
      if (parsed['@type'] !== 'JobPosting') continue;
      for (const field of ['url', 'sameAs']) {
        const candidate = chooseDirectUrl(parsed[field]);
        if (candidate) return candidate;
      }
    } catch {
      // Ignore malformed JSON-LD and continue looking.
    }
  }

  return undefined;
}

function extractDirectUrl(html: string): string | undefined {
  const helper = extractHelperPayload(html);
  const preferredFields = [
    'originalUrl',
    'applyLink',
    'applyUrl',
    'jobApplyUrl',
    'externalUrl',
    'companyJobUrl',
    'sourceUrl',
    'directUrl',
    'applicationUrl',
    'externalApplyUrl',
  ];

  if (helper) {
    const candidates = preferredFields
      .map((field) => chooseDirectUrl(helper[field]))
      .filter((value): value is string => Boolean(value));

    const atsUrl = candidates.find((value) => URLResolver.isDirectAtsUrl(value));
    if (atsUrl) return atsUrl;
    if (candidates[0]) return candidates[0];
  }

  return extractJsonLdUrl(html);
}

async function ensureJobrightSession(): Promise<string | null> {
  if (cachedSessionId && Date.now() < sessionExpiresAt) return cachedSessionId;

  const email = process.env.JOBRIGHT_EMAIL?.trim();
  const password = process.env.JOBRIGHT_PASSWORD;
  if (!email || !password) {
    return null;
  }

  try {
    const response = await httpClient.post<{ [key: string]: unknown }>(
      JOBRIGHT_LOGIN_URL,
      { email, password },
      {
        timeoutMs: 15000,
        maxRetries: 1,
        headers: {
          Origin: JOBRIGHT_ORIGIN,
          Referer: `${JOBRIGHT_ORIGIN}/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        },
      }
    );

    const setCookie = response.headers.get('set-cookie') || '';
    const sessionMatch = setCookie.match(/(?:^|,\s*)SESSION_ID=([^;,\s]+)/i);
    if (!sessionMatch?.[1]) {
      logger.warn('jobright_direct_url_login_missing_session_cookie', { status: response.status });
      return null;
    }

    cachedSessionId = sessionMatch[1];
    sessionExpiresAt = Date.now() + SESSION_TTL_MS;
    return cachedSessionId;
  } catch (error) {
    logger.warn('jobright_direct_url_login_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function fetchDetailPage(jobId: string, sessionId?: string): Promise<string | undefined> {
  try {
    const response = await httpClient.get<string>(
      `${JOBRIGHT_DETAIL_PREFIX}${encodeURIComponent(jobId)}`,
      {
        timeoutMs: 15000,
        maxSizeBytes: 5 * 1024 * 1024,
        maxRetries: 1,
        headers: {
          ...(sessionId ? { Cookie: `SESSION_ID=${sessionId}` } : {}),
          Referer: `${JOBRIGHT_ORIGIN}/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        },
      }
    );

    if (response.status !== 200 || typeof response.data !== 'string') return undefined;
    return response.data;
  } catch {
    return undefined;
  }
}

export async function resolveOriginalJobUrl(jobId: string): Promise<string | undefined> {
  // First try the detail page without credentials. Some Jobright pages expose the
  // helper payload/JSON-LD publicly; this avoids making credentials mandatory.
  const publicHtml = await fetchDetailPage(jobId);
  if (publicHtml) {
    const directUrl = extractDirectUrl(publicHtml);
    if (directUrl) return directUrl;
  }

  // Fall back to the authenticated legacy path when the public page is gated.
  const sessionId = await ensureJobrightSession();
  if (!sessionId) return undefined;

  const authenticatedHtml = await fetchDetailPage(jobId, sessionId);
  return authenticatedHtml ? extractDirectUrl(authenticatedHtml) : undefined;
}

/**
 * Enrichment layer for Jobright.
 *
 * README discovery remains the source of truth for candidate identity. Direct
 * application URLs are resolved during discover(), not fetch(), so fetch(candidate)
 * remains a pure payload operation with no per-candidate network side effects.
 */
export class JobrightDetailEnrichedAdapter extends JobrightAdapter {
  public override readonly parserVersion = 'jobright_v3_direct_ats';

  private readonly detailFetchCap = Number.parseInt(
    process.env.JOBRIGHT_DETAIL_FETCH_CAP || String(DEFAULT_DETAIL_FETCH_CAP),
    10
  ) || DEFAULT_DETAIL_FETCH_CAP;

  public override async discover(companySource: Parameters<JobrightAdapter['discover']>[0]): Promise<JobCandidate[]> {
    const candidates = await super.discover(companySource);
    const limit = Math.min(candidates.length, this.detailFetchCap);

    for (let index = 0; index < limit; index += 1) {
      const candidate = candidates[index];
      if (!candidate?.payload) continue;

      const payload = { ...candidate.payload } as Record<string, unknown>;
      const existingDirectUrl =
        typeof payload['original_apply_url'] === 'string' ? payload['original_apply_url'] :
        typeof payload['ats_url'] === 'string' ? payload['ats_url'] : undefined;

      if (existingDirectUrl) continue;

      const directUrl = await resolveOriginalJobUrl(candidate.externalJobId);
      if (!directUrl) continue;

      payload['original_apply_url'] = directUrl;
      if (URLResolver.isDirectAtsUrl(directUrl)) {
        payload['ats_url'] = directUrl;
      }

      candidates[index] = { ...candidate, payload };
      logger.info('jobright_direct_application_url_resolved', {
        jobId: candidate.externalJobId,
        urlResolution: URLResolver.isDirectAtsUrl(directUrl) ? 'direct_ats' : 'external_employer',
      });
    }

    return candidates;
  }
}
