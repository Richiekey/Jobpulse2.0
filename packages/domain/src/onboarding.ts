import type { Company } from './entities/company.js';
import { CompanyNormalizer } from './entities/company.js';
import { CompanySourceNormalizer } from './entities/source.js';

export interface OnboardSourceInput {
  companyName: string;
  companyDomain?: string | null;
  careersUrl?: string | null;
  atsType: string;
  boardIdentifier: string;
  sourceUrl?: string | null;
  priority?: number;
  scheduleIntervalMinutes?: number;
  isActive?: boolean;
}

export interface CandidateLookupFilter {
  domain: string | null;
  normalizedName: string;
}

export class CompanySourceOnboardingService {
  /**
   * Generates targeted database lookup criteria from onboarding input.
   * This prevents unbounded `SELECT * FROM companies` in production.
   */
  public static getCandidateLookupFilter(input: OnboardSourceInput): CandidateLookupFilter {
    const rawName = input.companyName.trim();
    const normalizedName = CompanyNormalizer.normalizeName(rawName);
    const domain = input.companyDomain
      ? CompanyNormalizer.extractRegistrableDomain(input.companyDomain)
      : input.careersUrl
      ? CompanyNormalizer.extractRegistrableDomain(input.careersUrl)
      : null;

    return { domain, normalizedName };
  }

  /**
   * Evaluates candidate companies against authoritative identity rules:
   * 1. Verified Domain: If a candidate has a verified domain matching the input, it is an authoritative match.
   * 2. Unverified Domain: If an unverified domain matches, it only matches if normalizedName also matches.
   * 3. Normalized Name: If domain is omitted (or candidate domain is null), matches on exact normalizedName.
   * 4. Multi-candidate preference: Prefers verified domain candidates over unverified ones.
   */
  public static matchCompanyCandidate(
    candidates: Company[],
    input: { normalizedName: string; domain: string | null }
  ): Company | null {
    if (candidates.length === 0) return null;

    const { domain, normalizedName } = input;

    if (domain) {
      // 1. Check for verified matching domain (authoritative match)
      const verifiedMatch = candidates.find(
        (c) =>
          c.domain &&
          CompanyNormalizer.extractRegistrableDomain(c.domain) === domain &&
          c.verified === true
      );
      if (verifiedMatch) return verifiedMatch;

      // 2. Check for unverified matching domain where normalized name also matches
      const unverifiedNameMatch = candidates.find(
        (c) =>
          c.domain &&
          CompanyNormalizer.extractRegistrableDomain(c.domain) === domain &&
          c.normalizedName === normalizedName
      );
      if (unverifiedNameMatch) return unverifiedNameMatch;

      // If domain was provided but does not match any candidate with verified domain or matching name,
      // an unverified domain alone must NOT subsume a differently named company entity.
      return null;
    }

    // 3. If domain was omitted from input, match by normalized name if candidate has no domain or matching context
    const nameMatch = candidates.find(
      (c) => c.normalizedName === normalizedName && (!c.domain || c.verified !== true)
    );
    return nameMatch || null;
  }

  /**
   * Prepares deterministic company and source records for atomic database persistence.
   */
  public static prepareOnboarding(
    input: OnboardSourceInput,
    candidateCompanies: Company[] = []
  ): {
    matchedCompany: Company | null;
    preparedCompany: {
      name: string;
      slug: string;
      domain: string | null;
      careersUrl: string | null;
      normalizedName: string;
    };
    preparedSource: {
      sourceIdentifier: string;
      sourceUrl: string | null;
      priority: number;
      scheduleIntervalMinutes: number;
      isActive: boolean;
      healthStatus: 'healthy' | 'degraded' | 'failing' | 'disabled';
    };
  } {
    const rawName = input.companyName.trim();
    const filter = this.getCandidateLookupFilter(input);
    const matchedCompany = this.matchCompanyCandidate(candidateCompanies, filter);

    let uniqueSlug = '';
    if (matchedCompany) {
      uniqueSlug = matchedCompany.slug;
    } else {
      const existingSlugs = new Set(candidateCompanies.map((c) => c.slug));
      uniqueSlug = CompanyNormalizer.generateUniqueSlug(rawName, existingSlugs);
    }

    const cleanSourceIdentifier = CompanySourceNormalizer.normalizeIdentifier(input.boardIdentifier);
    const cleanSourceUrl = CompanySourceNormalizer.normalizeSourceUrl(input.sourceUrl || input.careersUrl);

    return {
      matchedCompany,
      preparedCompany: {
        name: rawName,
        slug: uniqueSlug,
        domain: matchedCompany?.domain || filter.domain,
        careersUrl: input.careersUrl || null,
        normalizedName: filter.normalizedName,
      },
      preparedSource: {
        sourceIdentifier: cleanSourceIdentifier,
        sourceUrl: cleanSourceUrl,
        priority: input.priority ?? 100,
        scheduleIntervalMinutes: input.scheduleIntervalMinutes ?? 360,
        isActive: input.isActive ?? true,
        healthStatus: 'healthy',
      },
    };
  }
}
