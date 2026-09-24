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

interface BambooHRJobItem {
  id: string | number;
  jobOpeningName?: string;
  title?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
    name?: string;
  } | string;
  department?: { label?: string } | string;
  employmentType?: string;
  description?: string;
  url?: string;
}

interface BambooHRListResponse {
  result?: BambooHRJobItem[];
}

export class BambooHRAdapter implements ATSAdapter {
  public readonly platformSlug = 'bamboohr';
  public readonly parserVersion = 'bamboohr_v1';

  public detect(url: string): ATSDetectionResult {
    const pattern = /([a-zA-Z0-9_-]+)\.bamboohr\.com\/careers/i;
    const match = url.match(pattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'bamboohr',
        boardIdentifier: match[1].toLowerCase(),
        confidence: 0.99,
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

  public async validateSource(config: CompanySourceConfig): Promise<SourceValidationResult> {
    const start = Date.now();
    const slug = config.sourceIdentifier;
    const url = `https://${slug}.bamboohr.com/careers/list?json=true`;

    try {
      const response = await httpClient.get<BambooHRListResponse | BambooHRJobItem[]>(url, { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      const jobs = Array.isArray(response.data)
        ? response.data
        : response.data?.result || [];

      if (response.status === 200 && Array.isArray(jobs)) {
        return {
          isValid: true,
          atsType: 'bamboohr',
          boardIdentifier: slug,
          jobsDiscoveredCount: jobs.length,
          sampleJobTitles: jobs.slice(0, 3).map((j) => j.jobOpeningName || j.title || 'Untitled'),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'bamboohr',
        boardIdentifier: slug,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `BambooHR returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: unknown) {
      return {
        isValid: false,
        atsType: 'bamboohr',
        boardIdentifier: slug,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err instanceof Error ? err.message : 'Validation request failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const slug = companySource.sourceIdentifier;
    const url = `https://${slug}.bamboohr.com/careers/list?json=true`;

    const response = await httpClient.get<BambooHRListResponse | BambooHRJobItem[]>(url);
    const jobs = Array.isArray(response.data)
      ? response.data
      : response.data?.result || [];

    return jobs.map((job) => {
      const jobId = String(job.id);
      return {
        sourceId: companySource.sourceId,
        externalJobId: jobId,
        discoveryUrl: url,
        sourceJobUrl: job.url || `https://${slug}.bamboohr.com/careers/${jobId}`,
        companyIdentifier: slug,
      };
    });
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const detailUrl = `https://${candidate.companyIdentifier}.bamboohr.com/careers/${candidate.externalJobId}`;
    let payload: Record<string, unknown> = { id: candidate.externalJobId, url: candidate.sourceJobUrl };

    try {
      const response = await httpClient.get<string>(detailUrl, { timeoutMs: 12000 });
      if (response.status === 200 && response.data) {
        payload = {
          id: candidate.externalJobId,
          url: candidate.sourceJobUrl,
          rawHtml: response.data,
        };
      }
    } catch {
      // Keep basic payload
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
    const data = rawPayload.payload as unknown as BambooHRJobItem & { rawHtml?: string };
    const title = data.jobOpeningName || data.title || 'Untitled Role';

    const locationSet = new Set<string>();
    if (typeof data.location === 'object' && data.location) {
      const parts = [data.location.city, data.location.state, data.location.country].filter(Boolean);
      if (parts.length > 0) locationSet.add(parts.join(', '));
      if (data.location.name) locationSet.add(data.location.name);
    } else if (typeof data.location === 'string' && data.location.trim()) {
      locationSet.add(data.location.trim());
    }

    const rawLocations = Array.from(locationSet);
    const fullText = `${title} ${rawLocations.join(' ')}`.toLowerCase();
    let rawWorkplaceType: string | undefined = undefined;
    if (fullText.includes('remote') || fullText.includes('anywhere')) {
      rawWorkplaceType = 'remote';
    } else if (fullText.includes('hybrid')) {
      rawWorkplaceType = 'hybrid';
    }

    const dept = typeof data.department === 'object' && data.department ? data.department.label : data.department;
    const externalJobId = String(data.id || rawPayload.externalId);
    const applyUrl = data.url || `https://${rawPayload.sourceId}.bamboohr.com/careers/${externalJobId}`;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId,
      rawTitle: title,
      rawDescription: data.description || data.rawHtml || `<p>${title}</p>`,
      rawLocations,
      rawWorkplaceType,
      rawEmploymentType: data.employmentType,
      rawApplyUrl: applyUrl,
      sourceJobUrl: applyUrl,
      discoveryUrl: `https://${rawPayload.sourceId}.bamboohr.com/careers/list?json=true`,
      sourceMetadata: {
        department: dept,
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
    if (raw.rawApplyUrl) {
      return raw.rawApplyUrl;
    }
    return `https://${candidate.companyIdentifier}.bamboohr.com/careers/${candidate.externalJobId}`;
  }
}
