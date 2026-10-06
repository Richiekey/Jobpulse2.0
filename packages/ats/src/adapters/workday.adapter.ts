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
import { httpClient, logger } from '@jobpulse/shared';
import type { ATSAdapter } from '../adapter.interface.js';

export interface WorkdayJobPostingListItem {
  title: string;
  externalPath: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
  subtitles?: string[];
}

export interface WorkdayJobListResponse {
  total: number;
  jobPostings: WorkdayJobPostingListItem[];
  facets?: unknown[];
  userAuthenticated?: boolean;
}

export interface WorkdayJobPostingDetail {
  id?: string;
  title: string;
  externalPath?: string;
  jobReqId?: string;
  jobDescription?: string;
  location?: string;
  additionalLocations?: string[];
  timeType?: string;
  postedOn?: string;
  startDate?: string;
  externalUrl?: string;
  applyUrl?: string;
  country?: { descriptor?: string; id?: string };
}

export interface WorkdayJobDetailResponse {
  jobPostingInfo: WorkdayJobPostingDetail;
}

export interface WorkdayTenantConfig {
  host: string;
  tenant: string;
  site: string;
}

export class WorkdayAdapter implements ATSAdapter {
  public readonly platformSlug = 'workday';
  public readonly parserVersion = 'workday_v1';

  private static readonly DEFAULT_PAGE_SIZE = 20;
  private static readonly MAX_PAGES = 50; // Guard against runaway pagination (up to 1,000 jobs per run)

  /**
   * Parses and extracts Workday host, tenant, and site from a URL, sourceIdentifier, or config.
   *
   * Precedence:
   *   1. Explicit adapterConfig with host + tenant + site
   *   2. Canonical 3-part sourceIdentifier: tenant/wdN/site
   *   3. Valid sourceUrl (preserves shard from hostname)
   *   4. 2-part sourceIdentifier: only if host/shard is available elsewhere
   *   5. Full host/site sourceIdentifier: tenant.wdN.myworkdayjobs.com/site
   *
   * A 2-part identifier without shard information returns null (invalid_configuration).
   */
  public static parseConfig(source: {
    sourceUrl?: string | null;
    sourceIdentifier?: string;
    adapterConfig?: any;
  }): WorkdayTenantConfig | null {
    // 1. Explicit adapter config (highest priority)
    if (source.adapterConfig && typeof source.adapterConfig === 'object') {
      const { host, tenant, site } = source.adapterConfig;
      if (host && tenant && site) {
        return { host, tenant, site };
      }
    }

    const identifier = (source.sourceIdentifier || '').trim();

    // 2. Canonical 3-part identifier: tenant/wdN/site (e.g. nvidia/wd5/NVIDIAExternalCareerSite)
    if (identifier) {
      const threePartMatch = identifier.match(/^([a-zA-Z0-9_-]+)\/(wd\d+)\/([a-zA-Z0-9_-]+)$/);
      if (threePartMatch) {
        const tenant = threePartMatch[1]!.toLowerCase();
        const shard = threePartMatch[2]!;
        const site = threePartMatch[3]!;
        return {
          host: `${tenant}.${shard}.myworkdayjobs.com`,
          tenant,
          site,
        };
      }
    }

    // 3. Parse from sourceUrl (preserves shard in hostname)
    const urlStr = source.sourceUrl || '';
    if (urlStr) {
      const parsed = WorkdayAdapter.parseWorkdayUrl(urlStr);
      if (parsed) {
        return parsed;
      }
    }

    // 4. Full host/site identifier: tenant.wdN.myworkdayjobs.com/site
    if (identifier && identifier.includes('/')) {
      const parts = identifier.split('/');
      const first = parts[0]!;
      const site = parts[parts.length - 1]!; // last segment is always the site

      if (first.includes('myworkdayjobs.com')) {
        const tenantMatch = first.match(/^([a-zA-Z0-9_-]+)/);
        const tenant = tenantMatch ? tenantMatch[1]!.toLowerCase() : first;
        return { host: first, tenant, site };
      }

      // 5. 2-part identifier (tenant/site) — only valid if we can get shard from sourceUrl
      if (parts.length === 2) {
        // Try to extract shard from sourceUrl even if full parse failed
        if (urlStr) {
          try {
            const u = new URL(urlStr);
            const shardMatch = u.host.match(/\.(wd\d+)\./);
            if (shardMatch) {
              const tenant = first.toLowerCase();
              return {
                host: `${tenant}.${shardMatch[1]}.myworkdayjobs.com`,
                tenant,
                site,
              };
            }
          } catch {
            // Fall through
          }
        }
        // 2-part without shard is insufficient — return null (invalid_configuration)
        return null;
      }
    }

    return null;
  }

  /**
   * Parses a Workday myworkdayjobs.com URL into tenant config.
   * Correctly preserves the shard (e.g. wd5) in the host.
   */
  private static parseWorkdayUrl(urlStr: string): WorkdayTenantConfig | null {
    try {
      const parsedUrl = new URL(urlStr);
      const host = parsedUrl.host;

      // Host pattern: {tenant}.wd{n}.myworkdayjobs.com or {tenant}.myworkdayjobs.com
      const hostMatch = host.match(/^([a-zA-Z0-9_-]+)(?:\.(wd\d+))?\.myworkdayjobs\.com$/i);
      if (!hostMatch) return null;

      const tenant = hostMatch[1]!.toLowerCase();

      // Path pattern: /[locale]/{site}[/...] or /{site}[/...]
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      let site: string | null = null;

      if (pathSegments.length > 0) {
        // If first segment is a locale (e.g. en-US, fr-CA, etc.), second segment is site
        if (/^[a-z]{2}(?:-[A-Z]{2})?$/i.test(pathSegments[0]!)) {
          site = pathSegments[1] || null;
        } else {
          site = pathSegments[0] || null;
        }
      }

      if (!site) return null;

      // Use the full host as-is (preserves shard)
      return { host, tenant, site };
    } catch {
      return null;
    }
  }


  public detect(url: string, html?: string): ATSDetectionResult {
    // 1. Direct URL pattern match
    const workdayUrlPattern = /https?:\/\/([a-zA-Z0-9_-]+(?:\.wd\d+)?\.myworkdayjobs\.com)\/(?:[a-zA-Z]{2}(?:-[a-zA-Z]{2})?\/)?([^/?#]+)/i;
    const match = url.match(workdayUrlPattern);

    if (match && match[1] && match[2]) {
      const host = match[1];
      const site = match[2];
      const tenantMatch = host.match(/^([a-zA-Z0-9_-]+)/);
      const tenant = tenantMatch ? tenantMatch[1]!.toLowerCase() : 'workday';

      return {
        detected: true,
        atsType: 'workday',
        boardIdentifier: `${tenant}/${site}`,
        confidence: 0.99,
        sourceUrl: url,
      };
    }

    // 2. Embedded HTML detection
    if (html && (html.includes('myworkdayjobs.com') || html.includes('data-automation-id="workday"'))) {
      const embedMatch = html.match(/https?:\/\/([a-zA-Z0-9_-]+(?:\.wd\d+)?\.myworkdayjobs\.com)\/(?:[a-zA-Z]{2}(?:-[a-zA-Z]{2})?\/)?([a-zA-Z0-9_#-]+)/i);
      if (embedMatch && embedMatch[1] && embedMatch[2]) {
        const host = embedMatch[1];
        const site = embedMatch[2];
        const tenantMatch = host.match(/^([a-zA-Z0-9_-]+)/);
        const tenant = tenantMatch ? tenantMatch[1]!.toLowerCase() : 'workday';

        return {
          detected: true,
          atsType: 'workday',
          boardIdentifier: `${tenant}/${site}`,
          confidence: 0.90,
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
    const parsed = WorkdayAdapter.parseConfig(config);

    if (!parsed) {
      return {
        isValid: false,
        atsType: 'workday',
        boardIdentifier: config.sourceIdentifier,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: 'INVALID_CONFIGURATION: Unable to parse Workday tenant configuration (host, tenant, and site required)',
        durationMs: Date.now() - start,
      };
    }

    const { host, tenant, site } = parsed;
    const url = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;

    try {
      const response = await httpClient.post<WorkdayJobListResponse>(
        url,
        {
          appliedFacets: {},
          limit: WorkdayAdapter.DEFAULT_PAGE_SIZE,
          offset: 0,
          searchText: '',
        },
        {
          timeoutMs: 15000,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );

      const durationMs = Date.now() - start;

      if (response.status === 200 && response.data && typeof response.data.total === 'number' && Array.isArray(response.data.jobPostings)) {
        return {
          isValid: true,
          atsType: 'workday',
          boardIdentifier: `${tenant}/${site}`,
          jobsDiscoveredCount: response.data.total,
          sampleJobTitles: response.data.jobPostings.slice(0, 3).map((j) => j.title),
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: 'workday',
        boardIdentifier: `${tenant}/${site}`,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: `Workday CXS API returned HTTP ${response.status} or malformed response`,
        durationMs,
      };
    } catch (err: any) {
      return {
        isValid: false,
        atsType: 'workday',
        boardIdentifier: `${tenant}/${site}`,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err.message || 'Workday validation request failed',
        durationMs: Date.now() - start,
      };
    }
  }

  public async discover(companySource: CompanySourceConfig): Promise<JobCandidate[]> {
    const parsed = WorkdayAdapter.parseConfig(companySource);
    if (!parsed) {
      throw new Error('INVALID_CONFIGURATION: Unable to construct valid Workday host/tenant/site');
    }

    const { host, tenant, site } = parsed;
    const endpoint = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
    const candidates: JobCandidate[] = [];
    const seenJobIds = new Set<string>();

    let offset = 0;
    const limit = WorkdayAdapter.DEFAULT_PAGE_SIZE;
    let total = Infinity;
    let pageCount = 0;

    while (offset < total && pageCount < WorkdayAdapter.MAX_PAGES) {
      pageCount++;

      try {
        const response = await httpClient.post<WorkdayJobListResponse>(
          endpoint,
          {
            appliedFacets: {},
            limit,
            offset,
            searchText: '',
          },
          {
            timeoutMs: 15000,
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          }
        );

        if (response.status !== 200) {
          if (pageCount === 1) {
            throw new Error(`HTTP_ERROR: Workday CXS API returned HTTP ${response.status}`);
          } else {
            break; // Stop pagination on subsequent failures
          }
        }

        if (!response.data || !Array.isArray(response.data.jobPostings)) {
          if (pageCount === 1) {
            throw new Error('ADAPTER_ERROR: Malformed successful response missing jobPostings array');
          } else {
            break;
          }
        }

        total = typeof response.data.total === 'number' ? response.data.total : 0;
        const postings = response.data.jobPostings;

        if (postings.length === 0) {
          break;
        }

        for (const job of postings) {
          if (!job || !job.title || !job.externalPath) {
            continue; // Skip malformed item
          }

          // Extract job external ID from bulletFields (e.g. "JR12345") or externalPath (e.g. "/job/..._JR12345")
          let externalJobId = '';
          if (Array.isArray(job.bulletFields) && job.bulletFields.length > 0) {
            externalJobId = job.bulletFields[0]!.trim();
          }

          if (!externalJobId) {
            const pathMatch = job.externalPath.match(/_([a-zA-Z0-9-]+)$/);
            if (pathMatch) {
              externalJobId = pathMatch[1]!;
            } else {
              externalJobId = job.externalPath.replace(/^\/job\//, '').replace(/\//g, '_');
            }
          }

          if (!externalJobId || seenJobIds.has(externalJobId)) {
            continue; // Skip duplicate within the same crawl run
          }
          seenJobIds.add(externalJobId);

          const sourceJobUrl = `https://${host}/en-US/${site}${job.externalPath}`;

          candidates.push({
            sourceId: companySource.sourceId,
            externalJobId,
            discoveryUrl: endpoint,
            sourceJobUrl,
            companyIdentifier: `${tenant}/${site}`,
          });
        }

        offset += postings.length;
      } catch (err) {
        if (pageCount === 1) {
          throw err;
        }
        // Stop pagination on unrecoverable network/server error for subsequent pages, return what we discovered
        break;
      }
    }

    const isComplete = total === Infinity ? true : candidates.length >= total;
    if (!isComplete && total > 0) {
      logger.warn(`[Workday] Incomplete crawl for ${tenant}/${site}: discovered ${candidates.length} of ${total} jobs across ${pageCount} pages (safety cap reached)`);
    }

    Object.defineProperty(candidates, 'isComplete', {
      value: isComplete,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    return candidates;
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const [tenant, site] = candidate.companyIdentifier.split('/');
    let host = '';

    try {
      const url = new URL(candidate.sourceJobUrl);
      host = url.host;
    } catch {
      host = `${tenant}.myworkdayjobs.com`;
    }

    // Extract externalPath from sourceJobUrl
    let externalPath = '';
    try {
      const url = new URL(candidate.sourceJobUrl);
      const pathParts = url.pathname.split(`/${site}`);
      if (pathParts.length > 1) {
        externalPath = pathParts[1]!;
      }
    } catch {
      // Fallback
    }

    if (!externalPath) {
      externalPath = `/job/${candidate.externalJobId}`;
    }

    const detailUrl = `https://${host}/wday/cxs/${tenant}/${site}${externalPath}`;

    const response = await httpClient.get<WorkdayJobDetailResponse>(detailUrl, {
      timeoutMs: 12000,
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.status !== 200 || !response.data || !response.data.jobPostingInfo) {
      throw new Error(`Workday job detail fetch failed for candidate ${candidate.externalJobId} at ${detailUrl} with HTTP ${response.status}`);
    }

    const payload = {
      ...(response.data.jobPostingInfo as unknown as Record<string, unknown>),
      sourceJobUrl: candidate.sourceJobUrl,
    };
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
    const data = rawPayload.payload as unknown as WorkdayJobPostingDetail;

    const rawTitle = data.title || rawPayload.externalId;
    const rawDescriptionHtml = data.jobDescription || '';
    const rawDescription = rawDescriptionHtml
      ? rawDescriptionHtml
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<li[^>]*>/gi, '• ')
          .replace(/<\/li>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      : rawTitle;

    // Collect locations
    const locationSet = new Set<string>();
    if (data.location && data.location.trim()) {
      locationSet.add(data.location.trim());
    }
    if (Array.isArray(data.additionalLocations)) {
      for (const loc of data.additionalLocations) {
        if (loc && loc.trim()) {
          locationSet.add(loc.trim());
        }
      }
    }

    const rawLocations = locationSet.size > 0 ? Array.from(locationSet) : ['Unspecified'];
    const sourceJobUrl = (rawPayload.payload['sourceJobUrl'] as string) || (data.externalUrl as string) || '';
    const rawApplyUrl = data.applyUrl || (sourceJobUrl ? `${sourceJobUrl}/apply` : null);

    return {
      sourceId: rawPayload.sourceId,
      externalJobId: rawPayload.externalId,
      rawTitle,
      rawDescription,
      rawDescriptionHtml,
      rawLocations,
      rawEmploymentType: data.timeType || null,
      rawWorkplaceType: null,
      rawPostedAt: data.startDate || data.postedOn || null,
      rawApplyUrl,
      sourceJobUrl,
      discoveryUrl: sourceJobUrl,
      sourceMetadata: {
        jobReqId: data.jobReqId || rawPayload.externalId,
        timeType: data.timeType,
        country: data.country?.descriptor,
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
    if (raw.rawApplyUrl && raw.rawApplyUrl.startsWith('http')) {
      return raw.rawApplyUrl;
    }
    if (raw.sourceJobUrl && raw.sourceJobUrl.startsWith('http')) {
      return `${raw.sourceJobUrl}/apply`;
    }
    return candidate.sourceJobUrl || '';
  }
}
