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

interface JobDivaJobItem {
  id: number | string;
  title?: string;
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  location?: string;
  description?: string;
  department?: string;
  category?: string;
  type?: string;
  remote?: boolean;
  url?: string;
  applyUrl?: string;
  datePosted?: string;
  createdDate?: string;
}

interface JobDivaPortalResponse {
  jobs?: JobDivaJobItem[];
  data?: JobDivaJobItem[];
  results?: JobDivaJobItem[];
  totalCount?: number;
}

export class JobDivaAdapter implements ATSAdapter {
  public readonly platformSlug = 'jobdiva';
  public readonly parserVersion = 'jobdiva_v1';

  public detect(url: string): ATSDetectionResult {
    const pattern = /jobdiva\.com\/portal\/?\??.*portalid=([a-zA-Z0-9_-]+)/i;
    const match = url.match(pattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'jobdiva',
        boardIdentifier: match[1].toLowerCase(),
        confidence: 0.99,
        sourceUrl: url,
      };
    }

    // Also detect generic jobdiva.com URLs
    if (/jobdiva\.com/i.test(url)) {
      return {
        detected: true,
        atsType: 'jobdiva',
        boardIdentifier: null,
        confidence: 0.7,
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
    const portalId = config.sourceIdentifier;
    const url = `https://www.jobdiva.com/api/public/portal/${portalId}/jobs`;

    try {
      const response = await httpClient.get<JobDivaPortalResponse | JobDivaJobItem[]>(url, { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      const jobs = Array.isArray(response.data)
        ? response.data
        : response.data?.jobs || response.data?.data || response.data?.results || [];

      if (response.status === 200 && Array.isArray(jobs)) {
        return {
          isValid: true,
          atsType: 'jobdiva',
          boardIdentifier: portalId,
          jobsDiscoveredCount: jobs.length,
          sampleJobTitles: jobs.slice(0, 3).map((j) => j.title || j.name || 'Untitled'),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'jobdiva',
        boardIdentifier: portalId,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `JobDiva returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: unknown) {
      return {
        isValid: false,
        atsType: 'jobdiva',
        boardIdentifier: portalId,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err instanceof Error ? err.message : 'Validation request failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const portalId = companySource.sourceIdentifier;
    const url = `https://www.jobdiva.com/api/public/portal/${portalId}/jobs`;

    const response = await httpClient.get<JobDivaPortalResponse | JobDivaJobItem[]>(url);
    const jobs = Array.isArray(response.data)
      ? response.data
      : response.data?.jobs || response.data?.data || response.data?.results || [];

    return jobs.map((job) => {
      const jobId = String(job.id);
      return {
        sourceId: companySource.sourceId,
        externalJobId: jobId,
        discoveryUrl: url,
        sourceJobUrl: job.url || `https://www.jobdiva.com/portal/?portal=${portalId}&jobid=${jobId}`,
        companyIdentifier: portalId,
      };
    });
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const detailUrl = `https://www.jobdiva.com/api/public/portal/${candidate.companyIdentifier}/jobs/${candidate.externalJobId}`;
    let payload: Record<string, unknown> = { id: candidate.externalJobId, url: candidate.sourceJobUrl };

    try {
      const response = await httpClient.get<Record<string, unknown>>(detailUrl, { timeoutMs: 12000 });
      if (response.status === 200 && response.data) {
        payload = response.data;
      }
    } catch {
      // Fallback payload
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
    const data = rawPayload.payload as unknown as JobDivaJobItem;
    const title = data.title || data.name || 'Untitled Role';

    const locationSet = new Set<string>();
    const parts = [data.city, data.state, data.country].filter(Boolean);
    if (parts.length > 0) locationSet.add(parts.join(', '));
    if (data.location) locationSet.add(data.location);
    const rawLocations = Array.from(locationSet);

    let rawWorkplaceType: string | undefined = undefined;
    if (data.remote) {
      rawWorkplaceType = 'remote';
    } else {
      const fullText = `${title} ${rawLocations.join(' ')} ${data.type || ''}`.toLowerCase();
      if (fullText.includes('remote')) rawWorkplaceType = 'remote';
      else if (fullText.includes('hybrid')) rawWorkplaceType = 'hybrid';
    }

    const externalJobId = String(data.id || rawPayload.externalId);
    const portalId = rawPayload.sourceId;
    const applyUrl = data.applyUrl || data.url || `https://www.jobdiva.com/portal/?portal=${portalId}&jobid=${externalJobId}`;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId,
      rawTitle: title,
      rawDescription: data.description || `<p>${title}</p>`,
      rawLocations,
      rawWorkplaceType,
      rawPostedAt: data.datePosted || data.createdDate,
      rawApplyUrl: applyUrl,
      sourceJobUrl: applyUrl,
      discoveryUrl: `https://www.jobdiva.com/api/public/portal/${portalId}/jobs`,
      sourceMetadata: {
        department: data.department,
        category: data.category,
        type: data.type,
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
    return `https://www.jobdiva.com/portal/?portal=${candidate.companyIdentifier}&jobid=${candidate.externalJobId}`;
  }
}
