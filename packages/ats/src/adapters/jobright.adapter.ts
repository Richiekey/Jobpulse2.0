import type {
  JobCandidate,
  RawJobPayload,
  RawJob,
  NormalizedJob,
  CompanySourceConfig,
  SourceValidationResult,
  ATSDetectionResult,
} from '@jobpulse/domain';
import { Normalizer, DeduplicationEngine } from '@jobpulse/domain';
import { URLResolver, type UrlCandidate } from '@jobpulse/url-resolution';
import { JobValidator, type JobValidationResult } from '@jobpulse/validation';
import { httpClient, logger } from '@jobpulse/shared';
import type { ATSAdapter } from '../adapter.interface.js';

export interface JobrightParsedRow {
  id?: string | number;
  externalJobId?: string;
  title: string;
  companyName?: string;
  company_name?: string;
  companyWebsite?: string;
  location?: string;
  locations?: string[];
  workplaceType?: 'remote' | 'hybrid' | 'onsite' | 'unspecified';
  workplace_type?: string;
  employment_type?: string;
  postedAt?: string;
  posted_at?: string;
  sourceJobUrl?: string;
  source_job_url?: string;
  original_apply_url?: string;
  ats_url?: string;
  embedded_urls?: string[];
  discoveryUrl?: string;
  repository?: string;
  salary?: string;
  description?: string;
  [key: string]: unknown;
}

export class JobrightAdapter implements ATSAdapter {
  public readonly platformSlug = 'jobright';
  public readonly parserVersion = 'jobright_v2';

  public detect(url: string): ATSDetectionResult {
    const ghPattern = /(?:github\.com|raw\.githubusercontent\.com)\/jobright-ai\/([^/?#]+)/i;
    const ghMatch = url.match(ghPattern);

    if (ghMatch && ghMatch[1]) {
      return {
        detected: true,
        atsType: 'jobright',
        boardIdentifier: ghMatch[1],
        confidence: 0.99,
        sourceUrl: url,
      };
    }

    const jobPattern = /jobright\.ai\/jobs\/(?:info\/)?([a-zA-Z0-9_-]+)/i;
    const match = url.match(jobPattern);
    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'jobright',
        boardIdentifier: match[1],
        confidence: 0.95,
        sourceUrl: url,
      };
    }

    return {
      detected: false,
      atsType: null,
      boardIdentifier: null,
      confidence: 0,
      sourceUrl: url,
    };
  }

  /**
   * Fetches the raw README.md for a given repository with master -> main fallback.
   */
  private async fetchReadmeContent(repoName: string): Promise<{ content: string; url: string; branch: string }> {
    const cleanRepo = repoName.trim().replace(/^jobright-ai\//i, '');
    const masterUrl = `https://raw.githubusercontent.com/jobright-ai/${cleanRepo}/master/README.md`;

    try {
      const res = await httpClient.get<string>(masterUrl, {
        timeoutMs: 15000,
        maxSizeBytes: 20 * 1024 * 1024,
      });

      if (res.status === 200 && typeof res.data === 'string' && res.data.length > 0) {
        return { content: res.data, url: masterUrl, branch: 'master' };
      }
    } catch {
      // Fallback to main branch
    }

    const mainUrl = `https://raw.githubusercontent.com/jobright-ai/${cleanRepo}/main/README.md`;
    try {
      const mainRes = await httpClient.get<string>(mainUrl, {
        timeoutMs: 15000,
        maxSizeBytes: 20 * 1024 * 1024,
      });

      if (mainRes.status === 200 && typeof mainRes.data === 'string' && mainRes.data.length > 0) {
        return { content: mainRes.data, url: mainUrl, branch: 'main' };
      }
    } catch {
      // Fall through to error
    }

    throw new Error(`Failed to fetch Jobright README for repository "${cleanRepo}" from master or main branch`);
  }

  public async validateSource(config: CompanySourceConfig): Promise<SourceValidationResult> {
    const start = Date.now();
    const repo = config.sourceIdentifier;

    try {
      const { content } = await this.fetchReadmeContent(repo);
      const parseResult = this.parseMarkdownTable(content, repo, new Date());
      const durationMs = Date.now() - start;

      return {
        isValid: parseResult.candidates.length > 0,
        atsType: 'jobright',
        boardIdentifier: repo,
        jobsDiscoveredCount: parseResult.candidates.length,
        sampleJobTitles: parseResult.candidates.slice(0, 3).map((c) => c.title),
        durationMs,
      };
    } catch (err: any) {
      return {
        isValid: false,
        atsType: 'jobright',
        boardIdentifier: repo,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err.message || 'Validation request failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const repo = companySource.sourceIdentifier;
    const start = Date.now();

    logger.info('jobright_repository_fetch_started', {
      repository: repo,
      sourceId: companySource.sourceId,
    });

    let readmeData: { content: string; url: string; branch: string };
    try {
      readmeData = await this.fetchReadmeContent(repo);
      logger.info('jobright_repository_fetch_succeeded', {
        repository: repo,
        branch: readmeData.branch,
        bytes: readmeData.content.length,
        durationMs: Date.now() - start,
      });
    } catch (err: any) {
      logger.error('jobright_repository_fetch_failed', {
        repository: repo,
        error: err.message,
        durationMs: Date.now() - start,
      });
      throw err;
    }

    const { candidates, rowsParsed, rowsRejected } = this.parseMarkdownTable(
      readmeData.content,
      repo,
      new Date(),
      readmeData.url
    );

    logger.info('jobright_candidates_created', {
      repository: repo,
      rowsParsed,
      rowsRejected,
      discoveredCount: candidates.length,
      sourceId: companySource.sourceId,
    });

    return candidates.map((c) => ({
      sourceId: companySource.sourceId,
      externalJobId: c.externalJobId || String(c.id),
      discoveryUrl: readmeData.url,
      sourceJobUrl: c.sourceJobUrl || c.source_job_url || `https://jobright.ai/jobs/info/${c.externalJobId}`,
      companyIdentifier: repo,
      payload: c as unknown as Record<string, unknown>,
    }));
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    // Strictly require candidate payload from GitHub repository discovery — 0 network requests
    if (!candidate.payload || typeof candidate.payload !== 'object' || Object.keys(candidate.payload).length === 0) {
      throw new Error(
        `Jobright fetch failed: Candidate ${candidate.externalJobId} is missing candidate.payload. ` +
        `Jobright adapter strictly requires candidate payload from GitHub discovery with 0 network requests.`
      );
    }

    const payload = { ...candidate.payload };
    if (!payload['discoveryUrl'] && candidate.discoveryUrl) {
      payload['discoveryUrl'] = candidate.discoveryUrl;
    }
    if (!payload['sourceJobUrl'] && candidate.sourceJobUrl) {
      payload['sourceJobUrl'] = candidate.sourceJobUrl;
    }
    if (!payload['externalJobId'] && candidate.externalJobId) {
      payload['externalJobId'] = candidate.externalJobId;
    }

    const payloadHash = DeduplicationEngine.hashPayload(payload);

    return {
      sourceId: candidate.sourceId,
      externalId: candidate.externalJobId,
      payload,
      payloadHash,
      parserVersion: this.parserVersion,
      fetchedAt: new Date().toISOString(),
    };
  }

  public async parse(rawPayload: RawJobPayload): Promise<RawJob> {
    const data = rawPayload.payload as unknown as JobrightParsedRow;

    const externalId = (data.externalJobId || data.id || '') as string;
    const title = (data.title || 'Untitled Role') as string;
    const company = (data.companyName || data.company_name || 'Unknown Employer') as string;
    const location = data.location
      ? [data.location as string]
      : Array.isArray(data.locations)
        ? (data.locations as string[])
        : [];
    const description =
      (data.description as string) ||
      `${title} at ${company}${location.length > 0 ? ` in ${location.join(', ')}` : ''}. Discovered via Jobright collection (${(data.repository as string) || 'Tech'}).`;

    const rawPostedAt = (data.postedAt || data.posted_at || new Date().toISOString()) as string;
    const rawEmploymentType = (data.workplaceType || data.workplace_type || 'full_time') as string;
    const rawWorkplaceType = (data.workplaceType || data.workplace_type || 'unspecified') as string;
    const rawApplyUrl = (data.original_apply_url || data.ats_url || undefined) as string | undefined;
    const sourceJobUrl = (data.sourceJobUrl || data.source_job_url || '') as string;
    const discoveryUrl = (data.discoveryUrl || (rawPayload.payload['discoveryUrl'] as string) || '') as string;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId: externalId,
      rawTitle: title,
      rawCompany: company,
      rawDescription: description,
      rawDescriptionHtml: null,
      rawLocations: location,
      rawSalary: (data.salary as string) || undefined,
      rawPostedAt,
      rawEmploymentType,
      rawWorkplaceType,
      rawApplyUrl,
      sourceJobUrl,
      discoveryUrl,
      sourceMetadata: {
        companyName: company,
        companyWebsite: data.companyWebsite,
        repository: data.repository,
        originalSource: 'jobright_github_markdown',
        original_apply_url: data.original_apply_url,
        ats_url: data.ats_url,
        embedded_urls: data.embedded_urls,
      },
    };
  }

  public async normalize(rawJob: RawJob, payloadHash: string): Promise<NormalizedJob> {
    const candidates: UrlCandidate[] = [];

    // 1. Explicit employer application URL (highest confidence)
    if (rawJob.sourceMetadata?.['original_apply_url']) {
      candidates.push({
        url: rawJob.sourceMetadata['original_apply_url'] as string,
        sourceType: 'explicit_employer_apply',
        suggestedConfidence: 0.98,
      });
    }

    // 2. Explicit direct ATS form / URL
    if (rawJob.sourceMetadata?.['ats_url']) {
      candidates.push({
        url: rawJob.sourceMetadata['ats_url'] as string,
        sourceType: 'explicit_ats_form',
        suggestedConfidence: 0.95,
      });
    }

    // 3. Embedded URLs found in Markdown row
    if (Array.isArray(rawJob.sourceMetadata?.['embedded_urls'])) {
      for (const u of rawJob.sourceMetadata['embedded_urls']) {
        if (typeof u === 'string' && u) {
          const isAts = URLResolver.isDirectAtsUrl(u);
          candidates.push({
            url: u,
            sourceType: isAts ? 'known_ats_url' : 'other_valid_url',
            suggestedConfidence: isAts ? 0.75 : 0.60,
          });
        }
      }
    }

    // 4. Raw apply URL from parser if not already included
    if (rawJob.rawApplyUrl && !rawJob.sourceMetadata?.['original_apply_url'] && !rawJob.sourceMetadata?.['ats_url']) {
      const isAts = URLResolver.isDirectAtsUrl(rawJob.rawApplyUrl);
      candidates.push({
        url: rawJob.rawApplyUrl,
        sourceType: isAts ? 'explicit_ats_form' : 'other_valid_url',
        suggestedConfidence: isAts ? 0.95 : 0.60,
      });
    }

    // 5. Jobright Fallback (Strictly low confidence 0.40 - fallback only)
    if (rawJob.sourceJobUrl) {
      candidates.push({
        url: rawJob.sourceJobUrl,
        sourceType: 'fallback_source',
        suggestedConfidence: 0.40,
      });
    }

    const resolvedUrls = URLResolver.resolve({
      discoveryUrl: rawJob.discoveryUrl,
      sourceJobUrl: rawJob.sourceJobUrl,
      candidates,
    });

    return Normalizer.normalize(rawJob, resolvedUrls, payloadHash);
  }

  public validate(job: NormalizedJob): JobValidationResult {
    return JobValidator.validate(job);
  }

  public async resolveApplicationUrl(candidate: JobCandidate, raw: RawJob): Promise<string> {
    // INVARIANT: Never synthesize application URLs.
    if (raw.rawApplyUrl) return raw.rawApplyUrl;
    return raw.sourceJobUrl || candidate.sourceJobUrl || '';
  }

  /**
   * Robust Markdown table parser supporting both New Grad and H1B Jobright table layouts.
   */
  public parseMarkdownTable(
    markdownText: string,
    repoName: string,
    crawlDate: Date = new Date(),
    discoveryUrl: string = ''
  ): { candidates: JobrightParsedRow[]; rowsParsed: number; rowsRejected: number } {
    const lines = markdownText.split(/\r?\n/);
    const candidates: JobrightParsedRow[] = [];
    const seenJobIds = new Set<string>();

    let lastCompany = '';
    let lastCompanyWebsite = '';
    let headerIndices: {
      company: number;
      title: number;
      location: number;
      workplace: number;
      link: number;
      date: number;
    } | null = null;

    let rowsParsed = 0;
    let rowsRejected = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('|') || !line.endsWith('|')) continue;

      const cells = line.split('|').map((c) => c.trim()).slice(1, -1);
      if (cells.length < 3) continue;

      const lowerCells = cells.map((c) => c.toLowerCase());

      // Header row detection
      if (lowerCells.some((c) => c.includes('company')) && lowerCells.some((c) => c.includes('title') || c.includes('job title'))) {
        headerIndices = {
          company: lowerCells.findIndex((c) => c.includes('company')),
          title: lowerCells.findIndex((c) => c.includes('title')),
          location: lowerCells.findIndex((c) => c.includes('location')),
          workplace: lowerCells.findIndex((c) => c.includes('work model') || c.includes('workplace') || c.includes('remote')),
          link: lowerCells.findIndex((c) => c.includes('link') || c.includes('apply')),
          date: lowerCells.findIndex((c) => c.includes('date')),
        };
        continue;
      }

      // Skip markdown divider row (| --- | --- |)
      if (cells.every((c) => /^[-: ]+$/.test(c))) continue;

      if (!headerIndices) {
        headerIndices = {
          company: 0,
          title: 1,
          location: 2,
          workplace: 3,
          link: -1,
          date: 4,
        };
      }

      // Extract Jobright Link and External ID (handle query parameters like ?utm_campaign=...)
      const allTextInRow = cells.join(' ');
      const linkMatch = allTextInRow.match(/https:\/\/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/);

      if (!linkMatch || !linkMatch[1]) {
        rowsRejected++;
        continue;
      }

      const externalJobId = linkMatch[1];
      const sourceJobUrl = `https://jobright.ai/jobs/info/${externalJobId}`;

      // Prevent duplicates within the same README file
      if (seenJobIds.has(externalJobId)) {
        continue;
      }
      seenJobIds.add(externalJobId);

      // Parse Company with inheritance support (↳)
      const rawCompanyCell = cells[headerIndices.company] || '';
      let companyName = '';
      let companyWebsite = '';

      if (rawCompanyCell.includes('↳')) {
        companyName = lastCompany;
        companyWebsite = lastCompanyWebsite;
      } else {
        const compLinkMatch = rawCompanyCell.match(/\[(.*?)\]\((.*?)\)/);
        if (compLinkMatch && compLinkMatch[1]) {
          companyName = compLinkMatch[1].replace(/[*_]/g, '').trim();
          companyWebsite = compLinkMatch[2] ? compLinkMatch[2].trim() : '';
        } else {
          companyName = rawCompanyCell.replace(/[*_]/g, '').trim();
        }

        if (companyName && companyName !== '↳') {
          lastCompany = companyName;
          lastCompanyWebsite = companyWebsite;
        } else {
          companyName = lastCompany;
          companyWebsite = lastCompanyWebsite;
        }
      }

      if (!companyName || companyName === '↳') {
        rowsRejected++;
        continue;
      }

      // Parse Title
      const rawTitleCell = cells[headerIndices.title] || '';
      let title = '';
      const titleLinkMatch = rawTitleCell.match(/\[(.*?)\]/);
      if (titleLinkMatch && titleLinkMatch[1]) {
        title = titleLinkMatch[1].replace(/[*_]/g, '').trim();
      } else {
        title = rawTitleCell.replace(/[*_]/g, '').trim();
      }
      title = title.replace(/\s+/g, ' ').trim();

      if (!title) {
        rowsRejected++;
        continue;
      }

      // Parse Location
      const rawLocationCell = headerIndices.location !== -1 && cells[headerIndices.location] ? cells[headerIndices.location]! : '';
      const location = rawLocationCell.replace(/[*_]/g, '').trim();

      // Normalize Workplace Type
      let workplaceType: 'remote' | 'hybrid' | 'onsite' | 'unspecified' = 'unspecified';
      const rawWorkplaceCell = headerIndices.workplace !== -1 && cells[headerIndices.workplace] ? cells[headerIndices.workplace]! : '';
      const wpLower = `${rawWorkplaceCell} ${location} ${title}`.toLowerCase();
      if (wpLower.includes('remote')) {
        workplaceType = 'remote';
      } else if (wpLower.includes('hybrid')) {
        workplaceType = 'hybrid';
      } else if (wpLower.includes('on site') || wpLower.includes('on-site') || wpLower.includes('onsite')) {
        workplaceType = 'onsite';
      }

      // Parse Posted Date (relative to crawl date with rollover support)
      const rawDateCell = headerIndices.date !== -1 && cells[headerIndices.date] ? cells[headerIndices.date]! : '';
      const postedAt = this.parseDate(rawDateCell, crawlDate);

      // Extract all external URLs and decode Markdown links across all cells
      const rowMarkdownLinks: Array<{ text: string; url: string }> = [];
      const markdownRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
      for (const cell of cells) {
        let match: RegExpExecArray | null;
        while ((match = markdownRegex.exec(cell)) !== null) {
          rowMarkdownLinks.push({ text: match[1]!.trim(), url: match[2]!.trim() });
        }
      }

      // Extract bare HTTPS URLs from the row
      const bareUrls: string[] = [];
      const bareUrlRegex = /https?:\/\/[^\s)\]>"',]+/g;
      for (const cell of cells) {
        let match: RegExpExecArray | null;
        while ((match = bareUrlRegex.exec(cell)) !== null) {
          const clean = match[0].replace(/[.,;:!?]+$/, '');
          if (!clean.includes('jobright.ai/jobs/info') && clean !== companyWebsite) {
            bareUrls.push(clean);
          }
        }
      }

      let explicitApplyUrl: string | undefined;
      let directAtsUrl: string | undefined;
      const otherEmbeddedUrls: string[] = [];

      // Evaluate markdown links for explicit apply links and ATS destinations
      for (const ml of rowMarkdownLinks) {
        if (ml.url.includes('jobright.ai/jobs/info') || ml.url === companyWebsite) {
          continue;
        }

        const isAts = URLResolver.isDirectAtsUrl(ml.url);
        const textLower = ml.text.toLowerCase();
        const isApplyText = textLower.includes('apply') || textLower.includes('application') || textLower.includes('apply now');

        if (isApplyText && isAts && !explicitApplyUrl) {
          explicitApplyUrl = ml.url;
        } else if (isAts && !directAtsUrl) {
          directAtsUrl = ml.url;
        } else {
          otherEmbeddedUrls.push(ml.url);
        }
      }

      // Evaluate bare URLs
      for (const bu of bareUrls) {
        if (bu === explicitApplyUrl || bu === directAtsUrl || otherEmbeddedUrls.includes(bu)) {
          continue;
        }
        const isAts = URLResolver.isDirectAtsUrl(bu);
        if (isAts && !directAtsUrl && !explicitApplyUrl) {
          directAtsUrl = bu;
        } else {
          otherEmbeddedUrls.push(bu);
        }
      }

      candidates.push({
        id: externalJobId,
        externalJobId,
        title,
        companyName,
        company_name: companyName,
        companyWebsite,
        location,
        workplaceType,
        postedAt,
        sourceJobUrl,
        source_job_url: sourceJobUrl,
        discoveryUrl,
        repository: repoName,
        original_apply_url: explicitApplyUrl,
        ats_url: directAtsUrl,
        embedded_urls: otherEmbeddedUrls.length > 0 ? otherEmbeddedUrls : undefined,
      });

      rowsParsed++;
    }

    return { candidates, rowsParsed, rowsRejected };
  }

  /**
   * Parses flexible date strings (e.g. "Sep 03", "2026-05-06") relative to crawl time.
   */
  public parseDate(rawDate: string, crawlDate: Date = new Date()): string {
    const clean = rawDate.replace(/[*_]/g, '').trim();
    if (!clean) return crawlDate.toISOString();

    // ISO format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      const d = new Date(`${clean}T00:00:00Z`);
      if (!isNaN(d.getTime())) return d.toISOString();
    }

    // Month Day format: "Sep 03", "Sep 3", "August 15"
    const monthDayMatch = clean.match(/^([a-zA-Z]+)\s+(\d{1,2})$/);
    if (monthDayMatch && monthDayMatch[1] && monthDayMatch[2]) {
      const monthStr = monthDayMatch[1].toLowerCase();
      const day = parseInt(monthDayMatch[2], 10);
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const mIdx = months.findIndex((m) => monthStr.startsWith(m));

      if (mIdx !== -1) {
        let year = crawlDate.getUTCFullYear();
        // Year rollover: if crawl date is early in year (Jan/Feb) and posting date is Nov/Dec
        if (crawlDate.getUTCMonth() < 2 && mIdx > 9) {
          year -= 1;
        }
        const d = new Date(Date.UTC(year, mIdx, day, 12, 0, 0));
        if (!isNaN(d.getTime())) return d.toISOString();
      }
    }

    return crawlDate.toISOString();
  }
}
