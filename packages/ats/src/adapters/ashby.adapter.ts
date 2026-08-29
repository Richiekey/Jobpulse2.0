import type {
  JobCandidate,
  RawJobPayload,
  RawJob,
  NormalizedJob,
  CompanySourceConfig,
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
      rawApplyUrl: data.jobUrl ? `${data.jobUrl}/application` : undefined,
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
}
