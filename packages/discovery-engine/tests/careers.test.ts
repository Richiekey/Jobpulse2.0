import { describe, it, expect, vi } from 'vitest';
import { HttpClient } from '@jobpulse/shared';
import { enrichCandidate, discoverCareersUrl, isLikelyCareersPage } from '../src/careers.js';
import { DiscoveryCandidate } from '../src/types.js';

describe('Careers Discovery & ATS Enrichment', () => {
  it('discovers careers page at /careers when endpoint returns 200', async () => {
    const mockHttpClient = {
      get: vi.fn().mockImplementation(async (url: string) => {
        if (url === 'https://acme.com/careers') {
          return {
            status: 200,
            statusText: 'OK',
            url: 'https://acme.com/careers',
            data: '<html><title>Acme Careers</title></html>',
          };
        }
        throw new Error('404 Not Found');
      }),
    } as unknown as HttpClient;

    const careersUrl = await discoverCareersUrl('acme.com', mockHttpClient);
    expect(careersUrl).toBe('https://acme.com/careers');
  });

  describe('isLikelyCareersPage', () => {
    it('accepts https://acme.com/careers with careers content', () => {
      expect(isLikelyCareersPage('https://acme.com/careers', '<html><body>We are hiring!</body></html>')).toBe(true);
    });

    it('accepts https://acme.com/jobs with jobs content', () => {
      expect(isLikelyCareersPage('https://acme.com/jobs', '<html><body>See our open positions</body></html>')).toBe(true);
    });

    it('accepts ATS-backed careers page', () => {
      expect(isLikelyCareersPage('https://acme.com/company', '<html><body><a href="https://boards.greenhouse.io/acme">Apply</a></body></html>')).toBe(true);
    });

    it('rejects homepage saying "We are passionate about careers..." but otherwise normal', () => {
      const html = '<html><body>We are passionate about our careers but this is a marketing page.</body></html>';
      expect(isLikelyCareersPage('https://acme.com', html)).toBe(false);
    });

    it('rejects generic page containing word jobs once', () => {
      const html = '<html><body>Steve Jobs was a visionary.</body></html>';
      expect(isLikelyCareersPage('https://acme.com', html)).toBe(false);
    });
  });

  it('detects ATS from careers page HTML and enriches candidate', async () => {
    const candidate: DiscoveryCandidate = {
      company_name: 'Stripe',
      company_domain: 'stripe.com',
      careers_url: 'https://stripe.com/careers',
      job_evidence: [],
      discovered_from: 'test',
      discovered_at: '2026-10-07T00:00:00Z',
      evidence: [],
      confidence: 0.7,
    };

    const mockHttpClient = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        url: 'https://stripe.com/careers',
        data: `
          <html>
            <body>
              <a href="https://boards.greenhouse.io/stripe/jobs/1">View Jobs</a>
            </body>
          </html>
        `,
      }),
    } as unknown as HttpClient;

    const enriched = await enrichCandidate(candidate, {
      httpClient: mockHttpClient,
      discoverCareers: false,
    });

    expect(enriched.detected_ats).toBe('greenhouse');
    expect(enriched.board_identifier).toBe('stripe');
    expect(enriched.evidence.some((e) => e.provider === 'ats-detector')).toBe(true);
  });
});
