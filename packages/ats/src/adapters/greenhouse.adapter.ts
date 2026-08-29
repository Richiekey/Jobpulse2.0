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

interface GreenhouseJobListing {
  id: number;
  title: string;
  updated_at: string;
  absolute_url: string;
  location?: { name: string };
  content?: string;
  departments?: Array<{ name: string }>;
  offices?: Array<{ name: string; location?: string }>;
}

interface GreenhouseBoardResponse {
  jobs: GreenhouseJobListing[];
}

export class GreenhouseAdapter implements ATSAdapter {
  public readonly platformSlug = 'greenhouse';
  public readonly parserVersion = 'greenhouse_v1';

  public detect(url: string, html?: string): ATSDetectionResult {
    // 1. Direct URL regex
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

    // 2. Embedded HTML script regex
    if (html && (html.includes('greenhouse.io') || html.includes('grnh.se'))) {
      const embedMatch = html.match(/boards\.greenhouse\.io\/embed\/job_board(?:\.js)?\?for=([^"&'\s]+)/i) ||
                         html.match(/boards\.greenhouse\.io\/([^/"&'\s]+)/i);
      if (embedMatch && embedMatch[1] && embedMatch[1].toLowerCase() !== 'embed') {
        return {
          detected: true,
          atsType: 'greenhouse',
          boardIdentifier: embedMatch[1].toLowerCase(),
          confidence: 0.85,
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

    const rawLocations: string[] = [];
    if (data.location?.name) {
      rawLocations.push(data.location.name);
    }
    if (Array.isArray(data.offices)) {
      for (const office of data.offices) {
        if (office.name) rawLocations.push(office.name);
      }
    }

    const rawHtml = data.content || '';
    const rawText = rawHtml
      .replace(/<[^>]*>?/gm, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      sourceId: rawPayload.sourceId,
      externalJobId: String(data.id),
      rawTitle: data.title || 'Untitled Role',
      rawDescription: rawText,
      rawDescriptionHtml: rawHtml,
      rawLocations,
      rawPostedAt: data.updated_at,
      rawApplyUrl: data.absolute_url ? `${data.absolute_url}#app` : undefined,
      sourceJobUrl: data.absolute_url || '',
      discoveryUrl: `https://boards-api.greenhouse.io/v1/boards/job/${data.id}`,
      sourceMetadata: {
        departments: data.departments?.map((d) => d.name) || [],
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
    if (raw.rawApplyUrl) return raw.rawApplyUrl;
    if (raw.sourceJobUrl) return `${raw.sourceJobUrl}#app`;
    return candidate.sourceJobUrl || '';
  }
}
