import { describe, it, expect, vi } from 'vitest';
import { HttpClient } from '@jobpulse/shared';
import { enrichCandidate, discoverCareersUrl } from '../src/careers.js';
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
