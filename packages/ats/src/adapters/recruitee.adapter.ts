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

interface RecruiteeOffer {
  id: number | string;
  title: string;
  city?: string;
  country?: string;
  location?: string;
  remote?: boolean;
  department?: string;
  description?: string;
  requirements?: string;
  careers_url?: string;
  created_at?: string;
  published_at?: string;
}

interface RecruiteeResponse {
  offers?: RecruiteeOffer[];
  offer?: RecruiteeOffer;
}

export class RecruiteeAdapter implements ATSAdapter {
  public readonly platformSlug = 'recruitee';
  public readonly parserVersion = 'recruitee_v1';

  public detect(url: string): ATSDetectionResult {
    const pattern = /([a-zA-Z0-9_-]+)\.recruitee\.com/i;
    const match = url.match(pattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'recruitee',
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
    const url = `https://${slug}.recruitee.com/api/offers`;

    try {
      const response = await httpClient.get<RecruiteeResponse>(url, { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data && Array.isArray(response.data.offers)) {
        return {
          isValid: true,
          atsType: 'recruitee',
          boardIdentifier: slug,
          jobsDiscoveredCount: response.data.offers.length,
          sampleJobTitles: response.data.offers.slice(0, 3).map((o) => o.title),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'recruitee',
        boardIdentifier: slug,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `Recruitee returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: unknown) {
      return {
        isValid: false,
        atsType: 'recruitee',
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
    const url = `https://${slug}.recruitee.com/api/offers`;

    const response = await httpClient.get<RecruiteeResponse>(url);
    if (!response.data || !Array.isArray(response.data.offers)) {
      return [];
    }

    return response.data.offers.map((offer) => {
      const jobId = String(offer.id);
      return {
        sourceId: companySource.sourceId,
        externalJobId: jobId,
        discoveryUrl: url,
        sourceJobUrl: offer.careers_url || `https://${slug}.recruitee.com/o/${jobId}`,
        companyIdentifier: slug,
      };
    });
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const detailUrl = `https://${candidate.companyIdentifier}.recruitee.com/api/offers/${candidate.externalJobId}`;
    let payload: Record<string, unknown> = { id: candidate.externalJobId, url: candidate.sourceJobUrl };

    try {
      const response = await httpClient.get<RecruiteeResponse>(detailUrl, { timeoutMs: 12000 });
      if (response.status === 200 && response.data) {
        payload = (response.data.offer || response.data) as Record<string, unknown>;
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
    const data = rawPayload.payload as unknown as RecruiteeOffer;
    const title = data.title || 'Untitled Role';

    const locationSet = new Set<string>();
    const parts = [data.city, data.country].filter(Boolean);
    if (parts.length > 0) locationSet.add(parts.join(', '));
    if (data.location) locationSet.add(data.location);
    const rawLocations = Array.from(locationSet);

    let rawWorkplaceType: string | undefined = undefined;
    if (data.remote) {
      rawWorkplaceType = 'remote';
    } else {
      const fullText = `${title} ${rawLocations.join(' ')}`.toLowerCase();
      if (fullText.includes('remote')) rawWorkplaceType = 'remote';
      else if (fullText.includes('hybrid')) rawWorkplaceType = 'hybrid';
    }

    let description = data.description || '';
    if (data.requirements) {
      description += `\n<h3>Requirements</h3>\n${data.requirements}`;
    }

    const externalJobId = String(data.id || rawPayload.externalId);
    const sourceJobUrl = data.careers_url || `https://${rawPayload.sourceId}.recruitee.com/o/${externalJobId}`;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId,
      rawTitle: title,
      rawDescription: description || `<p>${title}</p>`,
      rawLocations,
      rawWorkplaceType,
      rawPostedAt: data.published_at || data.created_at,
      rawApplyUrl: data.careers_url,
      sourceJobUrl,
      discoveryUrl: `https://${rawPayload.sourceId}.recruitee.com/api/offers`,
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
    return `https://${candidate.companyIdentifier}.recruitee.com/o/${candidate.externalJobId}`;
  }
}
