import { HttpClient } from '@jobpulse/shared';
import { logger } from '@jobpulse/shared';
import { ATSDetector } from '@jobpulse/ats';
import { DiscoveryCandidate, JobEvidence, DiscoveryEvidence } from '../types.js';
import { DiscoveryOptions, DiscoveryProvider } from './provider.interface.js';
import { normalizeDomain, normalizeUrl } from '../normalization.js';

interface AtsTargetConfig {
  atsType: string;
  sitemapUrl: string;
  slugPattern: RegExp;
  boardUrlTemplate: (slug: string) => string;
}

const ATS_SITEMAP_TARGETS: AtsTargetConfig[] = [
  {
    atsType: 'greenhouse',
    sitemapUrl: 'https://boards.greenhouse.io/sitemap.xml',
    slugPattern: /^https?:\/\/boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i,
    boardUrlTemplate: (slug) => `https://boards.greenhouse.io/${slug}`,
  },
  {
    atsType: 'lever',
    sitemapUrl: 'https://jobs.lever.co/sitemap.xml',
    slugPattern: /^https?:\/\/jobs\.lever\.co\/([a-zA-Z0-9_-]+)/i,
    boardUrlTemplate: (slug) => `https://jobs.lever.co/${slug}`,
  },
  {
    atsType: 'ashby',
    sitemapUrl: 'https://jobs.ashbyhq.com/sitemap.xml',
    slugPattern: /^https?:\/\/jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/i,
    boardUrlTemplate: (slug) => `https://jobs.ashbyhq.com/${slug}`,
  },
  {
    atsType: 'workable',
    sitemapUrl: 'https://apply.workable.com/sitemap.xml',
    slugPattern: /^https?:\/\/apply\.workable\.com\/([a-zA-Z0-9_-]+)/i,
    boardUrlTemplate: (slug) => `https://apply.workable.com/${slug}`,
  },
];

const DIRECTORY_SOURCES = [
  'https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md',
];

const EXCLUDED_SLUGS = new Set([
  'embed',
  'sitemap',
  'robots',
  'api',
  'search',
  'terms',
  'privacy',
  'auth',
  'login',
  'help',
  'about',
  'static',
]);

export class AtsDirectoryProvider implements DiscoveryProvider {
  public readonly name = 'ats-directory';
  private readonly httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient || new HttpClient({ timeoutMs: 15000 });
  }

  public async discover(options: DiscoveryOptions = {}): Promise<DiscoveryCandidate[]> {
    const candidates: DiscoveryCandidate[] = [];
    const limit = options.limit ?? 50;

    // 1. Try public company directory indices (markdown tables)
    for (const directoryUrl of DIRECTORY_SOURCES) {
      if (candidates.length >= limit) break;
      try {
        if (options.verbose) {
          logger.info(`[AtsDirectoryProvider] Crawling directory feed: ${directoryUrl}`);
        }
        const res = await this.httpClient.get<string>(directoryUrl);
        const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        const directoryCandidates = this.parseDirectoryMarkdown(text, directoryUrl);

        for (const candidate of directoryCandidates) {
          if (candidates.length >= limit) break;
          candidates.push(candidate);
        }
      } catch (err) {
        logger.warn(`[AtsDirectoryProvider] Directory feed fetch failed for ${directoryUrl}:`, {
          error: String(err),
        });
      }
    }

    // 2. Try sitemap XML targets if candidates still needed
    for (const target of ATS_SITEMAP_TARGETS) {
      if (candidates.length >= limit) break;

      try {
        if (options.verbose) {
          logger.info(`[AtsDirectoryProvider] Crawling sitemap for ${target.atsType}: ${target.sitemapUrl}`);
        }

        const res = await this.httpClient.get<string>(target.sitemapUrl, {
          maxSizeBytes: 10 * 1024 * 1024,
        });

        const xml = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        const slugs = this.extractSlugsFromSitemap(xml, target);

        for (const slug of slugs) {
          if (candidates.length >= limit) break;
          const candidate = await this.buildCandidate(slug, target);
          if (candidate) {
            candidates.push(candidate);
          }
        }
      } catch (err) {
        // Sitemaps may not be enabled or may return 404
        if (options.verbose) {
          logger.warn(`[AtsDirectoryProvider] Sitemap not available for ${target.atsType}:`, {
            error: String(err),
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Parses public Markdown table directories for hiring companies and ATS links.
   * Format: | **[Company Name](Company URL)** | **[Job Title](Job URL)** | Location | Type | Date |
   */
  public parseDirectoryMarkdown(markdown: string, sourceUrl: string): DiscoveryCandidate[] {
    const candidates: DiscoveryCandidate[] = [];
    const lines = markdown.split('\n');
    const now = new Date().toISOString();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('| **') && !trimmed.startsWith('| [')) continue;

      // Extract markdown links: [Text](URL)
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      const links: { text: string; url: string }[] = [];
      let match: RegExpExecArray | null;

      while ((match = linkRegex.exec(trimmed)) !== null) {
        const text = match[1]?.trim();
        const url = match[2]?.trim();
        if (text && url && (url.startsWith('http://') || url.startsWith('https://'))) {
          links.push({ text, url });
        }
      }

      if (links.length === 0) continue;

      const firstLink = links[0]!;
      const companyName = firstLink.text.replace(/[*_#]/g, '').trim();
      const companyUrl = firstLink.url;
      const domain = normalizeDomain(companyUrl);
      if (!domain) continue;

      let jobUrl = links.length > 1 ? links[1]!.url : null;
      let jobTitle = links.length > 1 ? links[1]!.text.replace(/[*_#]/g, '').trim() : 'Software Engineer';

      // Detect ATS from companyUrl or jobUrl
      let detectedAts: string | null = null;
      let atsUrl: string | null = null;
      let boardIdentifier: string | null = null;

      if (jobUrl) {
        const atsResult = ATSDetector.detect(jobUrl);
        if (atsResult.detected) {
          detectedAts = atsResult.atsType;
          atsUrl = atsResult.sourceUrl;
          boardIdentifier = atsResult.boardIdentifier;
        }
      }

      if (!detectedAts) {
        const atsResult = ATSDetector.detect(companyUrl);
        if (atsResult.detected) {
          detectedAts = atsResult.atsType;
          atsUrl = atsResult.sourceUrl;
          boardIdentifier = atsResult.boardIdentifier;
        }
      }

      const jobEvidence: JobEvidence[] = [];
      if (jobUrl) {
        jobEvidence.push({
          job_url: normalizeUrl(jobUrl) || jobUrl,
          job_title: jobTitle,
          discovered_at: now,
          source_provider: this.name,
        });
      }

      const evidence: DiscoveryEvidence[] = [
        {
          provider: this.name,
          timestamp: now,
          evidence_type: 'directory_entry',
          url: sourceUrl,
          metadata: {
            company_url: companyUrl,
            job_url: jobUrl,
          },
        },
      ];

      candidates.push({
        company_name: companyName,
        company_domain: domain,
        careers_url: atsUrl ? normalizeUrl(atsUrl) : (normalizeUrl(companyUrl) ?? null),
        source_url: sourceUrl,
        detected_ats: detectedAts,
        ats_url: atsUrl ? normalizeUrl(atsUrl) : null,
        board_identifier: boardIdentifier,
        job_evidence: jobEvidence,
        discovered_from: this.name,
        discovered_at: now,
        evidence,
        confidence: detectedAts ? 0.90 : 0.75,
      });
    }

    return candidates;
  }

  /**
   * Extracts unique company slugs from an ATS sitemap XML string.
   */
  public extractSlugsFromSitemap(xml: string, target: AtsTargetConfig): string[] {
    const slugs = new Set<string>();
    const locRegex = /<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi;
    let match: RegExpExecArray | null;

    while ((match = locRegex.exec(xml)) !== null) {
      const url = match[1];
      if (!url) continue;

      const slugMatch = target.slugPattern.exec(url);
      if (slugMatch && slugMatch[1]) {
        const slug = slugMatch[1].toLowerCase().trim();
        if (slug.length > 1 && !EXCLUDED_SLUGS.has(slug) && !slug.endsWith('.xml')) {
          slugs.add(slug);
        }
      }
    }

    return Array.from(slugs);
  }

  /**
   * Constructs a DiscoveryCandidate from an ATS slug.
   */
  public async buildCandidate(slug: string, target: AtsTargetConfig): Promise<DiscoveryCandidate | null> {
    const boardUrl = target.boardUrlTemplate(slug);
    const companyName = this.humanizeSlug(slug);
    
    // We must resolve the actual domain instead of guessing \`\${slug}.com\`
    let domain: string | null = null;
    try {
      const res = await this.httpClient.get<string>(boardUrl, { maxRetries: 0, timeoutMs: 3000 });
      if (res.status >= 200 && res.status < 400 && typeof res.data === 'string') {
        // Look for a link that is NOT an ATS link to find the company website
        const hrefRegex = /href=["'](https?:\/\/(?!boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com)[^"']+)["']/i;
        const match = res.data.match(hrefRegex);
        if (match && match[1]) {
          domain = normalizeDomain(match[1]);
        }
      }
    } catch {
      // Failed to resolve domain
    }

    if (!domain) return null;

    const now = new Date().toISOString();

    const jobEvidence: JobEvidence[] = [
      {
        job_url: boardUrl,
        job_title: 'Active Job Board',
        discovered_at: now,
        source_provider: this.name,
      },
    ];

    const evidence: DiscoveryEvidence[] = [
      {
        provider: this.name,
        timestamp: now,
        evidence_type: 'sitemap_discovery',
        url: target.sitemapUrl,
        metadata: {
          slug,
          ats: target.atsType,
          board_url: boardUrl,
        },
      },
    ];

    return {
      company_name: companyName,
      company_domain: domain,
      careers_url: normalizeUrl(boardUrl),
      source_url: target.sitemapUrl,
      detected_ats: target.atsType,
      ats_url: normalizeUrl(boardUrl),
      board_identifier: slug,
      job_evidence: jobEvidence,
      discovered_from: this.name,
      discovered_at: now,
      evidence,
      confidence: 0.85,
    };
  }

  private humanizeSlug(slug: string): string {
    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
  }
}
