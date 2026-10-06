import { describe, it, expect } from 'vitest';
import { AtsDirectoryProvider } from '../../src/providers/ats-directory.provider.js';

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
});
