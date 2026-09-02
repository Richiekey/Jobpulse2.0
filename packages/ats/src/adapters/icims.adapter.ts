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

export interface iCIMSJobListItem {
  id: string;
  title: string;
  url: string;
  location?: string;
  category?: string;
  postedDate?: string;
  positionType?: string;
}

export interface iCIMSJobListResponse {
  jobs: iCIMSJobListItem[];
  total?: number;
  count?: number;
}

export interface iCIMSJsonLdJob {
  '@context'?: string;
  '@type'?: string;
  title?: string;
  description?: string;
  datePosted?: string;
  employmentType?: string;
  hiringOrganization?: { name?: string };
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
      unitText?: string;
    };
    currency?: string;
  };
}

export class iCIMSAdapter implements ATSAdapter {
  public readonly platformSlug = 'icims';
  public readonly parserVersion = 'icims_v1';

  public detect(url: string, html?: string): ATSDetectionResult {
    // 1. Direct URL pattern: e.g. https://careers-enterprise.icims.com/jobs/12345/job
    const icimsUrlPattern = /https?:\/\/([a-zA-Z0-9_-]+)\.icims\.com(?:\/jobs\/)?/i;
    const match = url.match(icimsUrlPattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'icims',
        boardIdentifier: match[1].toLowerCase(),
        confidence: 0.99,
        sourceUrl: url,
      };
    }

    // 2. HTML embedded detection
    if (html && (html.includes('icims.com') || html.includes('iCIMS_JobContent'))) {
      const portalMatch = html.match(/https?:\/\/([a-zA-Z0-9_-]+)\.icims\.com/i);
      if (portalMatch && portalMatch[1]) {
        return {
          detected: true,
          atsType: 'icims',
          boardIdentifier: portalMatch[1].toLowerCase(),
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
    const portal = config.sourceIdentifier.toLowerCase().trim();
    const url = `https://${portal}.icims.com/jobs/search?pr=0&schema=v1&format=json`;

    try {
      const response = await httpClient.get<iCIMSJobListResponse>(url, { timeoutMs: 15000 });
      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data && Array.isArray(response.data.jobs)) {
        return {
          isValid: true,
          atsType: 'icims',
          boardIdentifier: portal,
          jobsDiscoveredCount: response.data.jobs.length,
          sampleJobTitles: response.data.jobs.slice(0, 3).map((j) => j.title),
          durationMs,
        };
      }

      // If JSON endpoint not enabled, try standard portal search page
      const portalUrl = `https://${portal}.icims.com/jobs/search?pr=0`;
      const htmlResp = await httpClient.get<string>(portalUrl, { timeoutMs: 15000 });

      if (htmlResp.status === 200 && typeof htmlResp.data === 'string' && htmlResp.data.includes('icims')) {
        return {
          isValid: true,
          atsType: 'icims',
          boardIdentifier: portal,
          jobsDiscoveredCount: 1,
          sampleJobTitles: ['iCIMS Portal Jobs'],
          durationMs: Date.now() - start,
        };
      }

      return {
        isValid: false,
        atsType: 'icims',
        boardIdentifier: portal,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `iCIMS returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: any) {
      return {
        isValid: false,
        atsType: 'icims',
        boardIdentifier: portal,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err.message || 'iCIMS validation failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const portal = companySource.sourceIdentifier.toLowerCase().trim();
    const candidates: JobCandidate[] = [];
    const seenIds = new Set<string>();

    const searchUrl = `https://${portal}.icims.com/jobs/search?pr=0&schema=v1&format=json`;

    try {
      const response = await httpClient.get<iCIMSJobListResponse>(searchUrl, { timeoutMs: 15000 });
      if (response.status === 200 && response.data && Array.isArray(response.data.jobs)) {
        for (const job of response.data.jobs) {
          if (!job || !job.id || !job.title) continue;
          const externalJobId = String(job.id).trim();
          if (seenIds.has(externalJobId)) continue;
          seenIds.add(externalJobId);

          const sourceJobUrl = job.url || `https://${portal}.icims.com/jobs/${externalJobId}/job`;

          candidates.push({
            sourceId: companySource.sourceId,
            externalJobId,
            discoveryUrl: searchUrl,
            sourceJobUrl,
            companyIdentifier: portal,
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
    let payload: Record<string, unknown> = {};

    try {
      const response = await httpClient.get<string>(url, { timeoutMs: 12000 });
      if (response.status === 200 && typeof response.data === 'string') {
        const html = response.data;
        // Extract Schema.org JSON-LD if present
        const jsonLdMatch = html.match(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
        if (jsonLdMatch && jsonLdMatch[1]) {
          try {
            const parsed = JSON.parse(jsonLdMatch[1].trim());
            payload = parsed;
          } catch {
            payload = { html, id: candidate.externalJobId };
          }
        } else {
          payload = { html, id: candidate.externalJobId };
        }
      }
    } catch {
      payload = { id: candidate.externalJobId, sourceJobUrl: candidate.sourceJobUrl };
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
    const data = rawPayload.payload as iCIMSJsonLdJob;
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

    // Location
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

    // Salary
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
      rawApplyUrl: sourceJobUrl ? `${sourceJobUrl}?mode=apply` : null,
      sourceJobUrl,
      discoveryUrl: sourceJobUrl,
      sourceMetadata: {
        hiringOrg: data.hiringOrganization?.name,
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
    if (raw.rawApplyUrl && raw.rawApplyUrl.startsWith('http')) {
      return raw.rawApplyUrl;
    }
    return raw.sourceJobUrl || candidate.sourceJobUrl || '';
  }
}
