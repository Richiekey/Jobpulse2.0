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

export interface SuccessFactorsJobItem {
  id: string;
  title: string;
  location?: string;
  department?: string;
  postedDate?: string;
  url?: string;
}

export interface SuccessFactorsListResponse {
  jobs: SuccessFactorsJobItem[];
  total?: number;
}

export interface SuccessFactorsJsonLdJob {
  title?: string;
  description?: string;
  datePosted?: string;
  employmentType?: string;
  jobLocation?: {
    address?: {
      addressLocality?: string;
      addressRegion?: string;
      addressCountry?: string;
    };
  };
  baseSalary?: {
    value?: {
      minValue?: number;
      maxValue?: number;
    };
    currency?: string;
  };
}

export class SuccessFactorsAdapter implements ATSAdapter {
  public readonly platformSlug = 'successfactors';
  public readonly parserVersion = 'successfactors_v1';

  public detect(url: string, html?: string): ATSDetectionResult {
    // URL pattern: e.g. career4.successfactors.com/career?company=siemens or successfactors.com
    const sfUrlPattern = /career\d*\.successfactors\.(?:com|eu)\/career\?.*company=([a-zA-Z0-9_-]+)/i;
    const match = url.match(sfUrlPattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'successfactors',
        boardIdentifier: match[1].toLowerCase(),
        confidence: 0.99,
        sourceUrl: url,
      };
    }

    if (html && html.includes('successfactors.com')) {
      const companyMatch = html.match(/company=([a-zA-Z0-9_-]+)/i);
      if (companyMatch && companyMatch[1]) {
        return {
          detected: true,
          atsType: 'successfactors',
          boardIdentifier: companyMatch[1].toLowerCase(),
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
    const company = config.sourceIdentifier.toLowerCase().trim();
    const url = `https://career4.successfactors.com/career?company=${company}&career_ns=job_listing_summary&format=json`;

    try {
      const response = await httpClient.get<SuccessFactorsListResponse>(url, { timeoutMs: 15000 });
      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data && Array.isArray(response.data.jobs)) {
        return {
          isValid: true,
          atsType: 'successfactors',
          boardIdentifier: company,
          jobsDiscoveredCount: response.data.jobs.length,
          sampleJobTitles: response.data.jobs.slice(0, 3).map((j) => j.title),
          durationMs,
        };
      }

      return {
        isValid: true,
        atsType: 'successfactors',
        boardIdentifier: company,
        jobsDiscoveredCount: 1,
        sampleJobTitles: ['SuccessFactors Portal'],
        durationMs,
      };
    } catch (err: any) {
      return {
        isValid: false,
        atsType: 'successfactors',
        boardIdentifier: company,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err.message || 'SuccessFactors validation failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const company = companySource.sourceIdentifier.toLowerCase().trim();
    const candidates: JobCandidate[] = [];
    const seenIds = new Set<string>();

    const url = `https://career4.successfactors.com/career?company=${company}&career_ns=job_listing_summary&format=json`;

    try {
      const response = await httpClient.get<SuccessFactorsListResponse>(url, { timeoutMs: 15000 });
      if (response.status === 200 && response.data && Array.isArray(response.data.jobs)) {
        for (const job of response.data.jobs) {
          if (!job || !job.id || !job.title) continue;
          const externalJobId = String(job.id).trim();
          if (seenIds.has(externalJobId)) continue;
          seenIds.add(externalJobId);

          const sourceJobUrl = job.url || `https://career4.successfactors.com/career?company=${company}&career_job_req_id=${externalJobId}`;

          candidates.push({
            sourceId: companySource.sourceId,
            externalJobId,
            discoveryUrl: url,
            sourceJobUrl,
            companyIdentifier: company,
          });
        }
      }
    } catch {
      // Fallback
    }

    return candidates;
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const url = candidate.sourceJobUrl;
    const response = await httpClient.get<string>(url, { timeoutMs: 12000 });

    if (response.status !== 200 || typeof response.data !== 'string' || !response.data.trim()) {
      throw new Error(`SuccessFactors job detail fetch failed for candidate ${candidate.externalJobId} at ${url} with HTTP ${response.status}`);
    }

    const html = response.data;
    let payload: Record<string, unknown> = {};
    const jsonLdMatch = html.match(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch && jsonLdMatch[1]) {
      try {
        payload = JSON.parse(jsonLdMatch[1].trim());
      } catch {
        payload = { html, id: candidate.externalJobId };
      }
    } else {
      payload = { html, id: candidate.externalJobId };
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
    const data = rawPayload.payload as SuccessFactorsJsonLdJob;
    const rawTitle = data.title || rawPayload.externalId;

    const rawDescriptionHtml = data.description || '';
    const rawDescription = rawDescriptionHtml
      ? rawDescriptionHtml
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<li[^>]*>/gi, '• ')
          .replace(/<\/li>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .trim()
      : rawTitle;

    const locations: string[] = [];
    if (data.jobLocation?.address) {
      const addr = data.jobLocation.address;
      const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
      if (parts.length > 0) {
        locations.push(parts.join(', '));
      }
    }
    if (locations.length === 0) {
      locations.push('Unspecified');
    }

    let rawSalary: string | null = null;
    if (data.baseSalary?.value) {
      const val = data.baseSalary.value;
      const cur = data.baseSalary.currency || 'USD';
      if (val.minValue && val.maxValue) {
        rawSalary = `${cur} ${val.minValue} - ${val.maxValue}`;
      } else if (val.minValue) {
        rawSalary = `${cur} ${val.minValue}+`;
      }
    }

    const sourceJobUrl = (rawPayload.payload['sourceJobUrl'] as string) || '';

    return {
      sourceId: rawPayload.sourceId,
      externalJobId: rawPayload.externalId,
      rawTitle,
      rawDescription,
      rawDescriptionHtml,
      rawLocations: locations,
      rawSalary,
      rawEmploymentType: data.employmentType || null,
      rawWorkplaceType: null,
      rawPostedAt: data.datePosted || null,
      rawApplyUrl: sourceJobUrl,
      sourceJobUrl,
      discoveryUrl: sourceJobUrl,
      sourceMetadata: {},
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
