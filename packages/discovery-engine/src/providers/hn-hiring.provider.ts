import { HttpClient } from '@jobpulse/shared';
import { logger } from '@jobpulse/shared';
import { ATSDetector } from '@jobpulse/ats';
import { DiscoveryCandidate, JobEvidence, DiscoveryEvidence } from '../types.js';
import { DiscoveryOptions, DiscoveryProvider } from './provider.interface.js';
import { normalizeDomain, normalizeUrl } from '../normalization.js';

interface AlgoliaHit {
  objectID: string;
  title?: string;
  created_at: string;
  comment_text?: string;
  story_id?: number;
  url?: string;
}

interface AlgoliaResponse {
  hits: AlgoliaHit[];
  nbHits?: number;
  page?: number;
  nbPages?: number;
}

export class HackerNewsHiringProvider implements DiscoveryProvider {
  public readonly name = 'hn-hiring';
  private readonly httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient || new HttpClient({ timeoutMs: 15000 });
  }

  public async discover(options: DiscoveryOptions = {}): Promise<DiscoveryCandidate[]> {
    const candidates: DiscoveryCandidate[] = [];
    const limit = options.limit ?? 50;

    try {
      // 1. Find recent "Who is hiring" stories from Ask HN
      const storySearchUrl =
        'https://hn.algolia.com/api/v1/search_by_date?query=Ask+HN+Who+is+hiring&tags=story&hitsPerPage=10';
      const storyRes = await this.httpClient.get<AlgoliaResponse>(storySearchUrl);
      const stories = (storyRes.data?.hits || []).filter((h) =>
        /who\s+is\s+hiring/i.test(h.title || '')
      );

      if (stories.length === 0) {
        logger.warn('[HackerNewsHiringProvider] No "Who is hiring" stories found on HN Algolia API.');
        return candidates;
      }

      // Take latest 1 or 2 threads
      const targetStories = stories.slice(0, 2);

      for (const story of targetStories) {
        if (candidates.length >= limit) break;

        const hitsPerPage = Math.min(100, limit - candidates.length + 20);
        const commentsUrl = `https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${story.objectID}&hitsPerPage=${hitsPerPage}`;
        const commentsRes = await this.httpClient.get<AlgoliaResponse>(commentsUrl);
        const hits = commentsRes.data?.hits || [];

        for (const hit of hits) {
          if (candidates.length >= limit) break;
          if (!hit.comment_text) continue;

          const candidate = this.parseComment(hit);
          if (candidate) {
            candidates.push(candidate);
          }
        }
      }
    } catch (err) {
      logger.error('[HackerNewsHiringProvider] Error querying Algolia API:', { error: String(err) });
    }

    return candidates;
  }

  /**
   * Parses an HN hiring comment into a DiscoveryCandidate if viable.
   */
  public parseComment(hit: AlgoliaHit): DiscoveryCandidate | null {
    const rawText = hit.comment_text;
    if (!rawText || rawText.length < 20) return null;

    // Extract all URLs from comment
    const extractedUrls = this.extractUrls(rawText);
    if (extractedUrls.length === 0) return null;

    // Detect ATS URLs and general company URLs
    let detectedAts: string | null = null;
    let atsUrl: string | null = null;
    let boardIdentifier: string | null = null;
    let careersUrl: string | null = null;
    let primaryCompanyDomain: string | null = null;

    for (const url of extractedUrls) {
      const atsResult = ATSDetector.detect(url);
      if (atsResult.detected && atsResult.atsType) {
        detectedAts = atsResult.atsType;
        atsUrl = atsResult.sourceUrl || url;
        boardIdentifier = atsResult.boardIdentifier;
      } else {
        const domain = normalizeDomain(url);
        // Exclude generic social/hosting domains
        if (domain && !this.isGenericDomain(domain)) {
          if (!primaryCompanyDomain) {
            primaryCompanyDomain = domain;
          }
          if (/careers|jobs|positions|openings/i.test(url)) {
            careersUrl = url;
          }
        }
      }
    }

    // If no primary company domain found from plain links, but ATS found:
    if (!primaryCompanyDomain && boardIdentifier) {
      primaryCompanyDomain = `${boardIdentifier}.com`;
    }

    if (!primaryCompanyDomain) return null;

    // Extract company name and roles
    const { companyName, jobTitle } = this.extractNameAndJobTitle(rawText, primaryCompanyDomain);
    const commentItemUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;

    const jobEvidence: JobEvidence[] = [];
    if (atsUrl) {
      jobEvidence.push({
        job_url: atsUrl,
        job_title: jobTitle || 'Open Positions',
        discovered_at: hit.created_at || new Date().toISOString(),
        source_provider: this.name,
      });
    } else if (careersUrl) {
      jobEvidence.push({
        job_url: careersUrl,
        job_title: jobTitle || 'Open Positions',
        discovered_at: hit.created_at || new Date().toISOString(),
        source_provider: this.name,
      });
    }

    const structuredEvidence: DiscoveryEvidence[] = [
      {
        provider: this.name,
        timestamp: hit.created_at || new Date().toISOString(),
        evidence_type: 'hn_who_is_hiring',
        url: commentItemUrl,
        metadata: {
          hn_item_id: hit.objectID,
          story_id: hit.story_id,
        },
      },
    ];

    let confidence = 0.65;
    if (detectedAts) confidence += 0.25;
    if (careersUrl) confidence += 0.10;

    return {
      company_name: companyName,
      company_domain: primaryCompanyDomain,
      careers_url: careersUrl ? normalizeUrl(careersUrl) : (atsUrl ? normalizeUrl(atsUrl) : null),
      source_url: commentItemUrl,
      detected_ats: detectedAts,
      ats_url: atsUrl ? normalizeUrl(atsUrl) : null,
      board_identifier: boardIdentifier,
      job_evidence: jobEvidence,
      discovered_from: this.name,
      discovered_at: hit.created_at || new Date().toISOString(),
      evidence: structuredEvidence,
      confidence: Math.min(1.0, confidence),
    };
  }

  private decodeHtmlEntities(str: string): string {
    return str
      .replace(/&#x2F;/gi, '/')
      .replace(/&#47;/gi, '/')
      .replace(/&#x27;/gi, "'")
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
  }

  private extractUrls(html: string): string[] {
    const decoded = this.decodeHtmlEntities(html);
    const urls: string[] = [];
    // 1. Matches from href attributes
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = hrefRegex.exec(decoded)) !== null) {
      if (match[1] && (match[1].startsWith('http://') || match[1].startsWith('https://'))) {
        urls.push(match[1].replace(/[.,;:)>\]]+$/, ''));
      }
    }

    // 2. Matches from plaintext URLs
    const plainRegex = /https?:\/\/[^\s<>"')]+/gi;
    while ((match = plainRegex.exec(decoded)) !== null) {
      if (match[0]) {
        urls.push(match[0].replace(/[.,;:)>\]]+$/, ''));
      }
    }

    return Array.from(new Set(urls));
  }

  private extractNameAndJobTitle(
    text: string,
    domain: string
  ): { companyName: string; jobTitle: string | null } {
    const decoded = this.decodeHtmlEntities(text);
    // Strip HTML tags for clean text analysis
    const clean = decoded
      .replace(/<[^>]+>/g, ' ')
      .trim();

    // First line or paragraph
    const firstLine = clean.split('\n')[0] || clean;
    const parts = firstLine.split(/[|–—]/).map((p) => p.trim()).filter(Boolean);

    let companyName = parts[0] || '';
    // Strip markdown formatting if any
    companyName = companyName.replace(/[*_#]/g, '').trim();

    // If company name looks too long or invalid, fallback to domain prefix
    if (!companyName || companyName.length > 50 || /https?:\/\//i.test(companyName)) {
      const domainPrefix = domain.split('.')[0] || 'Unknown';
      companyName = domainPrefix.charAt(0).toUpperCase() + domainPrefix.slice(1);
    }

    // Attempt to extract job title from subsequent segments
    let jobTitle: string | null = null;
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]!;
      if (
        /engineer|developer|designer|architect|lead|manager|analyst|intern|vp|director|scientist/i.test(
          part
        )
      ) {
        jobTitle = part;
        break;
      }
    }

    return { companyName, jobTitle };
  }

  private isGenericDomain(domain: string): boolean {
    const generic = [
      'ycombinator.com',
      'github.com',
      'google.com',
      'twitter.com',
      'x.com',
      'linkedin.com',
      'youtube.com',
      'medium.com',
      'substack.com',
      'bit.ly',
      't.co',
      'wikipedia.org',
    ];
    return generic.includes(domain.toLowerCase());
  }
}
