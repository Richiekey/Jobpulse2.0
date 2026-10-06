import { describe, it, expect } from 'vitest';
import { normalizeDomain, normalizeUrl, normalizeCandidate, extractCorporateDomainFromHtml } from '../src/normalization.js';
import { DiscoveryCandidate } from '../src/types.js';

describe('Normalization Module', () => {
  describe('normalizeDomain', () => {
    it('strips www prefix', () => {
      expect(normalizeDomain('https://www.stripe.com')).toBe('stripe.com');
      expect(normalizeDomain('http://www.stripe.com/')).toBe('stripe.com');
      expect(normalizeDomain('www.stripe.com')).toBe('stripe.com');
    });

    it('extracts root domain from subdomains', () => {
      expect(normalizeDomain('https://careers.google.com/jobs')).toBe('google.com');
      expect(normalizeDomain('https://jobs.lever.co/netflix')).toBe('lever.co');
      expect(normalizeDomain('app.sub.acme.com')).toBe('acme.com');
    });

    it('handles multi-part public suffixes correctly', () => {
      expect(normalizeDomain('https://www.deliveroo.co.uk')).toBe('deliveroo.co.uk');
      expect(normalizeDomain('https://careers.company.com.au/jobs')).toBe('company.com.au');
    });

    it('normalizes uppercase to lowercase and trims whitespace', () => {
      expect(normalizeDomain('  HTTPS://WWW.ACME.COM/CAREERS  ')).toBe('acme.com');
    });

    it('returns null for null, undefined, or empty strings', () => {
      expect(normalizeDomain(null)).toBeNull();
      expect(normalizeDomain(undefined)).toBeNull();
      expect(normalizeDomain('')).toBeNull();
      expect(normalizeDomain('   ')).toBeNull();
    });
  });

  describe('normalizeUrl', () => {
    it('converts http to https', () => {
      expect(normalizeUrl('http://example.com/jobs')).toBe('https://example.com/jobs');
    });

    it('strips tracking parameters', () => {
      const dirty = 'https://boards.greenhouse.io/stripe/jobs/123?gh_src=indeed&utm_source=twitter&utm_medium=social&ref=partner';
      const clean = normalizeUrl(dirty);
      expect(clean).toBe('https://boards.greenhouse.io/stripe/jobs/123');
    });

    it('strips trailing slashes from path', () => {
      expect(normalizeUrl('https://example.com/careers/')).toBe('https://example.com/careers');
    });

    it('returns null for invalid or empty urls', () => {
      expect(normalizeUrl('')).toBeNull();
      expect(normalizeUrl(null)).toBeNull();
    });
  });

  describe('normalizeCandidate', () => {
    it('normalizes all domains, urls, and job evidence in a candidate', () => {
      const candidate: DiscoveryCandidate = {
        company_name: '  Acme Corp  ',
        company_domain: 'WWW.ACME.COM',
        careers_url: 'http://acme.com/jobs/?utm_source=test',
        source_url: 'http://acme.com/about',
        detected_ats: ' GREENHOUSE ',
        ats_url: 'https://boards.greenhouse.io/acme/?gh_src=abc',
        job_evidence: [
          {
            job_url: 'http://acme.com/jobs/123?utm_campaign=winter',
            job_title: '  Staff Engineer  ',
            discovered_at: '2026-10-07T00:00:00Z',
            source_provider: 'test',
          },
        ],
        discovered_from: 'test',
        discovered_at: '2026-10-07T00:00:00Z',
        evidence: [],
        confidence: 0.8,
      };

      const normalized = normalizeCandidate(candidate);
      expect(normalized).not.toBeNull();
      expect(normalized!.company_name).toBe('Acme Corp');
      expect(normalized!.company_domain).toBe('acme.com');
      expect(normalized!.careers_url).toBe('https://acme.com/jobs');
      expect(normalized!.detected_ats).toBe('greenhouse');
      expect(normalized!.ats_url).toBe('https://boards.greenhouse.io/acme');
      expect(normalized!.job_evidence[0]!.job_title).toBe('Staff Engineer');
      expect(normalized!.job_evidence[0]!.job_url).toBe('https://acme.com/jobs/123');
    });

    it('returns null if company domain is invalid', () => {
      const candidate: DiscoveryCandidate = {
        company_name: 'Invalid',
        company_domain: '',
        job_evidence: [],
        discovered_from: 'test',
        discovered_at: '2026-10-07T00:00:00Z',
        evidence: [],
        confidence: 0.5,
      };

      expect(normalizeCandidate(candidate)).toBeNull();
    });
  });

  describe('extractCorporateDomainFromHtml', () => {
    it('returns the most frequent non-generic domain', () => {
      const html = `
        <a href="https://linkedin.com/company/acme">LinkedIn</a>
        <a href="https://greenhouse.io">Greenhouse</a>
        <a href="https://acme.com/about">About</a>
        <a href="https://acme.com/jobs">Jobs</a>
        <a href="https://other.com/partner">Partner</a>
      `;
      expect(extractCorporateDomainFromHtml(html)).toBe('acme.com');
    });

    it('ignores generic domains like linkedin and greenhouse', () => {
      const html = `
        <a href="https://linkedin.com/company/acme">LinkedIn</a>
        <a href="https://boards.greenhouse.io/acme">Greenhouse</a>
      `;
      expect(extractCorporateDomainFromHtml(html)).toBeNull();
    });

    it('returns null for empty or invalid html', () => {
      expect(extractCorporateDomainFromHtml('')).toBeNull();
      expect(extractCorporateDomainFromHtml('no links here')).toBeNull();
    });
  });
});
