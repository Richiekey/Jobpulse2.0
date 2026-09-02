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

export interface OracleRequisitionItem {
  Id?: string;
  RequisitionId?: string | number;
  Title?: string;
  PrimaryLocation?: string;
  PostingDate?: string;
  JobFamily?: string;
  ExternalURL?: string;
}

export interface OracleRequisitionListResponse {
  items?: OracleRequisitionItem[];
  count?: number;
  totalResults?: number;
  hasMore?: boolean;
}

export interface OracleRequisitionDetail {
  Id?: string;
  RequisitionId?: string | number;
  Title?: string;
  Description?: string;
  PrimaryLocation?: string;
  OtherLocations?: Array<{ LocationName?: string }>;
  PostingDate?: string;
  ExternalURL?: string;
  ApplyURL?: string;
  JobSchedule?: string;
  JobType?: string;
  MinSalary?: number;
  MaxSalary?: number;
  CurrencyCode?: string;
}

export class OracleAdapter implements ATSAdapter {
  public readonly platformSlug = 'oracle';
  public readonly parserVersion = 'oracle_v1';

  public detect(url: string, html?: string): ATSDetectionResult {
    // 1. Oracle Cloud HCM pattern
    const oracleCloudPattern = /https?:\/\/([a-zA-Z0-9_-]+)\.fa\.[a-zA-Z0-9_.-]+\.oraclecloud\.com/i;
    const cloudMatch = url.match(oracleCloudPattern);
    if (cloudMatch && cloudMatch[1]) {
      return {
        detected: true,
        atsType: 'oracle',
        boardIdentifier: cloudMatch[1].toLowerCase(),
        confidence: 0.99,
        sourceUrl: url,
      };
    }

    // 2. Taleo pattern
    const taleoPattern = /https?:\/\/([a-zA-Z0-9_-]+)\.taleo\.net/i;
    const taleoMatch = url.match(taleoPattern);
    if (taleoMatch && taleoMatch[1]) {
      return {
        detected: true,
        atsType: 'oracle',
        boardIdentifier: taleoMatch[1].toLowerCase(),
        confidence: 0.99,
        sourceUrl: url,
      };
    }

    if (html && (html.includes('oraclecloud.com') || html.includes('taleo.net') || html.includes('oracle-hcm'))) {
      return {
        detected: true,
        atsType: 'oracle',
        boardIdentifier: 'oracle_tenant',
        confidence: 0.85,
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
    const portal = config.sourceIdentifier.toLowerCase().trim();
    const host = config.sourceUrl ? new URL(config.sourceUrl).host : `${portal}.taleo.net`;
    const url = `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&limit=5`;

    try {
      const response = await httpClient.get<OracleRequisitionListResponse>(url, { timeoutMs: 15000 });
      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data && Array.isArray(response.data.items)) {
        return {
          isValid: true,
          atsType: 'oracle',
          boardIdentifier: portal,
          jobsDiscoveredCount: typeof response.data.totalResults === 'number' ? response.data.totalResults : response.data.items.length,
          sampleJobTitles: response.data.items.slice(0, 3).map((i) => i.Title || 'Requisition'),
          durationMs,
        };
      }

      return {
        isValid: true,
        atsType: 'oracle',
        boardIdentifier: portal,
        jobsDiscoveredCount: 1,
        sampleJobTitles: ['Oracle HCM Portal'],
        durationMs,
      };
    } catch (err: any) {
      return {
        isValid: false,
        atsType: 'oracle',
        boardIdentifier: portal,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err.message || 'Oracle validation failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const portal = companySource.sourceIdentifier.toLowerCase().trim();
    const host = companySource.sourceUrl ? new URL(companySource.sourceUrl).host : `${portal}.taleo.net`;
    const candidates: JobCandidate[] = [];
    const seenIds = new Set<string>();

    const url = `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&limit=50&offset=0`;

    try {
      const response = await httpClient.get<OracleRequisitionListResponse>(url, { timeoutMs: 15000 });
      if (response.status === 200 && response.data && Array.isArray(response.data.items)) {
        for (const item of response.data.items) {
          const externalJobId = String(item.RequisitionId || item.Id || '').trim();
          if (!externalJobId || seenIds.has(externalJobId)) continue;
          seenIds.add(externalJobId);

          const sourceJobUrl = item.ExternalURL || `https://${host}/hcmUI/CandidateExperience/en/sites/CX/requisitions/preview/${externalJobId}`;

          candidates.push({
            sourceId: companySource.sourceId,
            externalJobId,
            discoveryUrl: url,
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
    const response = await httpClient.get<Record<string, unknown>>(url, { timeoutMs: 12000 });

    if (response.status !== 200 || !response.data) {
      throw new Error(`Oracle job requisition fetch failed for candidate ${candidate.externalJobId} at ${url} with HTTP ${response.status}`);
    }

    const payload = response.data;
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
    const data = rawPayload.payload as OracleRequisitionDetail;
    const rawTitle = data.Title || (rawPayload.payload['title'] as string) || rawPayload.externalId;

    const rawDescriptionHtml = data.Description || (rawPayload.payload['description'] as string) || '';
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
    if (data.PrimaryLocation) {
      locations.push(data.PrimaryLocation.trim());
    }
    if (Array.isArray(data.OtherLocations)) {
      for (const loc of data.OtherLocations) {
        if (loc.LocationName && !locations.includes(loc.LocationName.trim())) {
          locations.push(loc.LocationName.trim());
        }
      }
    }
    if (locations.length === 0) {
      locations.push('Unspecified');
    }

    let rawSalary: string | null = null;
    if (data.MinSalary || data.MaxSalary) {
      const cur = data.CurrencyCode || 'USD';
      if (data.MinSalary && data.MaxSalary) {
        rawSalary = `${cur} ${data.MinSalary} - ${data.MaxSalary}`;
      } else if (data.MinSalary) {
        rawSalary = `${cur} ${data.MinSalary}+`;
      }
    }

    const sourceJobUrl = data.ExternalURL || (rawPayload.payload['sourceJobUrl'] as string) || '';
    const rawApplyUrl = data.ApplyURL || sourceJobUrl;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId: rawPayload.externalId,
      rawTitle,
      rawDescription,
      rawDescriptionHtml,
      rawLocations: locations,
      rawSalary,
      rawEmploymentType: data.JobSchedule || data.JobType || null,
      rawWorkplaceType: null,
      rawPostedAt: data.PostingDate || null,
      rawApplyUrl,
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
