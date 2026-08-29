import { describe, it, expect } from 'vitest';
import {
  CompanySourceOnboardingService,
  INITIAL_COMPANY_CATALOG,
  type Company,
} from '../src/index.js';

describe('CompanySourceOnboardingService (S13 & S15)', () => {
  const existingCompanies: Company[] = [
    {
      id: 'comp_100',
      name: 'Stripe, Inc.',
      slug: 'stripe',
      domain: 'stripe.com',
      normalizedName: 'stripe',
      website: 'https://stripe.com',
      careersUrl: 'https://stripe.com/careers',
      logoUrl: null,
      description: null,
      industry: 'Fintech',
      companySize: '5000+',
      status: 'active',
      metadata: {},
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    },
  ];

  it('matches existing company by verified domain', () => {
    const result = CompanySourceOnboardingService.prepareOnboarding(
      {
        companyName: 'Stripe Payments',
        companyDomain: 'https://www.stripe.com/about',
        atsType: 'greenhouse',
        boardIdentifier: 'stripe',
      },
      existingCompanies
    );

    expect(result.matchedCompany).not.toBeNull();
    expect(result.matchedCompany?.id).toBe('comp_100');
    expect(result.preparedCompany.slug).toBe('stripe');
  });

  it('matches existing company by normalized name when domain is omitted', () => {
    const result = CompanySourceOnboardingService.prepareOnboarding(
      {
        companyName: 'Stripe',
        atsType: 'greenhouse',
        boardIdentifier: 'stripe',
      },
      existingCompanies
    );

    expect(result.matchedCompany).not.toBeNull();
    expect(result.matchedCompany?.id).toBe('comp_100');
  });

  it('generates collision-safe slug for new company when slug exists', () => {
    const result = CompanySourceOnboardingService.prepareOnboarding(
      {
        companyName: 'Stripe',
        companyDomain: 'stripe-different.org', // Different domain -> new company
        atsType: 'lever',
        boardIdentifier: 'stripe-org',
      },
      existingCompanies
    );

    expect(result.matchedCompany).toBeNull();
    expect(result.preparedCompany.slug).toBe('stripe-2');
    expect(result.preparedSource.sourceIdentifier).toBe('stripe-org');
  });

  it('validates the entire INITIAL_COMPANY_CATALOG data integrity', () => {
    expect(INITIAL_COMPANY_CATALOG.length).toBeGreaterThanOrEqual(5);

    for (const seed of INITIAL_COMPANY_CATALOG) {
      expect(seed.companyName).toBeTruthy();
      expect(seed.atsType).toMatch(/^(greenhouse|lever|ashby)$/);
      expect(seed.boardIdentifier).toBeTruthy();
      expect(seed.priority).toBeGreaterThanOrEqual(1);
      expect(seed.scheduleIntervalMinutes).toBeGreaterThanOrEqual(60);
    }
  });
});
