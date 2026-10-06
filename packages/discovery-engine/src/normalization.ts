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
