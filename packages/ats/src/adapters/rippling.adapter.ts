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

interface RipplingJobLocation {
  city?: string;
  country?: string;
  state?: string;
  workplaceType?: string;
}

interface RipplingJobItem {
  id: string;
  name?: string;
  title?: string;
  department?: { name?: string } | string;
  locations?: RipplingJobLocation[];
  description?: string;
  url?: string;
  createdAt?: string;
}

interface RipplingBoardResponse {
  items?: RipplingJobItem[];
  jobs?: RipplingJobItem[];
}

export class RipplingAdapter implements ATSAdapter {
  public readonly platformSlug = 'rippling';
  public readonly parserVersion = 'rippling_v1';

  public detect(url: string): ATSDetectionResult {
    const pattern = /ats\.rippling\.com\/([^/?#]+)/i;
    const match = url.match(pattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'rippling',
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
    const url = `https://ats.rippling.com/api/v1/board/${slug}/jobs`;

    try {
      const response = await httpClient.get<RipplingBoardResponse | RipplingJobItem[]>(url, { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      const jobs = Array.isArray(response.data)
        ? response.data
        : response.data?.items || response.data?.jobs || [];

      if (response.status === 200 && Array.isArray(jobs)) {
        return {
          isValid: true,
          atsType: 'rippling',
          boardIdentifier: slug,
          jobsDiscoveredCount: jobs.length,
          sampleJobTitles: jobs.slice(0, 3).map((j) => j.name || j.title || 'Untitled'),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'rippling',
        boardIdentifier: slug,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `Rippling returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: unknown) {
      return {
        isValid: false,
        atsType: 'rippling',
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
    const url = `https://ats.rippling.com/api/v1/board/${slug}/jobs`;

    const response = await httpClient.get<RipplingBoardResponse | RipplingJobItem[]>(url);
    const jobs = Array.isArray(response.data)
      ? response.data
      : response.data?.items || response.data?.jobs || [];

    return jobs.map((job) => {
      const jobId = String(job.id);
      return {
        sourceId: companySource.sourceId,
        externalJobId: jobId,
        discoveryUrl: url,
        sourceJobUrl: job.url || `https://ats.rippling.com/${slug}/jobs/${jobId}`,
        companyIdentifier: slug,
      };
    });
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const detailUrl = `https://ats.rippling.com/api/v1/board/${candidate.companyIdentifier}/jobs/${candidate.externalJobId}`;
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
    const data = rawPayload.payload as unknown as RipplingJobItem;
    const title = data.name || data.title || 'Untitled Role';

    const locationSet = new Set<string>();
    let rawWorkplaceType: string | undefined = undefined;

    if (Array.isArray(data.locations)) {
      for (const loc of data.locations) {
        const parts = [loc.city, loc.state, loc.country].filter(Boolean);
        if (parts.length > 0) locationSet.add(parts.join(', '));
        if (loc.workplaceType) {
          const wp = loc.workplaceType.toLowerCase();
          if (wp.includes('remote')) rawWorkplaceType = 'remote';
          else if (wp.includes('hybrid')) rawWorkplaceType = 'hybrid';
          else if (wp.includes('site')) rawWorkplaceType = 'onsite';
        }
      }
    }

    const rawLocations = Array.from(locationSet);
    const dept = typeof data.department === 'object' && data.department ? data.department.name : data.department;
    const externalJobId = String(data.id || rawPayload.externalId);
    const applyUrl = data.url || `https://ats.rippling.com/${rawPayload.sourceId}/jobs/${externalJobId}`;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId,
      rawTitle: title,
      rawDescription: data.description || `<p>${title}</p>`,
      rawLocations,
      rawWorkplaceType,
      rawPostedAt: data.createdAt,
      rawApplyUrl: applyUrl,
      sourceJobUrl: applyUrl,
      discoveryUrl: `https://ats.rippling.com/api/v1/board/${rawPayload.sourceId}/jobs`,
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
    return `https://ats.rippling.com/${candidate.companyIdentifier}/jobs/${candidate.externalJobId}`;
  }
}
