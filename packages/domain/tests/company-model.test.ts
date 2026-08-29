import { describe, it, expect } from 'vitest';
import { CompanyNormalizer } from '../src/entities/company.js';
import { CompanySourceNormalizer } from '../src/entities/source.js';

describe('Company Model & Normalization (Batch A Remediated)', () => {
  it('strips legal entity suffixes and non-alphanumeric characters deterministically for candidate search signals', () => {
    expect(CompanyNormalizer.normalizeName('Stripe, Inc.')).toBe('stripe');
    expect(CompanyNormalizer.normalizeName('OpenAI LLC')).toBe('openai');
    expect(CompanyNormalizer.normalizeName('Google Technologies Corp.')).toBe('google');
    expect(CompanyNormalizer.normalizeName('Amazon.com Ltd.')).toBe('amazoncom');
    expect(CompanyNormalizer.normalizeName('Datadog Co.')).toBe('datadog');
    expect(CompanyNormalizer.normalizeName('Acme Group')).toBe('acme');
  });

  it('generates URL-friendly, deterministic company slugs with collision resolution', () => {
    expect(CompanyNormalizer.generateSlug('Stripe, Inc.')).toBe('stripe-inc');
    expect(CompanyNormalizer.generateSlug('Vercel & Next.js')).toBe('vercel-next-js');
    expect(CompanyNormalizer.generateSlug('  Scale AI  ')).toBe('scale-ai');

    // Test collision handling
    const existing = new Set(['acme', 'acme-2']);
    expect(CompanyNormalizer.generateUniqueSlug('Acme', existing)).toBe('acme-3');
    expect(CompanyNormalizer.generateUniqueSlug('Stripe', existing)).toBe('stripe');
  });

  it('correctly distinguishes exact hostname from true registrable root domain', () => {
    // Standard .com domains
    expect(CompanyNormalizer.extractHostname('https://www.company.com/careers')).toBe('www.company.com');
    expect(CompanyNormalizer.extractRegistrableDomain('https://www.company.com/careers')).toBe('company.com');

    expect(CompanyNormalizer.extractHostname('https://careers.company.com')).toBe('careers.company.com');
    expect(CompanyNormalizer.extractRegistrableDomain('https://careers.company.com')).toBe('company.com');

    expect(CompanyNormalizer.extractHostname('https://jobs.company.com')).toBe('jobs.company.com');
    expect(CompanyNormalizer.extractRegistrableDomain('https://jobs.company.com')).toBe('company.com');

    // Multi-part second-level public suffixes (.co.uk, .com.au, .co.za)
    expect(CompanyNormalizer.extractHostname('https://company.co.uk')).toBe('company.co.uk');
    expect(CompanyNormalizer.extractRegistrableDomain('https://company.co.uk')).toBe('company.co.uk');

    expect(CompanyNormalizer.extractHostname('https://careers.company.co.uk/jobs')).toBe('careers.company.co.uk');
    expect(CompanyNormalizer.extractRegistrableDomain('https://careers.company.co.uk/jobs')).toBe('company.co.uk');

    expect(CompanyNormalizer.extractHostname('https://jobs.company.com.au/tech')).toBe('jobs.company.com.au');
    expect(CompanyNormalizer.extractRegistrableDomain('https://jobs.company.com.au/tech')).toBe('company.com.au');

    expect(CompanyNormalizer.extractHostname('https://sub.portal.company.co.za')).toBe('sub.portal.company.co.za');
    expect(CompanyNormalizer.extractRegistrableDomain('https://sub.portal.company.co.za')).toBe('company.co.za');

    // Edge cases
    expect(CompanyNormalizer.extractHostname(null)).toBeNull();
    expect(CompanyNormalizer.extractRegistrableDomain(null)).toBeNull();
  });

  it('CompanySourceNormalizer cleans URLs and source identifiers deterministically', () => {
    // Normalizes tracking params, fragment, trailing slash, protocol
    const dirtyUrl = 'http://boards.greenhouse.io/stripe/?gh_src=linkedin&utm_source=feed#openings';
    const cleanUrl = CompanySourceNormalizer.normalizeSourceUrl(dirtyUrl);
    expect(cleanUrl).toBe('https://boards.greenhouse.io/stripe');

    const cleanId = CompanySourceNormalizer.normalizeIdentifier('  STRIPE  ');
    expect(cleanId).toBe('stripe');
  });
});
