import { HttpClient } from '@jobpulse/shared';
import { logger } from '@jobpulse/shared';
import { ATSDetector } from '@jobpulse/ats';
import { DiscoveryCandidate, DiscoveryEvidence } from './types.js';
import { normalizeUrl } from './normalization.js';
import { DiscoveryRateLimiter, DomainCircuitBreaker } from './safety.js';

function isLikelyCareersPage(html: string): boolean {
  if (!html) return false;
  const lowerHtml = html.toLowerCase();
  return /(careers|jobs|open positions|openings|join us|work with us|ats|boards\.)/i.test(lowerHtml);
}

const CANDIDATE_PATHS = [
  '/careers',
  '/jobs',
  '/careers/jobs',
  '/work-with-us',
  '/join-us',
  '/career',
  '/open-positions',
];

/**
 * Probes common careers page paths and subdomains for a domain.
 */
export async function discoverCareersUrl(
  domain: string,
  httpClient?: HttpClient,
  rateLimiter?: DiscoveryRateLimiter,
  circuitBreaker?: DomainCircuitBreaker
): Promise<string | null> {
  const client = httpClient || new HttpClient({ timeoutMs: 6000 });
  const cleanDomain = domain.toLowerCase().trim();

  if (circuitBreaker?.isOpen(cleanDomain)) {
    logger.warn(`Circuit breaker open for ${cleanDomain}, skipping careers discovery.`);
    return null;
  }

  // 1. Try known paths on the primary domain
  for (const path of CANDIDATE_PATHS) {
    const candidateUrl = `https://${cleanDomain}${path}`;
      if (rateLimiter) await rateLimiter.acquire(cleanDomain);
      try {
        const res = await client.get<string>(candidateUrl, {
          maxSizeBytes: 64 * 1024,
          maxRetries: 0,
          timeoutMs: 3500,
        });

        if (res.status >= 200 && res.status < 400 && typeof res.data === 'string') {
          if (isLikelyCareersPage(res.data)) {
            circuitBreaker?.recordSuccess(cleanDomain);
            return normalizeUrl(res.url) || candidateUrl;
          }
        }
      } catch {
        circuitBreaker?.recordFailure(cleanDomain);
        if (circuitBreaker?.isOpen(cleanDomain)) return null;
      } finally {
        if (rateLimiter) rateLimiter.release(cleanDomain);
      }
  }

  // 2. Try common subdomains
  const subdomains = [`careers.${cleanDomain}`, `jobs.${cleanDomain}`];
  for (const sub of subdomains) {
    const candidateUrl = `https://${sub}`;
      if (rateLimiter) await rateLimiter.acquire(cleanDomain);
      try {
        const res = await client.get<string>(candidateUrl, {
          maxSizeBytes: 64 * 1024,
          maxRetries: 0,
          timeoutMs: 3500,
        });

        if (res.status >= 200 && res.status < 400 && typeof res.data === 'string') {
          if (isLikelyCareersPage(res.data)) {
            circuitBreaker?.recordSuccess(cleanDomain);
            return normalizeUrl(res.url) || candidateUrl;
          }
        }
      } catch {
        circuitBreaker?.recordFailure(cleanDomain);
        if (circuitBreaker?.isOpen(cleanDomain)) return null;
      } finally {
        if (rateLimiter) rateLimiter.release(cleanDomain);
      }
  }

  // 3. Homepage link scan fallback
  try {
    if (rateLimiter) await rateLimiter.acquire(cleanDomain);
    const homeUrl = `https://${cleanDomain}`;
    const res = await client.get<string>(homeUrl, {
      maxSizeBytes: 128 * 1024,
      maxRetries: 1,
    });

    if (res.status >= 200 && res.status < 400 && typeof res.data === 'string') {
      const linkMatch = res.data.match(/href=["']([^"']*(?:careers|jobs|positions)[^"']*)["']/i);
      if (linkMatch && linkMatch[1]) {
        let matched = linkMatch[1];
        if (matched.startsWith('/')) {
          matched = `https://${cleanDomain}${matched}`;
        }
        if (matched.startsWith('http://') || matched.startsWith('https://')) {
          circuitBreaker?.recordSuccess(cleanDomain);
          return normalizeUrl(matched);
        }
      }
    }
  } catch {
    circuitBreaker?.recordFailure(cleanDomain);
  } finally {
    if (rateLimiter) rateLimiter.release(cleanDomain);
  }

  return null;
}

/**
 * Enriches a candidate with careers URL discovery and ATS detection if missing.
 */
export async function enrichCandidate(
  candidate: DiscoveryCandidate,
  options: {
    httpClient?: HttpClient;
    discoverCareers?: boolean;
    rateLimiter?: DiscoveryRateLimiter;
    circuitBreaker?: DomainCircuitBreaker;
  } = {}
): Promise<DiscoveryCandidate> {
  const client = options.httpClient || new HttpClient({ timeoutMs: 8000 });
  let careersUrl = candidate.careers_url;
  let detectedAts = candidate.detected_ats;
  let atsUrl = candidate.ats_url;
  let boardIdentifier = candidate.board_identifier;
  let confidence = candidate.confidence;
  const evidence: DiscoveryEvidence[] = [...candidate.evidence];

  // 1. Discover careers page if absent and requested
  if (!careersUrl && options.discoverCareers !== false) {
    try {
      const found = await discoverCareersUrl(candidate.company_domain, client, options.rateLimiter, options.circuitBreaker);
      if (found) {
        careersUrl = found;
        evidence.push({
          provider: 'careers-discovery',
          timestamp: new Date().toISOString(),
          evidence_type: 'careers_url_discovered',
          url: found,
        });
      }
    } catch (err) {
      logger.debug(`Failed careers discovery for ${candidate.company_domain}`, {
        error: String(err),
      });
    }
  }

  // 2. ATS Detection if ATS not yet identified
  if ((!detectedAts || detectedAts === 'UNKNOWN') && careersUrl) {
    try {
      if (options.rateLimiter) await options.rateLimiter.acquire(candidate.company_domain);
      const res = await client.get<string>(careersUrl, {
        maxSizeBytes: 128 * 1024,
        maxRetries: 1,
      });

      const html = typeof res.data === 'string' ? res.data : '';
      const atsResult = ATSDetector.detect(res.url || careersUrl, html);

      if (atsResult.detected && atsResult.atsType) {
        detectedAts = atsResult.atsType;
        atsUrl = atsResult.sourceUrl || careersUrl;
        boardIdentifier = atsResult.boardIdentifier;
        confidence = Math.max(confidence, atsResult.confidence);
        evidence.push({
          provider: 'ats-detector',
          timestamp: new Date().toISOString(),
          evidence_type: 'html_detection',
          url: careersUrl,
          metadata: {
            ats: atsResult.atsType,
            board_identifier: atsResult.boardIdentifier,
          },
        });
      }
      options.circuitBreaker?.recordSuccess(candidate.company_domain);
    } catch (err) {
      options.circuitBreaker?.recordFailure(candidate.company_domain);
      logger.debug(`Failed ATS detection for ${candidate.company_domain}`, {
        error: String(err),
      });
    } finally {
      if (options.rateLimiter) options.rateLimiter.release(candidate.company_domain);
    }
  }

  return {
    ...candidate,
    careers_url: careersUrl ? normalizeUrl(careersUrl) : null,
    detected_ats: detectedAts ?? null,
    ats_url: atsUrl ? normalizeUrl(atsUrl) : null,
    board_identifier: boardIdentifier ?? null,
    confidence,
    evidence,
  };
}

export class DefaultDiscoveryEnricher {
  private rateLimiter = new DiscoveryRateLimiter();
  private circuitBreaker = new DomainCircuitBreaker();

  constructor(private readonly httpClient?: HttpClient) {}

  async enrich(candidate: DiscoveryCandidate): Promise<DiscoveryCandidate> {
    return enrichCandidate(candidate, {
      httpClient: this.httpClient,
      discoverCareers: true,
      rateLimiter: this.rateLimiter,
      circuitBreaker: this.circuitBreaker,
    });
  }
}
