import type { ResolvedURLs } from '@jobpulse/domain';
import { DeduplicationEngine } from '@jobpulse/domain';

export type UrlSourceType =
  | 'explicit_employer_apply'
  | 'explicit_ats_form'
  | 'structured_data'
  | 'embedded_json'
  | 'known_ats_url'
  | 'other_valid_url'
  | 'html_pattern'
  | 'fallback_source';

export interface UrlCandidate {
  url: string;
  sourceType: UrlSourceType;
  /** Optional adapter suggestion; resolver calculates authoritative confidence */
  suggestedConfidence?: number;
}

const ATS_DOMAINS = [
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'myworkdayjobs.com',
  'icims.com',
  'jobvite.com',
  'bamboohr.com',
  'recruitee.com',
  'teamtailor.com',
  'smartrecruiters.com',
  'workable.com',
  'rippling-ats.com',
  'breezy.hr',
  'pinpointhq.com',
];

/**
 * Authoritative confidence score mapping determined centrally by the resolver.
 */
const CONFIDENCE_HIERARCHY: Record<UrlSourceType, number> = {
  explicit_employer_apply: 0.98,
  explicit_ats_form: 0.95,
  structured_data: 0.85,
  embedded_json: 0.80,
  known_ats_url: 0.75,
  other_valid_url: 0.60,
  html_pattern: 0.50,
  fallback_source: 0.40,
};

/**
 * Safely checks if a hostname matches an allowed domain or its subdomains.
 * Blocks malicious lookalike domains (e.g. evilgreenhouse.io).
 */
export function isDomainMatch(hostname: string, targetDomain: string): boolean {
  const host = hostname.toLowerCase();
  const target = targetDomain.toLowerCase();
  return host === target || host.endsWith('.' + target);
}

export class URLResolver {
  /**
   * Checks if a given URL belongs to a known direct ATS provider using safe subdomain matching.
   */
  public static isDirectAtsUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      return ATS_DOMAINS.some((domain) => isDomainMatch(parsed.hostname, domain));
    } catch {
      return false;
    }
  }

  /**
   * Evaluates candidate URLs and authoritatively determines trust ranking, confidence, and target URLs.
   */
  public static resolve(params: {
    discoveryUrl: string;
    sourceJobUrl: string;
    candidates: UrlCandidate[];
    fallbackCanonicalUrl?: string;
  }): ResolvedURLs {
    const { discoveryUrl, sourceJobUrl, candidates, fallbackCanonicalUrl } = params;

    // Filter valid URLs
    const validCandidates = candidates.filter((c) => {
      try {
        const u = new URL(c.url);
        return u.protocol === 'https:' || u.protocol === 'http:';
      } catch {
        return false;
      }
    });

    // Score candidates authoritatively using resolver hierarchy
    const scoredCandidates = validCandidates.map((c) => {
      let authoritativeConfidence = CONFIDENCE_HIERARCHY[c.sourceType] || 0.40;

      // Bonus if it's a verified direct ATS domain
      if (this.isDirectAtsUrl(c.url) && c.sourceType !== 'explicit_ats_form' && c.sourceType !== 'explicit_employer_apply') {
        authoritativeConfidence = Math.max(authoritativeConfidence, CONFIDENCE_HIERARCHY['known_ats_url']);
      }

      return {
        ...c,
        calculatedConfidence: authoritativeConfidence,
      };
    });

    // Sort descending by calculated confidence
    scoredCandidates.sort((a, b) => b.calculatedConfidence - a.calculatedConfidence);

    let bestCandidate = scoredCandidates[0];

    // If no valid candidate provided, fallback to source job url
    if (!bestCandidate) {
      bestCandidate = {
        url: sourceJobUrl,
        sourceType: 'fallback_source',
        calculatedConfidence: CONFIDENCE_HIERARCHY['fallback_source'],
      };
    }

    const cleanApplyUrl = DeduplicationEngine.cleanUrl(bestCandidate.url);
    const cleanCanonicalUrl = DeduplicationEngine.cleanUrl(
      fallbackCanonicalUrl || (this.isDirectAtsUrl(bestCandidate.url) ? bestCandidate.url : sourceJobUrl)
    );

    return {
      discoveryUrl: DeduplicationEngine.cleanUrl(discoveryUrl),
      sourceJobUrl: DeduplicationEngine.cleanUrl(sourceJobUrl),
      canonicalUrl: cleanCanonicalUrl,
      applyUrl: cleanApplyUrl,
      originalApplyUrl: bestCandidate.url,
      urlResolutionMethod: bestCandidate.sourceType,
      urlResolutionConfidence: bestCandidate.calculatedConfidence,
    };
  }
}
