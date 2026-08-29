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

interface LeverPosting {
  id: string;
  text: string;
  createdAt: number;
  hostedUrl: string;
  applyUrl: string;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
    department?: string;
    allLocations?: string[];
  };
  descriptionPlain?: string;
  description?: string;
  additionalPlain?: string;
}

export class LeverAdapter implements ATSAdapter {
  public readonly platformSlug = 'lever';
  public readonly parserVersion = 'lever_v1';

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const site = companySource.sourceIdentifier;
    const url = `https://api.lever.co/v0/postings/${site}?mode=json`;

    const response = await httpClient.get<LeverPosting[]>(url);
    if (!Array.isArray(response.data)) {
      return [];
    }

    return response.data.map((job) => ({
      sourceId: companySource.sourceId,
      externalJobId: job.id,
      discoveryUrl: url,
      sourceJobUrl: job.hostedUrl,
      companyIdentifier: site,
    }));
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const url = `https://api.lever.co/v0/postings/${candidate.companyIdentifier}/${candidate.externalJobId}`;
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
    const data = rawPayload.payload as unknown as LeverPosting;

    const rawLocations: string[] = [];
    if (data.categories?.location) {
      rawLocations.push(data.categories.location);
    }
    if (Array.isArray(data.categories?.allLocations)) {
      for (const loc of data.categories.allLocations) {
        if (loc) rawLocations.push(loc);
      }
    }

    const description = `${data.descriptionPlain || ''}\n\n${data.additionalPlain || ''}`.trim();

    return {
      sourceId: rawPayload.sourceId,
      externalJobId: data.id,
      rawTitle: data.text || 'Untitled Role',
      rawDescription: description,
      rawDescriptionHtml: data.description || null,
      rawLocations,
      rawPostedAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
      rawEmploymentType: data.categories?.commitment || undefined,
      rawApplyUrl: data.applyUrl || (data.hostedUrl ? `${data.hostedUrl}/apply` : undefined),
      sourceJobUrl: data.hostedUrl || '',
      discoveryUrl: `https://api.lever.co/v0/postings/job/${data.id}`,
      sourceMetadata: {
        team: data.categories?.team,
        department: data.categories?.department,
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
