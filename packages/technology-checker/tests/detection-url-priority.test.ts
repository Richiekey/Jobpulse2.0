import { describe, it, expect } from 'vitest';
import { buildVerificationUrls } from '../src/verification.js';

/**
 * Detection URL priority tests.
 *
 * The TechnologyChecker API may return a detection_url for a company,
 * which should be probed FIRST before generic fallback URLs like
 * /careers, /jobs, etc. This is because the detection URL is the actual
 * page where the ATS was detected, so it's the highest-confidence target.
 */
describe('Detection URL Priority', () => {
  it('detection_url is first in the list when present', () => {
    const urls = buildVerificationUrls({
      domain: 'example.com',
      detection_url: 'https://jobs.example.com/company/abc',
    });

    expect(urls[0]).toBe('https://jobs.example.com/company/abc');
    expect(urls.length).toBeGreaterThan(1); // fallbacks still present
  });

  it('fallback URLs are used when detection_url is null', () => {
    const urls = buildVerificationUrls({
      domain: 'example.com',
      detection_url: null,
    });

    expect(urls[0]).toBe('https://example.com/careers');
    expect(urls).not.toContain(null);
    expect(urls).not.toContain(undefined);
  });

  it('fallback URLs are used when detection_url is undefined', () => {
    const urls = buildVerificationUrls({
      domain: 'example.com',
    });

    expect(urls[0]).toBe('https://example.com/careers');
  });

  it('fallback URLs follow the expected order', () => {
    const urls = buildVerificationUrls({
      domain: 'test.io',
      detection_url: null,
    });

    expect(urls).toEqual([
      'https://test.io/careers',
      'https://test.io/jobs',
      'https://careers.test.io',
      'https://jobs.test.io',
      'https://test.io',
    ]);
  });

  it('detection_url is prepended to the standard fallback list', () => {
    const urls = buildVerificationUrls({
      domain: 'corp.com',
      detection_url: 'https://apply.workable.com/corp',
    });

    expect(urls).toEqual([
      'https://apply.workable.com/corp',
      'https://corp.com/careers',
      'https://corp.com/jobs',
      'https://careers.corp.com',
      'https://jobs.corp.com',
      'https://corp.com',
    ]);
  });

  it('empty string detection_url is treated as falsy', () => {
    const urls = buildVerificationUrls({
      domain: 'example.com',
      detection_url: '',
    });

    // Empty string is falsy, so detection_url should NOT be first
    expect(urls[0]).toBe('https://example.com/careers');
  });
});
