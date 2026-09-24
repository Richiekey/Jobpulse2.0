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

interface BreezyLocation {
  name?: string;
  city?: string;
  country?: { name?: string };
  is_remote?: boolean;
}

interface BreezyPosition {
  id?: string;
  _id?: string;
  name?: string;
  title?: string;
  location?: BreezyLocation | string;
  remote?: boolean;
  department?: string;
  description?: string;
  type?: { name?: string } | string;
  url?: string;
  published_date?: string;
}

export class BreezyAdapter implements ATSAdapter {
  public readonly platformSlug = 'breezy';
  public readonly parserVersion = 'breezy_v1';

  public detect(url: string): ATSDetectionResult {
    const pattern = /([a-zA-Z0-9_-]+)\.breezy\.hr/i;
    const match = url.match(pattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'breezy',
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
    const url = `https://${slug}.breezy.hr/json`;

    try {
      const response = await httpClient.get<BreezyPosition[] | { positions?: BreezyPosition[] }>(url, { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      const jobs = Array.isArray(response.data)
        ? response.data
        : response.data?.positions || [];

      if (response.status === 200 && Array.isArray(jobs)) {
        return {
          isValid: true,
          atsType: 'breezy',
          boardIdentifier: slug,
          jobsDiscoveredCount: jobs.length,
          sampleJobTitles: jobs.slice(0, 3).map((j) => j.name || j.title || 'Untitled'),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'breezy',
        boardIdentifier: slug,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `Breezy HR returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: unknown) {
      return {
        isValid: false,
        atsType: 'breezy',
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
    const url = `https://${slug}.breezy.hr/json`;

    const response = await httpClient.get<BreezyPosition[] | { positions?: BreezyPosition[] }>(url);
    const jobs = Array.isArray(response.data)
      ? response.data
      : response.data?.positions || [];

    return jobs.map((job) => {
      const jobId = String(job._id || job.id);
      return {
        sourceId: companySource.sourceId,
        externalJobId: jobId,
        discoveryUrl: url,
        sourceJobUrl: job.url || `https://${slug}.breezy.hr/p/${jobId}`,
        companyIdentifier: slug,
      };
    });
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const detailUrl = `https://${candidate.companyIdentifier}.breezy.hr/p/${candidate.externalJobId}/json`;
    let payload: Record<string, unknown> = { id: candidate.externalJobId, url: candidate.sourceJobUrl };

    try {
      const response = await httpClient.get<Record<string, unknown>>(detailUrl, { timeoutMs: 12000 });
      if (response.status === 200 && response.data) {
        payload = response.data;
      }
    } catch {
      // Fallback
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
    const data = rawPayload.payload as unknown as BreezyPosition;
    const title = data.name || data.title || 'Untitled Role';

    const locationSet = new Set<string>();
    let rawWorkplaceType: string | undefined = undefined;

    if (typeof data.location === 'object' && data.location) {
      const loc = data.location;
      const parts = [loc.city, loc.country?.name].filter(Boolean);
      if (parts.length > 0) locationSet.add(parts.join(', '));
      if (loc.name) locationSet.add(loc.name);
      if (loc.is_remote) rawWorkplaceType = 'remote';
    } else if (typeof data.location === 'string' && data.location.trim()) {
      locationSet.add(data.location.trim());
    }

    if (data.remote) {
      rawWorkplaceType = 'remote';
    }

    const rawLocations = Array.from(locationSet);
    const empType = typeof data.type === 'object' && data.type ? data.type.name : (data.type as string | undefined);

    const externalJobId = String(data._id || data.id || rawPayload.externalId);
    const applyUrl = data.url || `https://${rawPayload.sourceId}.breezy.hr/p/${externalJobId}`;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId,
      rawTitle: title,
      rawDescription: data.description || `<p>${title}</p>`,
      rawLocations,
      rawWorkplaceType,
      rawEmploymentType: empType,
      rawPostedAt: data.published_date,
      rawApplyUrl: applyUrl,
      sourceJobUrl: applyUrl,
      discoveryUrl: `https://${rawPayload.sourceId}.breezy.hr/json`,
      sourceMetadata: {
        department: data.department,
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
    return `https://${candidate.companyIdentifier}.breezy.hr/p/${candidate.externalJobId}/apply`;
  }
}
