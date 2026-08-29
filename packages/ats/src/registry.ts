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

export const ATS_REGISTRY: Record<string, ATSDefinition> = {
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
  workday: {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Workday',
    slug: 'workday',
    domains: ['myworkdayjobs.com'],
    jobUrlPatterns: [/([a-zA-Z0-9_-]+)\.myworkdayjobs\.com/i],
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

export function detectATSFromUrl(url: string): ATSDefinition | null {
  try {
    const parsed = new URL(url);
    for (const def of Object.values(ATS_REGISTRY)) {
      if (def.domains.some((d) => parsed.hostname.includes(d))) {
        return def;
      }
    }
  } catch {
    return null;
  }
  return null;
}
