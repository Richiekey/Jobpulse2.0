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

interface AshbySecondaryLocation {
  location?: string;
  address?: {
    postalAddress?: {
      addressLocality?: string;
      addressRegion?: string;
      addressCountry?: string;
    };
  };
}

interface AshbyJobListing {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: AshbySecondaryLocation[];
  department?: string;
  team?: string;
  employmentType?: string;
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
  public readonly parserVersion = 'ashby_v2';

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

    // Multi-location and secondary locations aggregation
    const locationSet = new Set<string>();
    if (data.location && data.location.trim()) {
      locationSet.add(data.location.trim());
    }
    if (Array.isArray(data.secondaryLocations)) {
      for (const sec of data.secondaryLocations) {
        if (sec.location && sec.location.trim()) {
          locationSet.add(sec.location.trim());
        }
        if (sec.address?.postalAddress) {
          const p = sec.address.postalAddress;
          const locStr = [p.addressLocality, p.addressRegion, p.addressCountry].filter(Boolean).join(', ');
          if (locStr) locationSet.add(locStr);
        }
      }
    }
    const rawLocations = Array.from(locationSet);

    // Text description extraction
    let description = '';
    if (data.descriptionPlain && data.descriptionPlain.trim()) {
      description = data.descriptionPlain.trim();
    } else if (data.descriptionHtml) {
      description = data.descriptionHtml
        .replace(/<br\s*[\/]?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]*>?/gm, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/[ \t]+/g, ' ')
        .trim();
    }

    // Workplace type classification
    let rawWorkplaceType: string | undefined = undefined;
    const titleAndLoc = `${data.title || ''} ${rawLocations.join(' ')}`.toLowerCase();
    if (data.isRemote || titleAndLoc.includes('remote') || titleAndLoc.includes('anywhere')) {
      rawWorkplaceType = 'remote';
    } else if (titleAndLoc.includes('hybrid')) {
      rawWorkplaceType = 'hybrid';
    } else if (titleAndLoc.includes('onsite') || titleAndLoc.includes('on-site')) {
      rawWorkplaceType = 'onsite';
    }

    return {
      sourceId: rawPayload.sourceId,
      externalJobId: data.id,
      rawTitle: data.title || 'Untitled Role',
      rawDescription: description || 'No description provided.',
      rawDescriptionHtml: data.descriptionHtml || null,
      rawLocations,
      rawSalary: data.compensationTierSummary || undefined,
      rawPostedAt: data.publishedAt || new Date().toISOString(),
      rawEmploymentType: data.employmentType || undefined,
      rawWorkplaceType,
      // INVARIANT: Never synthesize /application suffix. Use explicit data.jobUrl without guessed path modifications.
      rawApplyUrl: data.jobUrl || undefined,
      sourceJobUrl: data.jobUrl || '',
      discoveryUrl: `https://api.ashbyhq.com/posting-api/job-board/job/${data.id}`,
      sourceMetadata: {
        department: data.department,
        team: data.team,
        isRemote: data.isRemote,
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
