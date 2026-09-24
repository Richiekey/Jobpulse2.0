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

interface WorkableLocation {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
}

interface WorkableJobListing {
  id?: string | number;
  shortcode?: string;
  title: string;
  department?: string;
  url?: string;
  application_url?: string;
  shortlink?: string;
  location?: WorkableLocation;
  locations?: WorkableLocation[];
  location_name?: string;
  telecommuting?: boolean;
  employment_type?: string;
  type?: string;
  description?: string;
  full_description?: string;
  requirements?: string;
  benefits?: string;
  created_at?: string;
  published_on?: string;
}

interface WorkableWidgetResponse {
  name?: string;
  jobs?: WorkableJobListing[];
}

export class WorkableAdapter implements ATSAdapter {
  public readonly platformSlug = 'workable';
  public readonly parserVersion = 'workable_v1';

  public detect(url: string, html?: string): ATSDetectionResult {
    const urlPattern = /apply\.workable\.com\/([^/?#]+)/i;
    const match = url.match(urlPattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'workable',
        boardIdentifier: match[1].toLowerCase(),
        confidence: 0.99,
        sourceUrl: url,
      };
    }

    if (html && (html.includes('apply.workable.com') || html.includes('workable-widget'))) {
      const widgetMatch = html.match(/apply\.workable\.com\/([^/"&'\s]+)/i);
      if (widgetMatch && widgetMatch[1]) {
        return {
          detected: true,
          atsType: 'workable',
          boardIdentifier: widgetMatch[1].toLowerCase(),
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
    const slug = config.sourceIdentifier;
    const url = `https://apply.workable.com/api/v1/widget/accounts/${slug}`;

    try {
      const response = await httpClient.get<WorkableWidgetResponse>(url, { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data && Array.isArray(response.data.jobs)) {
        return {
          isValid: true,
          atsType: 'workable',
          boardIdentifier: slug,
          jobsDiscoveredCount: response.data.jobs.length,
          sampleJobTitles: response.data.jobs.slice(0, 3).map((j) => j.title),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'workable',
        boardIdentifier: slug,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `Workable returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: unknown) {
      return {
        isValid: false,
        atsType: 'workable',
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
    const url = `https://apply.workable.com/api/v1/widget/accounts/${slug}`;

    const response = await httpClient.get<WorkableWidgetResponse>(url);
    if (!response.data || !Array.isArray(response.data.jobs)) {
      return [];
    }

    return response.data.jobs.map((job) => {
      const shortcode = job.shortcode || String(job.id);
      return {
        sourceId: companySource.sourceId,
        externalJobId: shortcode,
        discoveryUrl: url,
        sourceJobUrl: job.url || `https://apply.workable.com/${slug}/j/${shortcode}/`,
        companyIdentifier: slug,
      };
    });
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const detailUrl = `https://apply.workable.com/api/v1/widget/accounts/${candidate.companyIdentifier}/jobs/${candidate.externalJobId}`;
    let payload: Record<string, unknown> = {};

    try {
      const response = await httpClient.get<Record<string, unknown>>(detailUrl, { timeoutMs: 12000 });
      if (response.status === 200 && response.data) {
        payload = response.data;
      }
    } catch {
      payload = { shortcode: candidate.externalJobId, url: candidate.sourceJobUrl };
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
    const data = rawPayload.payload as unknown as WorkableJobListing;
    const locationSet = new Set<string>();

    if (data.location) {
      const parts = [data.location.city, data.location.region, data.location.country].filter(Boolean);
      if (parts.length > 0) locationSet.add(parts.join(', '));
    }
    if (Array.isArray(data.locations)) {
      for (const loc of data.locations) {
        const parts = [loc.city, loc.region, loc.country].filter(Boolean);
        if (parts.length > 0) locationSet.add(parts.join(', '));
      }
    }
    if (data.location_name) {
      locationSet.add(data.location_name.trim());
    }

    const rawLocations = Array.from(locationSet);

    let rawWorkplaceType: string | undefined = undefined;
    if (data.telecommuting) {
      rawWorkplaceType = 'remote';
    } else {
      const fullText = `${data.title || ''} ${rawLocations.join(' ')}`.toLowerCase();
      if (fullText.includes('remote') || fullText.includes('anywhere')) {
        rawWorkplaceType = 'remote';
      } else if (fullText.includes('hybrid')) {
        rawWorkplaceType = 'hybrid';
      } else if (fullText.includes('on-site') || fullText.includes('onsite')) {
        rawWorkplaceType = 'onsite';
      }
    }

    let description = data.description || data.full_description || '';
    if (data.requirements) {
      description += `\n<h3>Requirements</h3>\n${data.requirements}`;
    }
    if (data.benefits) {
      description += `\n<h3>Benefits</h3>\n${data.benefits}`;
    }

    const externalJobId = String(data.shortcode || data.id || rawPayload.externalId);
    const sourceJobUrl = data.url || `https://apply.workable.com/j/${externalJobId}`;
    const applyUrl = data.application_url || data.url || undefined;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId,
      rawTitle: data.title || 'Untitled Role',
      rawDescription: description || `<p>${data.title || 'Role'}</p>`,
      rawLocations,
      rawWorkplaceType,
      rawEmploymentType: data.employment_type || data.type,
      rawPostedAt: data.created_at || data.published_on,
      rawApplyUrl: applyUrl,
      sourceJobUrl,
      discoveryUrl: `https://apply.workable.com/api/v1/widget/accounts/jobs/${externalJobId}`,
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
    return `https://apply.workable.com/${candidate.companyIdentifier}/j/${candidate.externalJobId}/apply/`;
  }
}
