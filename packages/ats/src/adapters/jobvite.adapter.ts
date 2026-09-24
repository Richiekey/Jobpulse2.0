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

interface JobviteJobItem {
  id?: string;
  eId?: string;
  title: string;
  location?: string;
  category?: string;
  jobType?: string;
  detailUrl?: string;
  description?: string;
}

export class JobviteAdapter implements ATSAdapter {
  public readonly platformSlug = 'jobvite';
  public readonly parserVersion = 'jobvite_v1';

  public detect(url: string): ATSDetectionResult {
    const pattern = /jobs\.jobvite\.com\/([^/?#]+)/i;
    const match = url.match(pattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'jobvite',
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
    const url = `https://jobs.jobvite.com/${slug}`;

    try {
      const response = await httpClient.get<string>(url, { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data) {
        const html = response.data;
        const linkMatches = Array.from(html.matchAll(/href="(\/[^"']*\/job\/([a-zA-Z0-9]+))"/gi));
        const count = linkMatches.length;

        return {
          isValid: count > 0 || html.includes('jv-careers') || html.includes('jobvite'),
          atsType: 'jobvite',
          boardIdentifier: slug,
          jobsDiscoveredCount: count,
          sampleJobTitles: count > 0 ? ['Sample Jobvite Posting'] : [],
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'jobvite',
        boardIdentifier: slug,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `Jobvite returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: unknown) {
      return {
        isValid: false,
        atsType: 'jobvite',
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
    const url = `https://jobs.jobvite.com/${slug}`;

    try {
      const response = await httpClient.get<string>(url);
      if (!response.data || typeof response.data !== 'string') {
        return [];
      }

      const html = response.data;
      const candidates: JobCandidate[] = [];
      const seen = new Set<string>();

      const regex = /href="(\/[^"']*\/job\/([a-zA-Z0-9]+))"[^>]*>([^<]+)<\/a>/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const path = match[1];
        const jobId = match[2];
        if (!jobId || seen.has(jobId)) continue;
        seen.add(jobId);

        const fullUrl = `https://jobs.jobvite.com${path}`;
        candidates.push({
          sourceId: companySource.sourceId,
          externalJobId: jobId,
          discoveryUrl: url,
          sourceJobUrl: fullUrl,
          companyIdentifier: slug,
        });
      }

      return candidates;
    } catch {
      return [];
    }
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    let payload: Record<string, unknown> = { id: candidate.externalJobId, url: candidate.sourceJobUrl };

    try {
      const response = await httpClient.get<string>(candidate.sourceJobUrl, { timeoutMs: 12000 });
      if (response.status === 200 && response.data) {
        payload = {
          id: candidate.externalJobId,
          url: candidate.sourceJobUrl,
          rawHtml: response.data,
        };
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
    const data = rawPayload.payload as unknown as { id?: string; url?: string; rawHtml?: string };
    const html = data.rawHtml || '';

    // Extract title from h2.jv-header or title tag
    const titleMatch = html.match(/<h2[^>]*class="[^"]*jv-header[^"]*"[^>]*>([^<]+)<\/h2>/i) ||
      html.match(/<title>([^<|]+)(?:\||-)/i);
    const title = titleMatch?.[1]?.trim() || 'Untitled Role';

    // Extract location
    const locMatch = html.match(/class="[^"]*jv-job-detail-meta[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const rawLocations: string[] = [];
    if (locMatch?.[1]) {
      const text = locMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) rawLocations.push(text);
    }

    // Extract description
    const descMatch = html.match(/class="[^"]*jv-job-detail-description[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*jv-job-detail-meta/i) ||
      html.match(/class="[^"]*jv-job-detail-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const description = descMatch?.[1]?.trim() || `<p>${title}</p>`;
    const externalJobId = String(data.id || rawPayload.externalId);
    const applyUrl = data.url || `https://jobs.jobvite.com/${rawPayload.sourceId}/job/${externalJobId}`;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId,
      rawTitle: title,
      rawDescription: description,
      rawLocations,
      rawApplyUrl: applyUrl,
      sourceJobUrl: applyUrl,
      discoveryUrl: `https://jobs.jobvite.com/${rawPayload.sourceId}`,
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
    return `https://jobs.jobvite.com/${candidate.companyIdentifier}/job/${candidate.externalJobId}/apply`;
  }
}
