import type { ATSAdapter } from './adapter.interface.js';
import type { ATSDetectionResult } from '@jobpulse/domain';

export class UnsupportedATSError extends Error {
  constructor(atsSlug: string) {
    super(`Unsupported ATS platform or adapter not registered: "${atsSlug}". JobPulse does not permit silent fallback.`);
    this.name = 'UnsupportedATSError';
  }
}

export interface ATSDefinition {
  id: string;
  name: string;
  slug: string;
  domains: string[];
  jobUrlPatterns: RegExp[];
  capabilities: {
    hasPublicApi: boolean;
    supportsIncrementalSync: boolean;
    providesStructuredData: boolean;
    requiresBrowserRendering: boolean;
  };
}

export const ATS_DEFINITIONS: Record<string, ATSDefinition> = {
  greenhouse: {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Greenhouse',
    slug: 'greenhouse',
    domains: ['boards.greenhouse.io', 'job-boards.greenhouse.io'],
    jobUrlPatterns: [
      /boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/i,
      /job-boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/i,
    ],
    capabilities: {
      hasPublicApi: true,
      supportsIncrementalSync: false,
      providesStructuredData: true,
      requiresBrowserRendering: false,
    },
  },
  lever: {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Lever',
    slug: 'lever',
    domains: ['jobs.lever.co', 'api.lever.co'],
    jobUrlPatterns: [/jobs\.lever\.co\/([^/]+)\/([a-f0-9-]+)/i],
    capabilities: {
      hasPublicApi: true,
      supportsIncrementalSync: false,
      providesStructuredData: true,
      requiresBrowserRendering: false,
    },
  },
  ashby: {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Ashby',
    slug: 'ashby',
    domains: ['jobs.ashbyhq.com', 'api.ashbyhq.com'],
    jobUrlPatterns: [/jobs\.ashbyhq\.com\/([^/]+)\/([a-f0-9-]+)/i],
    capabilities: {
      hasPublicApi: true,
      supportsIncrementalSync: false,
      providesStructuredData: true,
      requiresBrowserRendering: false,
    },
  },
  jobright: {
    id: '00000000-0000-0000-0000-000000000005',
    name: 'Jobright',
    slug: 'jobright',
    domains: ['jobright.ai'],
    jobUrlPatterns: [/jobright\.ai\/jobs\/([a-zA-Z0-9_-]+)/i],
    capabilities: {
      hasPublicApi: false,
      supportsIncrementalSync: false,
      providesStructuredData: true,
      requiresBrowserRendering: true,
    },
  },
};

export class ATSAdapterRegistry {
  private static readonly adapters = new Map<string, () => ATSAdapter>();

  /**
   * Registers an ATS adapter factory for a given platform slug.
   */
  public static register(slug: string, factory: () => ATSAdapter): void {
    this.adapters.set(slug.toLowerCase().trim(), factory);
  }

  /**
   * Resolves the ATSAdapter instance for the given platform slug.
   * Throws UnsupportedATSError if the platform is not registered.
   */
  public static getAdapter(slug: string): ATSAdapter {
    const key = (slug || '').toLowerCase().trim();
    const factory = this.adapters.get(key);
    if (!factory) {
      throw new UnsupportedATSError(slug);
    }
    return factory();
  }

  /**
   * Checks if an adapter is registered for the given platform slug.
   */
  public static hasAdapter(slug: string): boolean {
    const key = (slug || '').toLowerCase().trim();
    return this.adapters.has(key);
  }

  /**
   * Retrieves platform definition metadata for a given slug.
   */
  public static getDefinition(slug: string): ATSDefinition | null {
    const key = (slug || '').toLowerCase().trim();
    return ATS_DEFINITIONS[key] || null;
  }

  /**
   * Returns all registered platform definitions.
   */
  public static getAllDefinitions(): ATSDefinition[] {
    return Object.values(ATS_DEFINITIONS);
  }

  /**
   * Evaluates all registered adapters to detect ATS platform from a given URL and optional HTML snippet.
   */
  public static detectATS(url: string, html?: string): ATSDetectionResult | null {
    for (const [slug, factory] of this.adapters.entries()) {
      try {
        const adapter = factory();
        const result = adapter.detect(url, html);
        if (result.detected) {
          return result;
        }
      } catch {
        // Skip adapter detection errors
      }
    }
    return null;
  }
}
