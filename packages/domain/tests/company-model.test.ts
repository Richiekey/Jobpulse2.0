import { describe, it, expect } from 'vitest';
import { CompanyNormalizer, type Company } from '../src/entities/company.js';
import { CompanySourceNormalizer } from '../src/entities/source.js';

describe('Company Model, Normalization & Domain Extraction (Batch A Verification)', () => {
  describe('Company Normalization Collision & Search Signal Invariant (Finding 3)', () => {
    it('normalizes corporate variations into a uniform candidate search signal', () => {
      const variations = [
        'Example Technologies',
        'Example Tech',
        'Example Technology Group',
        'Example, Inc.',
        'Example Ltd.',
        'Example LLC',
        'Example Corp.',
        'Example Corporation',
        'Example Company',
        'Example Co.',
        'Example',
      ];

      for (const name of variations) {
        expect(CompanyNormalizer.normalizeName(name)).toBe('example');
      }
    });

    it('proves normalizedName is a matching signal and NOT an authoritative unique identity', () => {
      // Two distinct legal entities that share a normalized name signal
      const companyA: Company = {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Example Technologies',
        normalizedName: CompanyNormalizer.normalizeName('Example Technologies'),
        slug: CompanyNormalizer.generateSlug('Example Technologies'),
        domain: 'exampletech.com',
        status: 'active',
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const companyB: Company = {
        id: '10000000-0000-4000-8000-000000000002',
        name: 'Example Group',
        normalizedName: CompanyNormalizer.normalizeName('Example Group'),
        slug: CompanyNormalizer.generateSlug('Example Group'),
        domain: 'examplegroup.com',
        status: 'active',
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Invariant: Distinct IDs, distinct slugs, distinct domains despite shared normalizedName signal
      expect(companyA.normalizedName).toBe(companyB.normalizedName); // Both 'example'
      expect(companyA.id).not.toBe(companyB.id);
      expect(companyA.slug).not.toBe(companyB.slug);
      expect(companyA.slug).toBe('example-technologies');
      expect(companyB.slug).toBe('example-group');
      expect(companyA.domain).not.toBe(companyB.domain);
    });
  });

  describe('Registrable Domain Extraction Full Matrix (Finding 4)', () => {
    it('accurately extracts hostname and registrable domain across standard TLDs and subdomains', () => {
      expect(CompanyNormalizer.extractHostname('https://www.example.com')).toBe('www.example.com');
      expect(CompanyNormalizer.extractRegistrableDomain('https://www.example.com')).toBe('example.com');

      expect(CompanyNormalizer.extractHostname('https://careers.example.com')).toBe('careers.example.com');
      expect(CompanyNormalizer.extractRegistrableDomain('https://careers.example.com')).toBe('example.com');

      expect(CompanyNormalizer.extractHostname('https://jobs.example.com')).toBe('jobs.example.com');
      expect(CompanyNormalizer.extractRegistrableDomain('https://jobs.example.com')).toBe('example.com');
    });

    it('correctly resolves multi-part public suffixes (.co.uk, .com.au, .co.za, etc.)', () => {
      expect(CompanyNormalizer.extractHostname('https://company.co.uk')).toBe('company.co.uk');
      expect(CompanyNormalizer.extractRegistrableDomain('https://company.co.uk')).toBe('company.co.uk');

      expect(CompanyNormalizer.extractHostname('https://jobs.company.co.uk')).toBe('jobs.company.co.uk');
      expect(CompanyNormalizer.extractRegistrableDomain('https://jobs.company.co.uk')).toBe('company.co.uk');

      expect(CompanyNormalizer.extractHostname('https://company.com.au')).toBe('company.com.au');
      expect(CompanyNormalizer.extractRegistrableDomain('https://company.com.au')).toBe('company.com.au');

      expect(CompanyNormalizer.extractHostname('https://jobs.company.com.au')).toBe('jobs.company.com.au');
      expect(CompanyNormalizer.extractRegistrableDomain('https://jobs.company.com.au')).toBe('company.com.au');

      expect(CompanyNormalizer.extractHostname('https://portal.company.co.za')).toBe('portal.company.co.za');
      expect(CompanyNormalizer.extractRegistrableDomain('https://portal.company.co.za')).toBe('company.co.za');
    });

    it('handles URLs without protocol, with ports, paths, query params, fragments, and uppercase', () => {
      // Protocol-less
      expect(CompanyNormalizer.extractHostname('example.com/careers')).toBe('example.com');
      expect(CompanyNormalizer.extractRegistrableDomain('example.com/careers')).toBe('example.com');

      expect(CompanyNormalizer.extractHostname('careers.company.com/openings')).toBe('careers.company.com');
      expect(CompanyNormalizer.extractRegistrableDomain('careers.company.com/openings')).toBe('company.com');

      // Ports
      expect(CompanyNormalizer.extractHostname('http://example.com:8080/jobs')).toBe('example.com');
      expect(CompanyNormalizer.extractRegistrableDomain('http://example.com:8080/jobs')).toBe('example.com');

      // Paths, queries, fragments
      expect(CompanyNormalizer.extractHostname('https://jobs.example.com/roles?id=123&src=test#apply-now')).toBe('jobs.example.com');
      expect(CompanyNormalizer.extractRegistrableDomain('https://jobs.example.com/roles?id=123&src=test#apply-now')).toBe('example.com');

      // Uppercase
      expect(CompanyNormalizer.extractHostname('HTTPS://CAREERS.EXAMPLE.COM/JOBS')).toBe('careers.example.com');
      expect(CompanyNormalizer.extractRegistrableDomain('HTTPS://CAREERS.EXAMPLE.COM/JOBS')).toBe('example.com');

      // Nested subdomains
      expect(CompanyNormalizer.extractHostname('https://us.east.careers.company.com')).toBe('us.east.careers.company.com');
      expect(CompanyNormalizer.extractRegistrableDomain('https://us.east.careers.company.com')).toBe('company.com');
    });

    it('gracefully handles malformed or empty URLs', () => {
      expect(CompanyNormalizer.extractHostname('')).toBeNull();
      expect(CompanyNormalizer.extractHostname(null)).toBeNull();
      expect(CompanyNormalizer.extractHostname(undefined)).toBeNull();
      expect(CompanyNormalizer.extractRegistrableDomain('')).toBeNull();
      expect(CompanyNormalizer.extractRegistrableDomain(null)).toBeNull();
    });
  });

  describe('CompanySourceNormalizer', () => {
    it('cleans tracking parameters, fragments, trailing slashes, and enforces HTTPS', () => {
      const dirty = 'http://boards.greenhouse.io/stripe/?gh_src=linkedin&utm_source=feed&ref=newsletter#anchor';
      const clean = CompanySourceNormalizer.normalizeSourceUrl(dirty);
      expect(clean).toBe('https://boards.greenhouse.io/stripe');

      expect(CompanySourceNormalizer.normalizeIdentifier('  STRIPE_HQ  ')).toBe('stripe_hq');
    });
  });
});
