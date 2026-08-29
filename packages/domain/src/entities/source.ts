export type HealthStatus = 'healthy' | 'degraded' | 'failing' | 'disabled';
export type SourceType = 'employer_ats' | 'aggregator' | 'job_board' | 'career_site' | 'manual';
export type DiscoveryMethod = 'manual' | 'auto_detected' | 'sitemap' | 'api';

export interface ATSPlatform {
  id: string;
  name: string;
  slug: string;
  domains: string[];
  isImplemented: boolean;
  capabilities: {
    hasPublicApi: boolean;
    supportsIncrementalSync: boolean;
    providesStructuredData: boolean;
    requiresBrowserRendering: boolean;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IngestionSource {
  id: string;
  atsPlatformId?: string | null;
  type: SourceType;
  name: string;
  domain: string;
  adapterName: string;
  status: HealthStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySourceConfig {
  id: string;
  companyId: string;
  sourceId: string;
  sourceIdentifier: string; // e.g. "stripe" or board token
  sourceUrl?: string | null;
  adapterConfig: Record<string, unknown>;
  isActive: boolean;
  healthStatus: HealthStatus;
  priority: number;
  scheduleIntervalMinutes: number;
  consecutiveFailures: number;
  lastCheckedAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastError?: string | null;
  lastJobCount: number;
  discoveryMethod: DiscoveryMethod;
  createdAt: string;
  updatedAt: string;
}

export interface SourceValidationResult {
  isValid: boolean;
  atsType: string;
  boardIdentifier: string;
  jobsDiscoveredCount: number;
  sampleJobTitles: string[];
  error?: string | null;
  durationMs: number;
}

export interface ATSDetectionResult {
  detected: boolean;
  atsType: string | null;
  boardIdentifier: string | null;
  confidence: number;
  sourceUrl: string;
}

export class CompanySourceNormalizer {
  /**
   * Deterministically normalizes a source URL by removing tracking params,
   * fragments, trailing slashes, and standardizing HTTPS protocol.
   */
  public static normalizeSourceUrl(rawUrl?: string | null): string | null {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    try {
      let target = rawUrl.trim();
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = `https://${target}`;
      }
      const parsed = new URL(target);
      parsed.protocol = 'https:';
      parsed.hash = '';

      // Strip common analytics and tracking parameters
      const paramsToStrip = ['gh_src', 'lever-origin', 'lever-source', 'source', 'utm_source', 'utm_medium', 'utm_campaign', 'ref'];
      for (const p of paramsToStrip) {
        parsed.searchParams.delete(p);
      }

      let clean = parsed.toString();
      if (clean.endsWith('/') && parsed.pathname !== '/') {
        clean = clean.slice(0, -1);
      }
      return clean;
    } catch {
      return rawUrl.trim();
    }
  }

  /**
   * Deterministically normalizes a source identifier (board token / slug).
   */
  public static normalizeIdentifier(rawIdentifier: string): string {
    return (rawIdentifier || '').toLowerCase().trim();
  }
}
