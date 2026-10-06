import { describe, it, expect } from 'vitest';
import { AtsDirectoryProvider } from '../../src/providers/ats-directory.provider.js';
import { DiscoveryRateLimiter, DomainCircuitBreaker } from '../../src/safety.js';

describe('AtsDirectoryProvider', () => {
  it('parses directory markdown table rows correctly', () => {
    const provider = new AtsDirectoryProvider();

    const markdown = `
# Engineering Opportunities
| **[True Anomaly](https://www.trueanomaly.space)** | **[Flight Software Engineer](https://jobright.ai/jobs/info/123)** | Denver, CO | On Site | Oct 06 |
| **[Stripe](https://stripe.com)** | **[Software Engineer](https://boards.greenhouse.io/stripe/jobs/456)** | San Francisco, CA | Remote | Oct 06 |
| ↳ | **[Systems Engineer](https://boards.greenhouse.io/stripe/jobs/457)** | Seattle, WA | Hybrid | Oct 06 |
    `;

    const candidates = provider.parseDirectoryMarkdown(markdown, 'https://raw.github.com/test');
    expect(candidates.length).toBe(2);

    const trueAnomaly = candidates.find((c) => c.company_name === 'True Anomaly');
    expect(trueAnomaly).toBeDefined();
    expect(trueAnomaly!.company_domain).toBe('trueanomaly.space');
    expect(trueAnomaly!.job_evidence.length).toBe(1);

    const stripe = candidates.find((c) => c.company_name === 'Stripe');
    expect(stripe).toBeDefined();
    expect(stripe!.company_domain).toBe('stripe.com');
    expect(stripe!.detected_ats).toBe('greenhouse');
    expect(stripe!.board_identifier).toBe('stripe');
  });

  it('extracts unique company slugs from ATS sitemap XML', () => {
    const provider = new AtsDirectoryProvider();

    const sampleXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://boards.greenhouse.io/stripe</loc></url>
        <url><loc>https://boards.greenhouse.io/figma</loc></url>
        <url><loc>https://boards.greenhouse.io/embed</loc></url>
        <url><loc>https://boards.greenhouse.io/stripe</loc></url>
      </urlset>
    `;

    const target = {
      atsType: 'greenhouse',
      sitemapUrl: 'https://boards.greenhouse.io/sitemap.xml',
      slugPattern: /^https?:\/\/boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i,
      boardUrlTemplate: (slug: string) => `https://boards.greenhouse.io/${slug}`,
    };

    const slugs = provider.extractSlugsFromSitemap(sampleXml, target);
    expect(slugs.length).toBe(2);
    expect(slugs).toContain('stripe');
    expect(slugs).toContain('figma');
    expect(slugs).not.toContain('embed');
  });

  it('buildCandidate resolves actual domains via fetch and does not invent them', async () => {
    const mockHttpClient = {
      get: async () => ({
        status: 200,
        data: '<html><body><a href="https://realcompany.io">Back to home</a></body></html>'
      })
    } as any;

    const provider = new AtsDirectoryProvider(mockHttpClient);
    const target = {
      atsType: 'greenhouse',
      sitemapUrl: 'https://boards.greenhouse.io/sitemap.xml',
      slugPattern: /^https?:\/\/boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i,
      boardUrlTemplate: (slug: string) => `https://boards.greenhouse.io/${slug}`,
    };

    const candidate = await provider.buildCandidate('realcompany', target);
    expect(candidate).not.toBeNull();
    expect(candidate!.company_domain).toBe('realcompany.io');
    expect(candidate!.company_domain).not.toBe('realcompany.com');
  });

  it('buildCandidate returns null if domain cannot be resolved', async () => {
    const mockHttpClient = {
      get: async () => ({
        status: 404,
        data: 'Not found'
      })
    } as any;

    const provider = new AtsDirectoryProvider(mockHttpClient);
    const target = {
      atsType: 'greenhouse',
      sitemapUrl: 'https://boards.greenhouse.io/sitemap.xml',
      slugPattern: /^https?:\/\/boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i,
      boardUrlTemplate: (slug: string) => `https://boards.greenhouse.io/${slug}`,
    };

    const candidate = await provider.buildCandidate('ghost', target);
    expect(candidate).toBeNull();
  });

  it('buildCandidate routes through rate limiter and circuit breaker', async () => {
    let callCount = 0;
    const mockHttpClient = {
      get: async () => {
        callCount++;
        throw new Error('Timeout');
      }
    } as any;

    const provider = new AtsDirectoryProvider(mockHttpClient);
    const target = {
      atsType: 'greenhouse',
      sitemapUrl: 'https://boards.greenhouse.io/sitemap.xml',
      slugPattern: /^https?:\/\/boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i,
      boardUrlTemplate: (slug: string) => `https://boards.greenhouse.io/${slug}`,
    };

    const rateLimiter = new DiscoveryRateLimiter();
    const circuitBreaker = new DomainCircuitBreaker({ failureThreshold: 2, resetAfterMs: 5000 });

    const options = { rateLimiter, circuitBreaker };

    await provider.buildCandidate('test1', target, options);
    await provider.buildCandidate('test2', target, options);
    // 3rd attempt should be blocked by circuit breaker
    await provider.buildCandidate('test3', target, options);

    // Should only have attempted 2 HTTP calls before tripping breaker
    expect(callCount).toBe(2);
    expect(circuitBreaker.isOpen('boards.greenhouse.io')).toBe(true);
  });
});
