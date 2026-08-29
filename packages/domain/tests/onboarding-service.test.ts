import { describe, it, expect } from 'vitest';
import {
  CompanySourceOnboardingService,
  INITIAL_COMPANY_CATALOG,
  type Company,
} from '../src/index.js';

describe('CompanySourceOnboardingService Identity & Verification (S13, S15)', () => {
  const verifiedStripe: Company = {
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
    verified: true,
    status: 'active',
    metadata: {},
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  };

  const unverifiedAcme: Company = {
    id: 'comp_200',
    name: 'Acme Logistics',
    slug: 'acme-logistics',
    domain: 'acme.org',
    normalizedName: 'acmelogistics',
    website: 'https://acme.org',
    careersUrl: 'https://acme.org/careers',
    logoUrl: null,
    description: null,
    industry: 'Logistics',
    companySize: '50-100',
    verified: false,
    status: 'active',
    metadata: {},
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  };

  it('verified matching domain: matches authoritatively even with slight variation in company name', () => {
    const result = CompanySourceOnboardingService.prepareOnboarding(
      {
        companyName: 'Stripe Payments UK',
        companyDomain: 'https://www.stripe.com/about',
        atsType: 'greenhouse',
        boardIdentifier: 'stripe',
      },
      [verifiedStripe]
    );

    expect(result.matchedCompany).not.toBeNull();
    expect(result.matchedCompany?.id).toBe('comp_100');
    expect(result.preparedCompany.slug).toBe('stripe');
  });

  it('unverified matching domain: does NOT match when company names differ (prevents domain hijacking/collision)', () => {
    const result = CompanySourceOnboardingService.prepareOnboarding(
      {
        companyName: 'Acme Cloud Computing',
        companyDomain: 'https://acme.org',
        atsType: 'lever',
        boardIdentifier: 'acme-cloud',
      },
      [unverifiedAcme]
    );

    // Should NOT match unverified Acme Logistics because names represent different corporate identities
    expect(result.matchedCompany).toBeNull();
    expect(result.preparedCompany.slug).toBe('acme-cloud-computing');
  });

  it('unverified matching domain: matches when normalized company names are identical', () => {
    const result = CompanySourceOnboardingService.prepareOnboarding(
      {
        companyName: 'Acme Logistics LLC',
        companyDomain: 'https://acme.org',
        atsType: 'lever',
        boardIdentifier: 'acme-logistics',
      },
      [unverifiedAcme]
    );

    expect(result.matchedCompany).not.toBeNull();
    expect(result.matchedCompany?.id).toBe('comp_200');
  });

  it('different domain: generates collision-safe slug for new company entity', () => {
    const result = CompanySourceOnboardingService.prepareOnboarding(
      {
        companyName: 'Stripe',
        companyDomain: 'stripe-consulting.org',
        atsType: 'lever',
        boardIdentifier: 'stripe-org',
      },
      [verifiedStripe]
    );

    expect(result.matchedCompany).toBeNull();
    expect(result.preparedCompany.slug).toBe('stripe-2');
    expect(result.preparedSource.sourceIdentifier).toBe('stripe-org');
  });

  it('same domain belonging to different candidate records: authoritatively prefers verified record', () => {
    const unverifiedStripeClone: Company = {
      ...verifiedStripe,
      id: 'comp_101',
      name: 'Stripe Clone',
      verified: false,
    };

    const result = CompanySourceOnboardingService.prepareOnboarding(
      {
        companyName: 'Stripe',
        companyDomain: 'stripe.com',
        atsType: 'greenhouse',
        boardIdentifier: 'stripe',
      },
      [unverifiedStripeClone, verifiedStripe]
    );

    expect(result.matchedCompany).not.toBeNull();
    expect(result.matchedCompany?.id).toBe('comp_100'); // Selected the verified one
    expect(result.matchedCompany?.verified).toBe(true);
  });

  it('generates targeted lookup filter to prevent full table scans', () => {
    const filter = CompanySourceOnboardingService.getCandidateLookupFilter({
      companyName: 'Linear, Inc.',
      companyDomain: 'https://linear.app/careers',
      atsType: 'ashby',
      boardIdentifier: 'linear',
    });

    expect(filter.domain).toBe('linear.app');
    expect(filter.normalizedName).toBe('linear');
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
