export type HealthStatus = 'healthy' | 'degraded' | 'failing' | 'disabled';
export type SourceType = 'ats_direct' | 'aggregator' | 'sitemap' | 'feed' | 'manual';
export type DiscoveryMethod = 'manual' | 'auto_detected' | 'sitemap' | 'api';

export interface ATSPlatform {
  id: string;
  name: string;
  slug: string;
  domains: string[];
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
