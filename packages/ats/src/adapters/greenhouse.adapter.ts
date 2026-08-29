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
import { httpClient } from '@jobpulse/shared';
import type { ATSAdapter } from '../adapter.interface.js';

interface GreenhouseOffice {
  id: number;
  name: string;
  location?: string;
}

interface GreenhouseDepartment {
  id: number;
  name: string;
  parent_id?: number | null;
  child_ids?: number[];
}

interface GreenhouseJobListing {
  id: number;
  title: string;
  updated_at: string;
  absolute_url: string;
  location?: { name: string };
  content?: string;
  departments?: GreenhouseDepartment[];
  offices?: GreenhouseOffice[];
  metadata?: Array<{
    id: number;
    name: string;
    value: string | string[] | null;
    value_type: string;
  }>;
}

interface GreenhouseBoardResponse {
  jobs: GreenhouseJobListing[];
}

export class GreenhouseAdapter implements ATSAdapter {
  public readonly platformSlug = 'greenhouse';
  public readonly parserVersion = 'greenhouse_v2';

  public detect(url: string, html?: string): ATSDetectionResult {
    // 1. Direct URL pattern
    const urlPattern = /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board(?:\.js)?\?for=)?([^/?#&\s]+)/i;
    const match = url.match(urlPattern);

    if (match && match[1] && match[1].toLowerCase() !== 'embed') {
      return {
        detected: true,
        atsType: 'greenhouse',
        boardIdentifier: match[1].toLowerCase(),
        confidence: 0.99,
        sourceUrl: url,
      };
    }

    // 2. Embedded HTML script detection
    if (html && (html.includes('greenhouse.io') || html.includes('grnh.se'))) {
      const scriptEmbedMatch = html.match(/boards\.greenhouse\.io\/embed\/job_board(?:\.js)?\?for=([^"&'\s]+)/i);
      if (scriptEmbedMatch && scriptEmbedMatch[1] && scriptEmbedMatch[1].toLowerCase() !== 'embed') {
        return {
          detected: true,
          atsType: 'greenhouse',
          boardIdentifier: scriptEmbedMatch[1].toLowerCase(),
          confidence: 0.90,
          sourceUrl: url,
        };
      }

      const genericMatch = html.match(/boards\.greenhouse\.io\/([^/"&'\s]+)/i);
      if (genericMatch && genericMatch[1] && genericMatch[1].toLowerCase() !== 'embed') {
        return {
          detected: true,
          atsType: 'greenhouse',
          boardIdentifier: genericMatch[1].toLowerCase(),
          confidence: 0.70,
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
    const boardToken = config.sourceIdentifier;
    const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=false`;

    try {
      const response = await httpClient.get<GreenhouseBoardResponse>(url, { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data && Array.isArray(response.data.jobs)) {
        return {
          isValid: true,
          atsType: 'greenhouse',
          boardIdentifier: boardToken,
          jobsDiscoveredCount: response.data.jobs.length,
          sampleJobTitles: response.data.jobs.slice(0, 3).map((j) => j.title),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'greenhouse',
        boardIdentifier: boardToken,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `Greenhouse returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: any) {
      return {
        isValid: false,
        atsType: 'greenhouse',
        boardIdentifier: boardToken,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err.message || 'Validation request failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const boardToken = companySource.sourceIdentifier;
    const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;

    const response = await httpClient.get<GreenhouseBoardResponse>(url);
    if (!response.data || !Array.isArray(response.data.jobs)) {
      return [];
    }

    return response.data.jobs.map((job) => ({
      sourceId: companySource.sourceId,
      externalJobId: String(job.id),
      discoveryUrl: url,
      sourceJobUrl: job.absolute_url,
      companyIdentifier: boardToken,
    }));
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${candidate.companyIdentifier}/jobs/${candidate.externalJobId}?questions=true`;
    const response = await httpClient.get<Record<string, unknown>>(url);
    const payload = response.data || {};
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
    const data = rawPayload.payload as unknown as GreenhouseJobListing;

    // Structured multi-location aggregation
    const locationSet = new Set<string>();
    if (data.location?.name && data.location.name.trim()) {
      locationSet.add(data.location.name.trim());
    }
    if (Array.isArray(data.offices)) {
      for (const office of data.offices) {
        if (office.name && office.name.trim()) {
          locationSet.add(office.name.trim());
        }
        if (office.location && office.location.trim()) {
          locationSet.add(office.location.trim());
        }
      }
    }
    const rawLocations = Array.from(locationSet);

    // HTML cleaning and entity decoding
    const rawHtml = data.content || '';
    const cleanText = this.cleanHtmlContent(rawHtml);

    // Workplace type classification
    let rawWorkplaceType: string | undefined = undefined;
    const fullTextSearch = `${data.title || ''} ${rawLocations.join(' ')}`.toLowerCase();
    if (fullTextSearch.includes('remote') || fullTextSearch.includes('anywhere')) {
      rawWorkplaceType = 'remote';
    } else if (fullTextSearch.includes('hybrid')) {
      rawWorkplaceType = 'hybrid';
    } else if (fullTextSearch.includes('on-site') || fullTextSearch.includes('onsite')) {
      rawWorkplaceType = 'onsite';
    }

    // Department extraction
    const departments = data.departments?.map((d) => d.name).filter(Boolean) || [];

    return {
      sourceId: rawPayload.sourceId,
      externalJobId: String(data.id),
      rawTitle: data.title || 'Untitled Role',
      rawDescription: cleanText || 'No description provided.',
      rawDescriptionHtml: rawHtml || null,
      rawLocations,
      rawPostedAt: data.updated_at || new Date().toISOString(),
      rawWorkplaceType,
      // INVARIANT: Never synthesize application URL suffix (#app). Use exact absolute_url provided by ATS.
      rawApplyUrl: data.absolute_url || undefined,
      sourceJobUrl: data.absolute_url || '',
      discoveryUrl: `https://boards-api.greenhouse.io/v1/boards/job/${data.id}`,
      sourceMetadata: {
        departments,
        offices: data.offices?.map((o) => o.name) || [],
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
    // INVARIANT: Never synthesize application URLs.
    if (raw.rawApplyUrl) return raw.rawApplyUrl;
    return raw.sourceJobUrl || candidate.sourceJobUrl || '';
  }

  /**
   * Sanitizes Greenhouse HTML job content and decodes standard HTML entities.
   */
  private cleanHtmlContent(html: string): string {
    if (!html) return '';
    return html
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]*>?/gm, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }
}
