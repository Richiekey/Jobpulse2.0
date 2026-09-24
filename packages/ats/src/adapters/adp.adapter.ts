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

interface ADPRequisitionLocation {
  address?: {
    cityName?: string;
    countrySubdivisionLevel1?: {
      codeValue?: string;
    };
    countryCode?: string;
  };
}

interface ADPJobRequisition {
  customJobID?: string;
  itemID?: string;
  requisitionTitle?: string;
  requisitionDescription?: string;
  requisitionLocations?: ADPRequisitionLocation[];
  postDate?: string;
}

interface ADPResponse {
  jobRequisitions?: ADPJobRequisition[];
}

export class ADPAdapter implements ATSAdapter {
  public readonly platformSlug = 'adp';
  public readonly parserVersion = 'adp_v1';

  public detect(url: string): ATSDetectionResult {
    const pattern = /workforcenow\.adp\.com.*[?&]cid=([a-zA-Z0-9_-]+)/i;
    const match = url.match(pattern);

    if (match && match[1]) {
      return {
        detected: true,
        atsType: 'adp',
        boardIdentifier: match[1].toLowerCase(),
        confidence: 0.99,
        sourceUrl: url,
      };
    }

    if (url.includes('workforcenow.adp.com')) {
      return {
        detected: true,
        atsType: 'adp',
        boardIdentifier: 'adp-general',
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
    const cid = config.sourceIdentifier;
    const url = `https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions?cid=${cid}`;

    try {
      const response = await httpClient.get<ADPResponse>(url, { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      const jobs = response.data?.jobRequisitions || [];

      if (response.status === 200 && Array.isArray(jobs)) {
        return {
          isValid: true,
          atsType: 'adp',
          boardIdentifier: cid,
          jobsDiscoveredCount: jobs.length,
          sampleJobTitles: jobs.slice(0, 3).map((j) => j.requisitionTitle || 'Untitled'),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'adp',
        boardIdentifier: cid,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `ADP returned HTTP ${response.status}`,
        durationMs,
      };
    } catch (err: unknown) {
      return {
        isValid: false,
        atsType: 'adp',
        boardIdentifier: cid,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err instanceof Error ? err.message : 'Validation request failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const cid = companySource.sourceIdentifier;
    const url = `https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions?cid=${cid}`;

    const response = await httpClient.get<ADPResponse>(url);
    const jobs = response.data?.jobRequisitions || [];

    return jobs.map((job) => {
      const jobId = String(job.customJobID || job.itemID);
      const applyUrl = `https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=${cid}&jobId=${jobId}`;
      return {
        sourceId: companySource.sourceId,
        externalJobId: jobId,
        discoveryUrl: url,
        sourceJobUrl: applyUrl,
        companyIdentifier: cid,
      };
    });
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const url = `https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions?cid=${candidate.companyIdentifier}`;
    let payload: Record<string, unknown> = { id: candidate.externalJobId, url: candidate.sourceJobUrl };

    try {
      const response = await httpClient.get<ADPResponse>(url, { timeoutMs: 12000 });
      if (response.status === 200 && response.data?.jobRequisitions) {
        const found = response.data.jobRequisitions.find(
          (j) => String(j.customJobID || j.itemID) === candidate.externalJobId
        );
        if (found) {
          payload = found as unknown as Record<string, unknown>;
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
    const data = rawPayload.payload as unknown as ADPJobRequisition;
    const title = data.requisitionTitle || 'Untitled Role';

    const locationSet = new Set<string>();
    if (Array.isArray(data.requisitionLocations)) {
      for (const loc of data.requisitionLocations) {
        const city = loc.address?.cityName;
        const state = loc.address?.countrySubdivisionLevel1?.codeValue;
        const country = loc.address?.countryCode;
        const parts = [city, state, country].filter(Boolean);
        if (parts.length > 0) locationSet.add(parts.join(', '));
      }
    }

    const rawLocations = Array.from(locationSet);
    const description = data.requisitionDescription || `<p>${title}</p>`;
    const externalJobId = String(data.customJobID || data.itemID || rawPayload.externalId);
    const applyUrl = `https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=${rawPayload.sourceId}&jobId=${externalJobId}`;

    return {
      sourceId: rawPayload.sourceId,
      externalJobId,
      rawTitle: title,
      rawDescription: description,
      rawLocations,
      rawPostedAt: data.postDate,
      rawApplyUrl: applyUrl,
      sourceJobUrl: applyUrl,
      discoveryUrl: `https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions?cid=${rawPayload.sourceId}`,
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
    return `https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=${candidate.companyIdentifier}&jobId=${candidate.externalJobId}`;
  }
}
