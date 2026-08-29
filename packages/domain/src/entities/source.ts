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
}

export interface IngestionSource {
  id: string;
  atsPlatformId?: string | null;
  type: 'ats_direct' | 'aggregator' | 'sitemap' | 'feed' | 'manual';
  name: string;
  domain: string;
  adapterName: string;
  status: 'healthy' | 'degraded' | 'failing' | 'disabled';
  metadata: Record<string, unknown>;
}
