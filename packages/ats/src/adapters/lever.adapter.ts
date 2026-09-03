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

interface LeverCategories {
  location?: string;
  commitment?: string;
  team?: string;
  department?: string;
  allLocations?: string[];
  workplaceType?: string;
}

interface LeverPosting {
  id: string;
  text: string;
  createdAt: number;
  hostedUrl: string;
  applyUrl?: string;
  categories?: LeverCategories;
  descriptionPlain?: string;
  description?: string;
  additionalPlain?: string;
  additional?: string;
  workplaceType?: string;
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
    interval?: string;
  };
}

export class LeverAdapter implements ATSAdapter {
  public readonly platformSlug = 'lever';
  public readonly parserVersion = 'lever_v2';

  public detect(url: string, html?: string): ATSDetectionResult {
    const urlPattern = /jobs\.lever\.co\/([^/?#]+)/i;
    const match = url.match(urlPattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'lever',
        boardIdentifier: match[1].toLowerCase(),
        confidence: 0.99,
        sourceUrl: url,
      };
    }

    if (html && (html.includes('jobs.lever.co') || html.includes('lever-jobs-embed'))) {
      const scriptEmbedMatch = html.match(/jobs\.lever\.co\/embed\/([^/"&'\s]+)/i) ||
        html.match(/<script[^>]+jobs\.lever\.co\/([^/"&'\s]+)/i);
      if (scriptEmbedMatch && scriptEmbedMatch[1]) {
        return {
          detected: true,
          atsType: 'lever',
          boardIdentifier: scriptEmbedMatch[1].toLowerCase(),
          confidence: 0.90,
          sourceUrl: url,
        };
      }

      const inlineMatch = html.match(/jobs\.lever\.co\/([^/"&'\s]+)/i);
      if (inlineMatch && inlineMatch[1]) {
        return {
          detected: true,
          atsType: 'lever',
          boardIdentifier: inlineMatch[1].toLowerCase(),
          confidence: 0.70,
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
    const site = config.sourceIdentifier;
    const url = `https://api.lever.co/v0/postings/${site}?mode=json&limit=5`;

    try {
      const response = await httpClient.get<LeverPosting[]>(url, {
        timeoutMs: 10000,
        maxSizeBytes: 20 * 1024 * 1024,
      });
      const durationMs = Date.now() - start;

      if (response.status === 200 && Array.isArray(response.data)) {
        return {
          isValid: true,
          atsType: 'lever',
          boardIdentifier: site,
          jobsDiscoveredCount: response.data.length,
          sampleJobTitles: response.data.slice(0, 3).map((j) => j.text),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'lever',
        boardIdentifier: site,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `Lever returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: any) {
      return {
        isValid: false,
        atsType: 'lever',
        boardIdentifier: site,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err.message || 'Validation request failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const site = companySource.sourceIdentifier;
    const url = `https://api.lever.co/v0/postings/${site}?mode=json`;

    const response = await httpClient.get<LeverPosting[]>(url, {
      maxSizeBytes: 20 * 1024 * 1024,
    });
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

    // Multi-location extraction
    const locationSet = new Set<string>();
    if (data.categories?.location && data.categories.location.trim()) {
      locationSet.add(data.categories.location.trim());
    }
    if (Array.isArray(data.categories?.allLocations)) {
      for (const loc of data.categories.allLocations) {
        if (loc && loc.trim()) {
          locationSet.add(loc.trim());
        }
      }
    }
    const rawLocations = Array.from(locationSet);

    // Text description extraction
    let description = '';
    if (data.descriptionPlain || data.additionalPlain) {
      description = `${data.descriptionPlain || ''}\n\n${data.additionalPlain || ''}`.trim();
    } else if (data.description) {
      description = data.description.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    }

    // Workplace type classification
    let rawWorkplaceType: string | undefined = undefined;
    const wp = (data.workplaceType || data.categories?.workplaceType || '').toLowerCase();
    const searchContext = `${data.text || ''} ${rawLocations.join(' ')} ${wp}`.toLowerCase();

    if (wp === 'remote' || searchContext.includes('remote') || searchContext.includes('anywhere')) {
      rawWorkplaceType = 'remote';
    } else if (wp === 'hybrid' || searchContext.includes('hybrid')) {
      rawWorkplaceType = 'hybrid';
    } else if (wp === 'onsite' || searchContext.includes('onsite') || searchContext.includes('on-site')) {
      rawWorkplaceType = 'onsite';
    }

    // Salary parsing if present in Lever structured fields
    let rawSalary: string | undefined = undefined;
    if (data.salaryRange?.min && data.salaryRange?.max) {
      const currency = data.salaryRange.currency ? data.salaryRange.currency.trim().toUpperCase() : '';
      const currPrefix = currency === 'USD' || currency === '$' ? '$' : (currency === 'EUR' || currency === '€' ? '€' : (currency === 'GBP' || currency === '£' ? '£' : ''));
      const currSuffix = currPrefix ? '' : (currency ? ` ${currency}` : '');
      rawSalary = `${currPrefix}${data.salaryRange.min} - ${currPrefix}${data.salaryRange.max}${currSuffix} / ${data.salaryRange.interval || 'year'}`;
    }

    return {
      sourceId: rawPayload.sourceId,
      externalJobId: data.id,
      rawTitle: data.text || 'Untitled Role',
      rawDescription: description || 'No description provided.',
      rawDescriptionHtml: data.description || null,
      rawLocations,
      rawSalary,
      rawPostedAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
      rawEmploymentType: data.categories?.commitment || undefined,
      rawWorkplaceType,
      // INVARIANT: Never synthesize /apply suffix. Only use explicit data.applyUrl if provided by Lever API.
      rawApplyUrl: data.applyUrl || undefined,
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

  public async resolveApplicationUrl(candidate: JobCandidate, raw: RawJob): Promise<string> {
    // INVARIANT: Never synthesize application URLs.
    if (raw.rawApplyUrl) return raw.rawApplyUrl;
    return raw.sourceJobUrl || candidate.sourceJobUrl || '';
  }
}
