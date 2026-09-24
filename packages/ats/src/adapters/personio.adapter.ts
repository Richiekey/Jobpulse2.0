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

interface PersonioPosition {
  id: string;
  name: string;
  office?: string;
  department?: string;
  employmentType?: string;
  description?: string;
}

export class PersonioAdapter implements ATSAdapter {
  public readonly platformSlug = 'personio';
  public readonly parserVersion = 'personio_v1';

  public detect(url: string): ATSDetectionResult {
    const pattern = /([a-zA-Z0-9_-]+)\.jobs\.personio\.(?:com|de)/i;
    const match = url.match(pattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'personio',
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
    const url = `https://${slug}.jobs.personio.com/xml`;

    try {
      const response = await httpClient.get<string>(url, { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data) {
        const xml = response.data;
        const matches = Array.from(xml.matchAll(/<position>[\s\S]*?<id>([^<]+)<\/id>[\s\S]*?<name>([^<]+)<\/name>/gi));
        const count = matches.length;

        return {
          isValid: count > 0 || xml.includes('<work-descriptions>') || xml.includes('personio'),
          atsType: 'personio',
          boardIdentifier: slug,
          jobsDiscoveredCount: count,
          sampleJobTitles: matches.slice(0, 3).map((m) => m[2]?.trim() || '').filter(Boolean),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'personio',
        boardIdentifier: slug,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `Personio returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: unknown) {
      return {
        isValid: false,
        atsType: 'personio',
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
    const url = `https://${slug}.jobs.personio.com/xml`;

    try {
      const response = await httpClient.get<string>(url);
      if (!response.data || typeof response.data !== 'string') {
        return [];
      }

      const xml = response.data;
      const candidates: JobCandidate[] = [];
      const seen = new Set<string>();

      const regex = /<position>[\s\S]*?<id>([^<]+)<\/id>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/position>/gi;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        const block = match[0];
        const idMatch = block.match(/<id>([^<]+)<\/id>/i);
        const jobId = idMatch?.[1] ? idMatch[1].trim() : '';

        if (!jobId || seen.has(jobId)) continue;
        seen.add(jobId);

        candidates.push({
          sourceId: companySource.sourceId,
          externalJobId: jobId,
          discoveryUrl: url,
          sourceJobUrl: `https://${slug}.jobs.personio.com/job/${jobId}`,
          companyIdentifier: slug,
        });
      }

      return candidates;
    } catch {
      return [];
    }
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const url = `https://${candidate.companyIdentifier}.jobs.personio.com/xml`;
    let payload: Record<string, unknown> = { id: candidate.externalJobId, url: candidate.sourceJobUrl };

    try {
      const response = await httpClient.get<string>(url, { timeoutMs: 12000 });
      if (response.status === 200 && response.data) {
        const xml = response.data;
        const posRegex = new RegExp(`<position>[\\s\\S]*?<id>${candidate.externalJobId}<\\/id>[\\s\\S]*?<\\/position>`, 'i');
        const posMatch = xml.match(posRegex);

        if (posMatch) {
          const block = posMatch[0];
          const nameMatch = block.match(/<name>([^<]+)<\/name>/i);
          const officeMatch = block.match(/<office>([^<]+)<\/office>/i);
          const deptMatch = block.match(/<department>([^<]+)<\/department>/i);
          const descMatch = block.match(/<jobDescriptions>([\s\S]*?)<\/jobDescriptions>/i);
          const empMatch = block.match(/<employmentType>([^<]+)<\/employmentType>/i);

          payload = {
            id: candidate.externalJobId,
            name: nameMatch?.[1]?.trim() || '',
            office: officeMatch?.[1]?.trim() || '',
            department: deptMatch?.[1]?.trim() || '',
            description: descMatch?.[1]?.trim() || '',
            employmentType: empMatch?.[1]?.trim() || '',
            url: candidate.sourceJobUrl,
          };
        }
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
    const data = rawPayload.payload as unknown as PersonioPosition;
    const title = data.name || 'Untitled Role';

    const rawLocations = data.office ? [data.office.trim()] : [];
    const externalJobId = String(data.id || rawPayload.externalId);
    const applyUrl = `https://${rawPayload.sourceId}.jobs.personio.com/job/${externalJobId}`;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId,
      rawTitle: title,
      rawDescription: data.description || `<p>${title}</p>`,
      rawLocations,
      rawEmploymentType: data.employmentType,
      rawApplyUrl: applyUrl,
      sourceJobUrl: applyUrl,
      discoveryUrl: `https://${rawPayload.sourceId}.jobs.personio.com/xml`,
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
    if (raw.rawApplyUrl) {
      return raw.rawApplyUrl;
    }
    return `https://${candidate.companyIdentifier}.jobs.personio.com/job/${candidate.externalJobId}`;
  }
}
