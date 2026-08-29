import type { ResolvedURLs } from '@jobpulse/domain';
import { DeduplicationEngine } from '@jobpulse/domain';

export interface UrlCandidate {
  url: string;
  sourceType:
    | 'explicit_employer_apply'
    | 'explicit_ats_form'
    | 'structured_data'
    | 'embedded_json'
    | 'html_pattern'
    | 'generic_apply'
    | 'fallback_source';
  confidence: number;
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
];

export class URLResolver {
  /**
   * Checks if a given URL belongs to a known direct ATS provider.
   */
  public static isDirectAtsUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      return ATS_DOMAINS.some((domain) => parsed.hostname.endsWith(domain));
    } catch {
      return false;
    }
  }

  /**
   * Evaluates and scores candidates to produce authoritative ResolvedURLs.
   */
  public static resolve(params: {
    discoveryUrl: string;
    sourceJobUrl: string;
    candidates: UrlCandidate[];
    fallbackCanonicalUrl?: string;
  }): ResolvedURLs {
    const { discoveryUrl, sourceJobUrl, candidates, fallbackCanonicalUrl } = params;

    // Filter out invalid/empty candidate URLs
    const validCandidates = candidates.filter((c) => {
      try {
        new URL(c.url);
        return true;
      } catch {
        return false;
      }
    });

    // Sort by confidence descending
    validCandidates.sort((a, b) => b.confidence - a.confidence);

    let bestCandidate = validCandidates[0];

    // If no candidate provided, fallback to source job url
    if (!bestCandidate) {
      bestCandidate = {
        url: sourceJobUrl,
        sourceType: 'fallback_source',
        confidence: 0.4,
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
      urlResolutionConfidence: bestCandidate.confidence,
    };
  }
}
