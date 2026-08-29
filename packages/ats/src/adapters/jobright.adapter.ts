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
import { httpClient } from '@jobpulse/shared';
import type { ATSAdapter } from '../adapter.interface.js';

interface JobrightListing {
  id: string;
  title: string;
  company_name: string;
  description: string;
  location?: string;
  locations?: string[];
  workplace_type?: string;
  employment_type?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_interval?: string;
  posted_at?: string;
  source_job_url: string;
  original_apply_url?: string;
  ats_url?: string;
  embedded_urls?: string[];
}

export class JobrightAdapter implements ATSAdapter {
  public readonly platformSlug = 'jobright';
  public readonly parserVersion = 'jobright_v1';

  public detect(url: string): ATSDetectionResult {
    const urlPattern = /jobright\.ai\/jobs\/([a-zA-Z0-9_-]+)/i;
    const match = url.match(urlPattern);

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

  public async validateSource(config: CompanySourceConfig): Promise<SourceValidationResult> {
    const start = Date.now();
    const url = config.sourceUrl || `https://jobright.ai/api/jobs/company/${config.sourceIdentifier}`;

    try {
      const response = await httpClient.get<{ jobs?: JobrightListing[] }>(url, { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data?.jobs && Array.isArray(response.data.jobs)) {
        return {
          isValid: true,
          atsType: 'jobright',
          boardIdentifier: config.sourceIdentifier,
          jobsDiscoveredCount: response.data.jobs.length,
          sampleJobTitles: response.data.jobs.slice(0, 3).map((j) => j.title),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'jobright',
        boardIdentifier: config.sourceIdentifier,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `Jobright returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: any) {
      return {
        isValid: false,
        atsType: 'jobright',
        boardIdentifier: config.sourceIdentifier,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err.message || 'Validation request failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const url = companySource.sourceUrl || `https://jobright.ai/api/jobs/company/${companySource.sourceIdentifier}`;
    const response = await httpClient.get<{ jobs?: JobrightListing[] }>(url);

    if (!response.data?.jobs || !Array.isArray(response.data.jobs)) {
      return [];
    }

    return response.data.jobs.map((job) => ({
      sourceId: companySource.sourceId,
      externalJobId: String(job.id),
      discoveryUrl: url,
      sourceJobUrl: job.source_job_url || `https://jobright.ai/jobs/${job.id}`,
      companyIdentifier: companySource.sourceIdentifier,
    }));
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const url = candidate.sourceJobUrl;
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
    const p = rawPayload.payload as unknown as Partial<JobrightListing>;

    const locations: string[] = [];
    if (Array.isArray(p.locations)) {
      locations.push(...p.locations);
    } else if (typeof p.location === 'string' && p.location.trim()) {
      locations.push(p.location.trim());
    }

    return {
      sourceId: rawPayload.sourceId,
      externalJobId: rawPayload.externalId,
      rawTitle: p.title || 'Untitled Role',
      rawDescription: p.description || '',
      rawDescriptionHtml: null,
      rawEmploymentType: p.employment_type || null,
      rawWorkplaceType: p.workplace_type || null,
      rawLocations: locations,
      rawSalary: p.salary_min && p.salary_max ? `$${p.salary_min} - $${p.salary_max}` : null,
      rawPostedAt: p.posted_at || new Date().toISOString(),
      discoveryUrl: p.source_job_url || `https://jobright.ai/jobs/${rawPayload.externalId}`,
      sourceJobUrl: p.source_job_url || `https://jobright.ai/jobs/${rawPayload.externalId}`,
      sourceMetadata: {
        company_name: p.company_name,
        ats_url: p.ats_url,
        original_apply_url: p.original_apply_url,
        embedded_urls: p.embedded_urls || [],
      },
    };
  }

  public async normalize(raw: RawJob, payloadHash: string): Promise<NormalizedJob> {
    const urlCandidates: UrlCandidate[] = [];

    // 1. Check for explicit ATS / original apply URL
    const meta = raw.sourceMetadata || {};
    if (typeof meta['ats_url'] === 'string' && meta['ats_url'].trim()) {
      urlCandidates.push({
        url: meta['ats_url'].trim(),
        sourceType: 'explicit_ats_form',
      });
    }

    if (typeof meta['original_apply_url'] === 'string' && meta['original_apply_url'].trim()) {
      urlCandidates.push({
        url: meta['original_apply_url'].trim(),
        sourceType: 'explicit_employer_apply',
      });
    }

    // 2. Check embedded URLs for ATS patterns
    if (Array.isArray(meta['embedded_urls'])) {
      for (const embeddedUrl of meta['embedded_urls']) {
        if (typeof embeddedUrl === 'string' && URLResolver.isDirectAtsUrl(embeddedUrl)) {
          urlCandidates.push({
            url: embeddedUrl,
            sourceType: 'known_ats_url',
          });
        }
      }
    }

    // 3. Fallback candidate
    urlCandidates.push({
      url: raw.sourceJobUrl,
      sourceType: 'fallback_source',
    });

    const resolvedUrls = URLResolver.resolve({
      discoveryUrl: `https://jobright.ai/jobs/${raw.externalJobId}`,
      sourceJobUrl: raw.sourceJobUrl,
      candidates: urlCandidates,
      fallbackCanonicalUrl: urlCandidates[0]?.url || raw.sourceJobUrl,
    });

    return Normalizer.normalize(raw, resolvedUrls, payloadHash);
  }

  public validate(job: NormalizedJob): JobValidationResult {
    return JobValidator.validate(job);
  }

  public async resolveApplicationUrl(candidate: JobCandidate, raw: RawJob): Promise<string> {
    const meta = raw.sourceMetadata || {};
    if (typeof meta['original_apply_url'] === 'string' && meta['original_apply_url'].trim()) {
      return meta['original_apply_url'].trim();
    }
    if (typeof meta['ats_url'] === 'string' && meta['ats_url'].trim()) {
      return meta['ats_url'].trim();
    }
    return raw.sourceJobUrl || candidate.sourceJobUrl || '';
  }
}
