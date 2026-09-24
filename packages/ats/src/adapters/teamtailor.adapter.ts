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

export class TeamtailorAdapter implements ATSAdapter {
  public readonly platformSlug = 'teamtailor';
  public readonly parserVersion = 'teamtailor_v1';

  public detect(url: string): ATSDetectionResult {
    const pattern = /([a-zA-Z0-9_-]+)\.teamtailor\.com/i;
    const match = url.match(pattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'teamtailor',
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
    const url = `https://${slug}.teamtailor.com/jobs`;

    try {
      const response = await httpClient.get<string>(url, { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data) {
        const html = response.data;
        const matches = Array.from(html.matchAll(/href="([^"']*\/jobs\/(\d+)[^"']*)"/gi));
        const count = matches.length;

        return {
          isValid: count > 0 || html.includes('teamtailor'),
          atsType: 'teamtailor',
          boardIdentifier: slug,
          jobsDiscoveredCount: count,
          sampleJobTitles: count > 0 ? ['Sample Teamtailor Role'] : [],
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'teamtailor',
        boardIdentifier: slug,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `Teamtailor returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: unknown) {
      return {
        isValid: false,
        atsType: 'teamtailor',
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
    const url = `https://${slug}.teamtailor.com/jobs`;

    try {
      const response = await httpClient.get<string>(url);
      if (!response.data || typeof response.data !== 'string') {
        return [];
      }

      const html = response.data;
      const candidates: JobCandidate[] = [];
      const seen = new Set<string>();

      const regex = /href="([^"']*\/jobs\/(\d+)[^"']*)"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const link = match[1];
        const jobId = match[2];
        if (!link || !jobId || seen.has(jobId)) continue;
        seen.add(jobId);

        const fullUrl = link.startsWith('http')
          ? link
          : `https://${slug}.teamtailor.com${link}`;

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

    // Title match
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
      html.match(/<title>([^<|]+)(?:\||-)/i);
    const title = titleMatch?.[1]?.trim() || 'Untitled Role';

    // Description match
    const descMatch = html.match(/<section[^>]*class="[^"]*body[^"]*"[^>]*>([\s\S]*?)<\/section>/i) ||
      html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const description = descMatch?.[1]?.trim() || `<p>${title}</p>`;

    const externalJobId = String(data.id || rawPayload.externalId);
    const applyUrl = data.url || `https://${rawPayload.sourceId}.teamtailor.com/jobs/${externalJobId}`;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId,
      rawTitle: title,
      rawDescription: description,
      rawLocations: [],
      rawApplyUrl: applyUrl,
      sourceJobUrl: applyUrl,
      discoveryUrl: `https://${rawPayload.sourceId}.teamtailor.com/jobs`,
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
    return `https://${candidate.companyIdentifier}.teamtailor.com/jobs/${candidate.externalJobId}`;
  }
}
