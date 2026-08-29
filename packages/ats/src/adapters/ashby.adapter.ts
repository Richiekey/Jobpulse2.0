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

interface AshbyJobListing {
  id: string;
  title: string;
  location?: string;
  department?: string;
  isRemote?: boolean;
  compensationTierSummary?: string;
  jobUrl?: string;
  publishedAt?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
}

interface AshbyBoardResponse {
  jobs: AshbyJobListing[];
}

export class AshbyAdapter implements ATSAdapter {
  public readonly platformSlug = 'ashby';
  public readonly parserVersion = 'ashby_v1';

  public detect(url: string, html?: string): ATSDetectionResult {
    const urlPattern = /jobs\.ashbyhq\.com\/([^/?#]+)/i;
    const match = url.match(urlPattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'ashby',
        boardIdentifier: match[1].toLowerCase(),
        confidence: 0.99,
        sourceUrl: url,
      };
    }

    if (html && html.includes('jobs.ashbyhq.com')) {
      const inlineMatch = html.match(/jobs\.ashbyhq\.com\/([^/"&'\s]+)/i);
      if (inlineMatch && inlineMatch[1]) {
        return {
          detected: true,
          atsType: 'ashby',
          boardIdentifier: inlineMatch[1].toLowerCase(),
          confidence: 0.85,
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
    const jobBoardName = config.sourceIdentifier;
    const url = `https://api.ashbyhq.com/posting-api/job-board/${jobBoardName}`;

    try {
      const response = await httpClient.get<AshbyBoardResponse>(url, { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data && Array.isArray(response.data.jobs)) {
        return {
          isValid: true,
          atsType: 'ashby',
          boardIdentifier: jobBoardName,
          jobsDiscoveredCount: response.data.jobs.length,
          sampleJobTitles: response.data.jobs.slice(0, 3).map((j) => j.title),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'ashby',
        boardIdentifier: jobBoardName,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `Ashby returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: any) {
      return {
        isValid: false,
        atsType: 'ashby',
        boardIdentifier: jobBoardName,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err.message || 'Validation request failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const jobBoardName = companySource.sourceIdentifier;
    const url = `https://api.ashbyhq.com/posting-api/job-board/${jobBoardName}`;

    const response = await httpClient.get<AshbyBoardResponse>(url);
    if (!response.data || !Array.isArray(response.data.jobs)) {
      return [];
    }

    return response.data.jobs.map((job) => ({
      sourceId: companySource.sourceId,
      externalJobId: job.id,
      discoveryUrl: url,
      sourceJobUrl: job.jobUrl || `https://jobs.ashbyhq.com/${jobBoardName}/${job.id}`,
      companyIdentifier: jobBoardName,
    }));
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${candidate.companyIdentifier}/job/${candidate.externalJobId}`;
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
    const data = rawPayload.payload as unknown as AshbyJobListing;

    const rawLocations: string[] = [];
    if (data.location) {
      rawLocations.push(data.location);
    }
    if (data.isRemote) {
      rawLocations.push('Remote');
    }

    const description = data.descriptionPlain || data.descriptionHtml?.replace(/<[^>]*>?/gm, ' ') || 'No description provided';

    return {
      sourceId: rawPayload.sourceId,
      externalJobId: data.id,
      rawTitle: data.title || 'Untitled Role',
      rawDescription: description.trim(),
      rawDescriptionHtml: data.descriptionHtml || null,
      rawLocations,
      rawSalary: data.compensationTierSummary || undefined,
      rawPostedAt: data.publishedAt || new Date().toISOString(),
      rawWorkplaceType: data.isRemote ? 'remote' : undefined,
      // INVARIANT: Never synthesize /application suffix. Use explicit data.jobUrl without guessed path modifications.
      rawApplyUrl: data.jobUrl || undefined,
      sourceJobUrl: data.jobUrl || '',
      discoveryUrl: `https://api.ashbyhq.com/posting-api/job-board/job/${data.id}`,
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
    // INVARIANT: Never synthesize application URLs.
    if (raw.rawApplyUrl) return raw.rawApplyUrl;
    return raw.sourceJobUrl || candidate.sourceJobUrl || '';
  }
}
