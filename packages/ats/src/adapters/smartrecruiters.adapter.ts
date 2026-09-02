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
import { URLResolver } from '@jobpulse/url-resolution';
import { JobValidator, type JobValidationResult } from '@jobpulse/validation';
import { httpClient, logger } from '@jobpulse/shared';
import type { ATSAdapter } from '../adapter.interface.js';

export interface SmartRecruitersLocation {
  city?: string;
  region?: string;
  country?: string;
  remote?: boolean;
}

export interface SmartRecruitersPostingItem {
  id: string;
  name: string;
  uuid?: string;
  refNumber?: string;
  releasedDate?: string;
  location?: SmartRecruitersLocation;
  department?: { id?: string; label?: string };
  typeOfEmployment?: { id?: string; label?: string };
  experienceLevel?: { id?: string; label?: string };
  company?: { name?: string; identifier?: string };
}

export interface SmartRecruitersListResponse {
  totalFound: number;
  offset: number;
  limit: number;
  content: SmartRecruitersPostingItem[];
}

export interface SmartRecruitersJobAdSection {
  title?: string;
  text?: string;
}

export interface SmartRecruitersPostingDetail {
  id: string;
  name: string;
  releasedDate?: string;
  location?: SmartRecruitersLocation;
  secondaryLocations?: SmartRecruitersLocation[];
  department?: { id?: string; label?: string };
  typeOfEmployment?: { id?: string; label?: string };
  compensation?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  jobAd?: {
    sections?: {
      companyDescription?: SmartRecruitersJobAdSection;
      jobDescription?: SmartRecruitersJobAdSection;
      qualifications?: SmartRecruitersJobAdSection;
      additionalInformation?: SmartRecruitersJobAdSection;
    };
  };
  applyUrl?: string;
  refNumber?: string;
}

export class SmartRecruitersAdapter implements ATSAdapter {
  public readonly platformSlug = 'smartrecruiters';
  public readonly parserVersion = 'smartrecruiters_v1';

  private static readonly DEFAULT_PAGE_SIZE = 50;
  private static readonly MAX_PAGES = 20; // Up to 1,000 postings per crawl run

  public detect(url: string, html?: string): ATSDetectionResult {
    // 1. Direct URL detection: e.g. jobs.smartrecruiters.com/Visa or smartrecruiters.com/visa
    const directPattern = /jobs\.smartrecruiters\.com\/([^/?#]+)/i;
    const match = url.match(directPattern);

    if (match && match[1] && match[1].toLowerCase() !== 'oneclick') {
      return {
        detected: true,
        atsType: 'smartrecruiters',
        boardIdentifier: match[1].toLowerCase(),
        confidence: 0.99,
        sourceUrl: url,
      };
    }

    // 2. Embedded HTML script detection
    if (html && (html.includes('smartrecruiters.com') || html.includes('smartToken'))) {
      const scriptMatch = html.match(/smartrecruiters\.com\/([^/"&'\s]+)/i);
      if (scriptMatch && scriptMatch[1] && !['oneclick', 'widget', 'css', 'js'].includes(scriptMatch[1].toLowerCase())) {
        return {
          detected: true,
          atsType: 'smartrecruiters',
          boardIdentifier: scriptMatch[1].toLowerCase(),
          confidence: 0.90,
          sourceUrl: url,
        };
      }
    }

    return {
      detected: false,
      atsType: null,
      boardIdentifier: null,
      confidence: 0,
      sourceUrl: url,
    };
  }

  public async validateSource(config: CompanySourceConfig): Promise<SourceValidationResult> {
    const start = Date.now();
    const companyIdentifier = config.sourceIdentifier.toLowerCase().trim();
    const url = `https://api.smartrecruiters.com/v1/companies/${companyIdentifier}/postings?limit=5&offset=0`;

    try {
      const response = await httpClient.get<SmartRecruitersListResponse>(url, { timeoutMs: 15000 });
      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data && Array.isArray(response.data.content)) {
        return {
          isValid: true,
          atsType: 'smartrecruiters',
          boardIdentifier: companyIdentifier,
          jobsDiscoveredCount: typeof response.data.totalFound === 'number' ? response.data.totalFound : response.data.content.length,
          sampleJobTitles: response.data.content.slice(0, 3).map((p) => p.name),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'smartrecruiters',
        boardIdentifier: companyIdentifier,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `SmartRecruiters API returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: any) {
      return {
        isValid: false,
        atsType: 'smartrecruiters',
        boardIdentifier: companyIdentifier,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err.message || 'SmartRecruiters validation request failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const companyIdentifier = companySource.sourceIdentifier.toLowerCase().trim();
    const candidates: JobCandidate[] = [];
    const seenJobIds = new Set<string>();

    let offset = 0;
    const limit = SmartRecruitersAdapter.DEFAULT_PAGE_SIZE;
    let total = Infinity;
    let pageCount = 0;

    while (offset < total && pageCount < SmartRecruitersAdapter.MAX_PAGES) {
      pageCount++;
      const url = `https://api.smartrecruiters.com/v1/companies/${companyIdentifier}/postings?limit=${limit}&offset=${offset}`;

      try {
        const response = await httpClient.get<SmartRecruitersListResponse>(url, { timeoutMs: 15000 });
        if (response.status !== 200 || !response.data || !Array.isArray(response.data.content)) {
          break;
        }

        total = typeof response.data.totalFound === 'number' ? response.data.totalFound : 0;
        const postings = response.data.content;

        if (postings.length === 0) {
          break;
        }

        for (const posting of postings) {
          if (!posting || !posting.id || !posting.name) {
            continue; // Skip malformed item
          }

          const externalJobId = String(posting.id).trim();
          if (seenJobIds.has(externalJobId)) {
            continue; // Deduplicate within crawl
          }
          seenJobIds.add(externalJobId);

          const sourceJobUrl = `https://jobs.smartrecruiters.com/${companyIdentifier}/${externalJobId}`;

          candidates.push({
            sourceId: companySource.sourceId,
            externalJobId,
            discoveryUrl: url,
            sourceJobUrl,
            companyIdentifier,
          });
        }

        offset += postings.length;
      } catch {
        break; // Graceful stop on network/server error
      }
    }

    const isComplete = total === Infinity ? true : candidates.length >= total;
    if (!isComplete && total > 0) {
      logger.warn(`[SmartRecruiters] Incomplete crawl for ${companyIdentifier}: discovered ${candidates.length} of ${total} jobs across ${pageCount} pages (limit/cap reached)`);
    }

    Object.defineProperty(candidates, 'isComplete', {
      value: isComplete,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    return candidates;
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const url = `https://api.smartrecruiters.com/v1/companies/${candidate.companyIdentifier}/postings/${candidate.externalJobId}`;

    const response = await httpClient.get<SmartRecruitersPostingDetail>(url, { timeoutMs: 12000 });
    if (response.status !== 200 || !response.data || !response.data.id || !response.data.name) {
      throw new Error(`SmartRecruiters job detail fetch failed for candidate ${candidate.externalJobId} at ${url} with HTTP ${response.status}`);
    }

    const payload = {
      ...(response.data as unknown as Record<string, unknown>),
      sourceJobUrl: candidate.sourceJobUrl,
    };
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
    const data = rawPayload.payload as unknown as SmartRecruitersPostingDetail;
    const rawTitle = data.name || rawPayload.externalId;

    // Compose description from sections
    const sectionTexts: string[] = [];
    const sectionHtmls: string[] = [];

    if (data.jobAd?.sections) {
      const sections = data.jobAd.sections;
      for (const section of [sections.companyDescription, sections.jobDescription, sections.qualifications, sections.additionalInformation]) {
        if (section?.text) {
          sectionHtmls.push(section.text);
          const cleanText = section.text
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<li[^>]*>/gi, '• ')
            .replace(/<\/li>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
          if (cleanText) {
            sectionTexts.push(cleanText);
          }
        }
      }
    }

    const rawDescription = sectionTexts.length > 0 ? sectionTexts.join('\n\n') : rawTitle;
    const rawDescriptionHtml = sectionHtmls.length > 0 ? sectionHtmls.join('<br/><br/>') : null;

    // Collect locations
    const locations: string[] = [];
    const formatLocation = (loc?: SmartRecruitersLocation) => {
      if (!loc) return null;
      const parts = [loc.city, loc.region, loc.country].filter(Boolean);
      return parts.length > 0 ? parts.join(', ') : null;
    };

    const primaryLoc = formatLocation(data.location);
    if (primaryLoc) locations.push(primaryLoc);

    if (Array.isArray(data.secondaryLocations)) {
      for (const sec of data.secondaryLocations) {
        const secLoc = formatLocation(sec);
        if (secLoc && !locations.includes(secLoc)) {
          locations.push(secLoc);
        }
      }
    }

    if (locations.length === 0) {
      locations.push('Unspecified');
    }

    const isRemote = data.location?.remote === true;
    if (isRemote && !locations.some((l) => l.toLowerCase().includes('remote'))) {
      locations.push('Remote');
    }

    // Salary / Compensation
    let rawSalary: string | null = null;
    if (data.compensation?.min || data.compensation?.max) {
      const cur = data.compensation.currency || 'USD';
      if (data.compensation.min && data.compensation.max) {
        rawSalary = `${cur} ${data.compensation.min} - ${data.compensation.max}`;
      } else if (data.compensation.min) {
        rawSalary = `${cur} ${data.compensation.min}+`;
      } else if (data.compensation.max) {
        rawSalary = `${cur} up to ${data.compensation.max}`;
      }
    }

    const sourceJobUrl = (rawPayload.payload['sourceJobUrl'] as string) || data.applyUrl || `https://jobs.smartrecruiters.com/${data.id}`;
    const rawApplyUrl = data.applyUrl || sourceJobUrl;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId: rawPayload.externalId,
      rawTitle,
      rawDescription,
      rawDescriptionHtml,
      rawLocations: locations,
      rawSalary,
      rawEmploymentType: data.typeOfEmployment?.label || null,
      rawWorkplaceType: isRemote ? 'remote' : null,
      rawPostedAt: data.releasedDate || null,
      rawApplyUrl,
      sourceJobUrl,
      discoveryUrl: sourceJobUrl,
      sourceMetadata: {
        department: data.department?.label,
        refNumber: data.refNumber,
        isRemote,
      },
    };
  }

  public async normalize(rawJob: RawJob, payloadHash: string): Promise<NormalizedJob> {
    const candidates = [];
    if (rawJob.rawApplyUrl) {
      candidates.push({
        url: rawJob.rawApplyUrl,
        sourceType: 'explicit_ats_form' as const,
        confidence: 0.95,
      });
    }
    if (rawJob.sourceJobUrl) {
      candidates.push({
        url: rawJob.sourceJobUrl,
        sourceType: 'fallback_source' as const,
        confidence: 0.75,
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
    if (raw.rawApplyUrl && raw.rawApplyUrl.startsWith('http')) {
      return raw.rawApplyUrl;
    }
    return raw.sourceJobUrl || candidate.sourceJobUrl || '';
  }
}
