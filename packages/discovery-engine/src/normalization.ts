import { CompanyNormalizer, CompanySourceNormalizer, DeduplicationEngine } from '@jobpulse/domain';
import { DiscoveryCandidate } from './types.js';

/**
 * Normalizes a domain or URL into a canonical registrable domain (e.g. acme.com or acme.co.uk).
 */
export function normalizeDomain(rawDomainOrUrl?: string | null): string | null {
  if (!rawDomainOrUrl || typeof rawDomainOrUrl !== 'string') return null;
  const trimmed = rawDomainOrUrl.trim().toLowerCase();
  if (!trimmed) return null;

  // Use CompanyNormalizer to extract the true registrable domain
  const domain = CompanyNormalizer.extractRegistrableDomain(trimmed);
  if (!domain) return null;

  return domain.toLowerCase().trim();
}

/**
 * Normalizes and strips tracking parameters from a careers or source URL.
 */
export function normalizeUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const normalized = CompanySourceNormalizer.normalizeSourceUrl(trimmed);
  if (!normalized) return null;

  return DeduplicationEngine.cleanUrl(normalized);
}

/**
 * Normalizes all domain and URL fields on a DiscoveryCandidate.
 * Returns null if the domain is invalid.
 */
export function normalizeCandidate(candidate: DiscoveryCandidate): DiscoveryCandidate | null {
  const normalizedDomain = normalizeDomain(candidate.company_domain);
  if (!normalizedDomain) return null;

  return {
    ...candidate,
    company_name: candidate.company_name.trim(),
    company_domain: normalizedDomain,
    careers_url: candidate.careers_url ? normalizeUrl(candidate.careers_url) : null,
    source_url: candidate.source_url ? normalizeUrl(candidate.source_url) : null,
    ats_url: candidate.ats_url ? normalizeUrl(candidate.ats_url) : null,
    detected_ats: candidate.detected_ats ? candidate.detected_ats.trim().toLowerCase() : null,
    job_evidence: candidate.job_evidence.map((je) => ({
      ...je,
      job_url: normalizeUrl(je.job_url) ?? je.job_url,
      job_title: je.job_title.trim(),
    })),
  };
}

/**
 * Checks if a domain is a known generic hosting, social, or job board platform.
 */
export function isGenericDomain(domain: string): boolean {
  const generic = [
    'ycombinator.com', 'github.com', 'google.com', 'twitter.com', 'x.com',
    'linkedin.com', 'youtube.com', 'medium.com', 'substack.com', 'bit.ly',
    't.co', 'wikipedia.org', 'indeed.com', 'wellfound.com', 'greenhouse.io',
    'lever.co', 'ashbyhq.com', 'workable.com', 'facebook.com', 'reddit.com',
    'hn.algolia.com', 'docs.google.com', 'forms.gle', 'apple.com', 'instagram.com'
  ];
  const lower = domain.toLowerCase().trim();
  return generic.some((g) => lower === g || lower.endsWith(`.${g}`));
}

/**
 * Extracts the most likely corporate domain from a block of HTML (like an ATS board).
 * Evidence-based: finds all hrefs, filters out generic platforms, and picks the most frequent.
 */
export function extractCorporateDomainFromHtml(html: string): string | null {
  if (!html) return null;
  const hrefRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
  const domains = new Map<string, number>();
  
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    if (match[1]) {
      const d = normalizeDomain(match[1]);
      if (d && !isGenericDomain(d)) {
        domains.set(d, (domains.get(d) || 0) + 1);
      }
    }
  }

  let bestDomain = null;
  let maxCount = 0;
  for (const [domain, count] of domains.entries()) {
    if (count > maxCount) {
      maxCount = count;
      bestDomain = domain;
    }
  }

  return bestDomain;
}
