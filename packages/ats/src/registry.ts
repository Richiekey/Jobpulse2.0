import type { ATSAdapter } from './adapter.interface.js';
import type { ATSDetectionResult } from '@jobpulse/domain';

export class UnsupportedATSError extends Error {
  constructor(atsSlug: string, reason?: string) {
    super(reason || `Unsupported ATS platform: "${atsSlug}". JobPulse does not permit silent fallback.`);
    this.name = 'UnsupportedATSError';
  }
}

export class UnimplementedATSError extends UnsupportedATSError {
  constructor(atsSlug: string) {
    super(atsSlug, `ATS platform "${atsSlug}" is recognized in the platform catalog, but its adapter is not yet implemented. Source marked as discovered but unsupported.`);
    this.name = 'UnimplementedATSError';
  }
}

export class UnknownATSError extends UnsupportedATSError {
  constructor(atsSlug: string) {
    super(atsSlug, `Unknown ATS platform: "${atsSlug}". Not found in catalog.`);
    this.name = 'UnknownATSError';
  }
}

export interface ATSDefinition {
  id: string;
  name: string;
  slug: string;
  isImplemented: boolean;
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
    isImplemented: true,
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
    isImplemented: true,
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
    isImplemented: true,
    domains: ['jobs.ashbyhq.com', 'api.ashbyhq.com'],
    jobUrlPatterns: [/jobs\.ashbyhq\.com\/([^/]+)\/([a-f0-9-]+)/i],
    capabilities: {
      hasPublicApi: true,
      supportsIncrementalSync: false,
      providesStructuredData: true,
      requiresBrowserRendering: false,
    },
  },
  workday: {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Workday',
    slug: 'workday',
    isImplemented: true,
    domains: ['myworkdayjobs.com'],
    jobUrlPatterns: [/([a-zA-Z0-9_-]+(?:\.wd\d+)?)\.myworkdayjobs\.com/i],
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
    isImplemented: true,
    domains: ['jobright.ai'],
    jobUrlPatterns: [/jobright\.ai\/jobs\/([a-zA-Z0-9_-]+)/i],
    capabilities: {
      hasPublicApi: false,
      supportsIncrementalSync: false,
      providesStructuredData: true,
      requiresBrowserRendering: true,
    },
  },
  smartrecruiters: {
    id: '00000000-0000-0000-0000-000000000006',
    name: 'SmartRecruiters',
    slug: 'smartrecruiters',
    isImplemented: true,
    domains: ['smartrecruiters.com', 'jobs.smartrecruiters.com'],
    jobUrlPatterns: [/jobs\.smartrecruiters\.com\/([^/]+)\/([a-zA-Z0-9_-]+)/i],
    capabilities: {
      hasPublicApi: true,
      supportsIncrementalSync: false,
      providesStructuredData: true,
      requiresBrowserRendering: false,
    },
  },
  icims: {
    id: '00000000-0000-0000-0000-000000000007',
    name: 'iCIMS',
    slug: 'icims',
    isImplemented: true,
    domains: ['icims.com', 'jobs.icims.com', 'careers.icims.com'],
    jobUrlPatterns: [/([a-zA-Z0-9_-]+)\.icims\.com\/jobs\/(\d+)/i],
    capabilities: {
      hasPublicApi: true,
      supportsIncrementalSync: false,
      providesStructuredData: true,
      requiresBrowserRendering: false,
    },
  },
  successfactors: {
    id: '00000000-0000-0000-0000-000000000008',
    name: 'SAP SuccessFactors',
    slug: 'successfactors',
    isImplemented: true,
    domains: ['successfactors.com', 'successfactors.eu'],
    jobUrlPatterns: [/career\d*\.successfactors\.(?:com|eu)/i],
    capabilities: {
      hasPublicApi: true,
      supportsIncrementalSync: false,
      providesStructuredData: true,
      requiresBrowserRendering: false,
    },
  },
  oracle: {
    id: '00000000-0000-0000-0000-000000000009',
    name: 'Oracle Cloud HCM',
    slug: 'oracle',
    isImplemented: true,
    domains: ['oraclecloud.com', 'taleo.net'],
    jobUrlPatterns: [/oraclecloud\.com\/.*\/requisition\/(\d+)/i, /taleo\.net/i],
    capabilities: {
      hasPublicApi: true,
      supportsIncrementalSync: false,
      providesStructuredData: true,
      requiresBrowserRendering: false,
    },
  },
  workable: {
    id: '00000000-0000-0000-0000-000000000010',
    name: 'Workable',
    slug: 'workable',
    isImplemented: false,
    domains: ['apply.workable.com', 'workable.com'],
    jobUrlPatterns: [/apply\.workable\.com\/([^/]+)\/j\/([a-zA-Z0-9_-]+)/i],
    capabilities: {
      hasPublicApi: true,
      supportsIncrementalSync: false,
      providesStructuredData: true,
      requiresBrowserRendering: false,
    },
  },
  bamboohr: {
    id: '00000000-0000-0000-0000-000000000011',
    name: 'BambooHR',
    slug: 'bamboohr',
    isImplemented: false,
    domains: ['bamboohr.com'],
    jobUrlPatterns: [/([a-zA-Z0-9_-]+)\.bamboohr\.com\/careers\/(\d+)/i],
    capabilities: {
      hasPublicApi: true,
      supportsIncrementalSync: false,
      providesStructuredData: true,
      requiresBrowserRendering: false,
    },
  },
};

export class ATSAdapterRegistry {
  private static readonly adapters = new Map<string, () => ATSAdapter>();

  /**
   * Registers an ATS adapter factory for a given platform slug.
   */
  public static register(slug: string, factory: () => ATSAdapter): void {
    const key = slug.toLowerCase().trim();
    this.adapters.set(key, factory);
    if (ATS_DEFINITIONS[key]) {
      ATS_DEFINITIONS[key].isImplemented = true;
    }
  }

  /**
   * Unregisters an ATS adapter (useful for isolated testing).
   */
  public static unregister(slug: string): void {
    const key = slug.toLowerCase().trim();
    this.adapters.delete(key);
  }

  /**
   * Resolves the ATSAdapter instance for the given platform slug.
   * Throws UnimplementedATSError if known but not implemented,
   * or UnknownATSError if completely unrecognized.
   */
  public static getAdapter(slug: string): ATSAdapter {
    const key = (slug || '').toLowerCase().trim();
    const factory = this.adapters.get(key);
    if (factory) {
      return factory();
    }

    if (ATS_DEFINITIONS[key]) {
      throw new UnimplementedATSError(slug);
    }

    throw new UnknownATSError(slug);
  }

  /**
   * Checks if an adapter implementation is registered.
   */
  public static hasAdapter(slug: string): boolean {
    const key = (slug || '').toLowerCase().trim();
    return this.adapters.has(key);
  }

  /**
   * Checks if an ATS platform exists in the catalog.
   */
  public static isKnownPlatform(slug: string): boolean {
    const key = (slug || '').toLowerCase().trim();
    return Boolean(ATS_DEFINITIONS[key]);
  }

  /**
   * Retrieves all registered ATS adapter instances.
   */
  public static getAllAdapters(): ATSAdapter[] {
    return Array.from(this.adapters.values()).map((factory) => factory());
  }

  /**
   * Retrieves all registered platform slugs.
   */
  public static getAllRegisteredSlugs(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Retrieves platform definition metadata for a given slug.
   */
  public static getDefinition(slug: string): ATSDefinition | null {
    const key = (slug || '').toLowerCase().trim();
    return ATS_DEFINITIONS[key] || null;
  }

  /**
   * Returns all platform definitions in the catalog.
   */
  public static getAllDefinitions(): ATSDefinition[] {
    return Object.values(ATS_DEFINITIONS);
  }

  /**
   * Evaluates all registered adapters to detect ATS platform from a given URL and optional HTML snippet.
   */
  public static detectATS(url: string, html?: string): ATSDetectionResult | null {
    for (const [_, factory] of this.adapters.entries()) {
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
