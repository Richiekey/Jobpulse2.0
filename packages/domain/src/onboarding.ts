import type { CompanySourceConfig } from './entities/source.js';
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

export interface OnboardSourceOutput {
  company: {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
    isCreated: boolean;
  };
  companySource: {
    id: string;
    companyId: string;
    sourceId: string;
    sourceIdentifier: string;
    sourceUrl: string | null;
    isActive: boolean;
    healthStatus: string;
    isCreated: boolean;
  };
}

export class CompanySourceOnboardingService {
  /**
   * Evaluates and prepares deterministic company & source onboarding payloads.
   * Enforces normalization, deduplication signals, and source identifier formatting.
   */
  public static prepareOnboarding(
    input: OnboardSourceInput,
    existingCompanies: Company[] = [],
    _existingSources: CompanySourceConfig[] = []
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
    const normalizedName = CompanyNormalizer.normalizeName(rawName);
    const domain = input.companyDomain
      ? CompanyNormalizer.extractRegistrableDomain(input.companyDomain)
      : input.careersUrl
      ? CompanyNormalizer.extractRegistrableDomain(input.careersUrl)
      : null;

    // 1. Check for existing company match:
    let matchedCompany: Company | null = null;

    if (domain) {
      // If a verified domain is provided, match strictly by domain
      matchedCompany =
        existingCompanies.find(
          (c) => c.domain && CompanyNormalizer.extractRegistrableDomain(c.domain) === domain
        ) || null;
    } else {
      // If domain is omitted, candidate match by normalized name
      matchedCompany = existingCompanies.find((c) => c.normalizedName === normalizedName) || null;
    }

    // Determine collision-safe slug if creating new company
    let uniqueSlug = '';
    if (matchedCompany) {
      uniqueSlug = matchedCompany.slug;
    } else {
      const existingSlugs = new Set(existingCompanies.map((c) => c.slug));
      uniqueSlug = CompanyNormalizer.generateUniqueSlug(rawName, existingSlugs);
    }

    const cleanSourceIdentifier = CompanySourceNormalizer.normalizeIdentifier(input.boardIdentifier);
    const cleanSourceUrl = CompanySourceNormalizer.normalizeSourceUrl(input.sourceUrl || input.careersUrl);

    return {
      matchedCompany,
      preparedCompany: {
        name: rawName,
        slug: uniqueSlug,
        domain: matchedCompany?.domain || domain,
        careersUrl: input.careersUrl || null,
        normalizedName,
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
