import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../src/index.js';
import { WorkdayAdapter } from '../src/adapters/workday.adapter.js';
import { ATSAdapterRegistry } from '../src/registry.js';
import { httpClient } from '@jobpulse/shared';
import type { CompanySourceConfig, JobCandidate, RawJobPayload } from '@jobpulse/domain';

describe('WorkdayAdapter — Comprehensive ATS Verification', () => {
  const adapter = new WorkdayAdapter();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Tenant and Board Resolution (Multi-Tenant Parsing)', () => {
    it('parses standard Workday URL without locale', () => {
      const config = WorkdayAdapter.parseConfig({
        sourceUrl: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite',
      });
      expect(config).toEqual({
        host: 'nvidia.wd5.myworkdayjobs.com',
        tenant: 'nvidia',
        site: 'NVIDIAExternalCareerSite',
      });
    });

    it('parses Workday URL with en-US locale prefix', () => {
      const config = WorkdayAdapter.parseConfig({
        sourceUrl: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced',
      });
      expect(config).toEqual({
        host: 'adobe.wd5.myworkdayjobs.com',
        tenant: 'adobe',
        site: 'external_experienced',
      });
    });

    it('parses Workday URL with instance wd1 and language prefix', () => {
      const config = WorkdayAdapter.parseConfig({
        sourceUrl: 'https://netflix.wd1.myworkdayjobs.com/en-US/Netflix',
      });
      expect(config).toEqual({
        host: 'netflix.wd1.myworkdayjobs.com',
        tenant: 'netflix',
        site: 'Netflix',
      });
    });

    it('parses Workday URL with instance wd12', () => {
      const config = WorkdayAdapter.parseConfig({
        sourceUrl: 'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site',
      });
      expect(config).toEqual({
        host: 'salesforce.wd12.myworkdayjobs.com',
        tenant: 'salesforce',
        site: 'External_Career_Site',
      });
    });

    it('parses sourceIdentifier in tenant/site format', () => {
      const config = WorkdayAdapter.parseConfig({
        sourceIdentifier: 'target/targetcareers',
      });
      expect(config).toEqual({
        host: 'target.myworkdayjobs.com',
        tenant: 'target',
        site: 'targetcareers',
      });
    });

    it('parses sourceIdentifier in host/site format', () => {
      const config = WorkdayAdapter.parseConfig({
        sourceIdentifier: 'walmart.wd5.myworkdayjobs.com/WalmartExternal',
      });
      expect(config).toEqual({
        host: 'walmart.wd5.myworkdayjobs.com',
        tenant: 'walmart',
        site: 'WalmartExternal',
      });
    });

    it('prefers explicit adapterConfig if provided', () => {
      const config = WorkdayAdapter.parseConfig({
        adapterConfig: {
          host: 'custom.workday.com',
          tenant: 'customtenant',
          site: 'customsite',
        },
      });
      expect(config).toEqual({
        host: 'custom.workday.com',
        tenant: 'customtenant',
        site: 'customsite',
      });
    });
  });

  describe('2. ATS Detection', () => {
    it('detects Workday from standard myworkdayjobs.com URL', () => {
      const result = adapter.detect('https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite');
      expect(result.detected).toBe(true);
      expect(result.atsType).toBe('workday');
      expect(result.boardIdentifier).toBe('nvidia/NVIDIAExternalCareerSite');
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    });

    it('detects Workday from HTML snippet containing Workday URLs', () => {
      const html = '<a href="https://target.wd5.myworkdayjobs.com/targetcareers/job/123">Apply</a>';
      const result = adapter.detect('https://target.com/careers', html);
      expect(result.detected).toBe(true);
      expect(result.atsType).toBe('workday');
      expect(result.boardIdentifier).toBe('target/targetcareers');
    });

    it('returns false for non-Workday URLs', () => {
      const result = adapter.detect('https://boards.greenhouse.io/stripe');
      expect(result.detected).toBe(false);
    });
  });

  describe('3. Source Validation (Multi-Tenant)', () => {
    const mockSourceConfig: CompanySourceConfig = {
      id: 'src_wd_1',
      companyId: 'comp_1',
      sourceId: 'src_1',
      sourceIdentifier: 'nvidia/NVIDIAExternalCareerSite',
      sourceUrl: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite',
      adapterConfig: {},
      isActive: true,
      healthStatus: 'healthy',
      priority: 1,
      scheduleIntervalMinutes: 60,
      consecutiveFailures: 0,
      lastCheckedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      lastJobCount: 0,
      discoveryMethod: 'manual',
    };

    it('validates healthy Workday source and returns job counts and sample titles', async () => {
      vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
        status: 200,
        data: {
          total: 45,
          jobPostings: [
            { title: 'Senior AI Engineer', externalPath: '/job/1' },
            { title: 'GPU Architect', externalPath: '/job/2' },
          ],
        },
        headers: {},
      });

      const result = await adapter.validateSource(mockSourceConfig);
      expect(result.isValid).toBe(true);
      expect(result.jobsDiscoveredCount).toBe(45);
      expect(result.sampleJobTitles).toContain('Senior AI Engineer');
      expect(result.sampleJobTitles).toContain('GPU Architect');
    });

    it('handles HTTP error during source validation', async () => {
      vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
        status: 404,
        data: null,
        headers: {},
      });

      const result = await adapter.validateSource(mockSourceConfig);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('404');
    });

    it('handles network failure during validation', async () => {
      vi.spyOn(httpClient, 'post').mockRejectedValueOnce(new Error('Connection timed out'));

      const result = await adapter.validateSource(mockSourceConfig);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Connection timed out');
    });
  });

  describe('4. Discovery & Pagination', () => {
    const mockSourceConfig: CompanySourceConfig = {
      id: 'src_wd_2',
      companyId: 'comp_2',
      sourceId: 'src_2',
      sourceIdentifier: 'adobe/external_experienced',
      sourceUrl: 'https://adobe.wd5.myworkdayjobs.com/external_experienced',
      adapterConfig: {},
      isActive: true,
      healthStatus: 'healthy',
      priority: 1,
      scheduleIntervalMinutes: 60,
      consecutiveFailures: 0,
      lastCheckedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      lastJobCount: 0,
      discoveryMethod: 'manual',
    };

    it('discovers candidates across multiple paginated requests', async () => {
      // Page 1: offset 0, limit 20
      vi.spyOn(httpClient, 'post')
        .mockResolvedValueOnce({
          status: 200,
          data: {
            total: 3,
            jobPostings: [
              {
                title: 'Software Engineer 1',
                externalPath: '/job/San-Jose/Software-Engineer-1_R101',
                bulletFields: ['R101'],
                locationsText: 'San Jose, CA',
              },
              {
                title: 'Software Engineer 2',
                externalPath: '/job/San-Jose/Software-Engineer-2_R102',
                bulletFields: ['R102'],
                locationsText: 'San Jose, CA',
              },
            ],
          },
          headers: {},
        })
        // Page 2: offset 2
        .mockResolvedValueOnce({
          status: 200,
          data: {
            total: 3,
            jobPostings: [
              {
                title: 'Software Engineer 3',
                externalPath: '/job/San-Jose/Software-Engineer-3_R103',
                bulletFields: ['R103'],
                locationsText: 'San Jose, CA',
              },
            ],
          },
          headers: {},
        });

      const candidates = await adapter.discover(mockSourceConfig);
      expect(candidates.length).toBe(3);
      expect(candidates[0]!.externalJobId).toBe('R101');
      expect(candidates[1]!.externalJobId).toBe('R102');
      expect(candidates[2]!.externalJobId).toBe('R103');
    });

    it('handles empty discovery result gracefully', async () => {
      vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
        status: 200,
        data: {
          total: 0,
          jobPostings: [],
        },
        headers: {},
      });

      const candidates = await adapter.discover(mockSourceConfig);
      expect(candidates).toEqual([]);
    });

    it('handles malformed API response without crashing', async () => {
      vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
        status: 200,
        data: { invalid: 'payload' } as any,
        headers: {},
      });

      const candidates = await adapter.discover(mockSourceConfig);
      expect(candidates).toEqual([]);
    });

    it('skips malformed individual jobs within a valid list', async () => {
      vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
        status: 200,
        data: {
          total: 2,
          jobPostings: [
            { title: '', externalPath: '' }, // malformed
            {
              title: 'Valid Engineer',
              externalPath: '/job/Austin/Valid-Engineer_R201',
              bulletFields: ['R201'],
            },
          ],
        },
        headers: {},
      });

      const candidates = await adapter.discover(mockSourceConfig);
      expect(candidates.length).toBe(1);
      expect(candidates[0]!.externalJobId).toBe('R201');
    });

    it('deduplicates jobs with identical external ID in same crawl', async () => {
      vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
        status: 200,
        data: {
          total: 2,
          jobPostings: [
            {
              title: 'Duplicate Engineer',
              externalPath: '/job/Austin/Duplicate-Engineer_R301',
              bulletFields: ['R301'],
            },
            {
              title: 'Duplicate Engineer 2',
              externalPath: '/job/Austin/Duplicate-Engineer-Alt_R301',
              bulletFields: ['R301'],
            },
          ],
        },
        headers: {},
      });

      const candidates = await adapter.discover(mockSourceConfig);
      expect(candidates.length).toBe(1);
      expect(candidates[0]!.externalJobId).toBe('R301');
    });
  });

  describe('5. Fetch & Parse (Detailed Job Extraction)', () => {
    it('fetches and parses full job details including description and locations', async () => {
      const candidate: JobCandidate = {
        sourceId: '10000000-0000-0000-0000-000000000004',
        externalJobId: 'JR999',
        discoveryUrl: 'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs',
        sourceJobUrl: 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Santa-Clara/Senior-Architect_JR999',
        companyIdentifier: 'nvidia/NVIDIAExternalCareerSite',
      };

      vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
        status: 200,
        data: {
          jobPostingInfo: {
            title: 'Senior Deep Learning Architect',
            jobReqId: 'JR999',
            jobDescription: '<p>We are seeking a <strong>Senior Deep Learning Architect</strong>.</p><ul><li>CUDA</li><li>PyTorch</li></ul>',
            location: 'Santa Clara, CA',
            additionalLocations: ['Austin, TX', 'Remote - US'],
            timeType: 'Full time',
            postedOn: 'Posted 2 Days Ago',
            startDate: '2026-08-20',
            externalUrl: 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Santa-Clara/Senior-Architect_JR999',
            applyUrl: 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Santa-Clara/Senior-Architect_JR999/apply',
          },
        },
        headers: {},
      });

      const rawPayload = await adapter.fetch(candidate);
      expect(rawPayload.externalId).toBe('JR999');
      expect(rawPayload.parserVersion).toBe('workday_v1');

      const rawJob = await adapter.parse(rawPayload);
      expect(rawJob.rawTitle).toBe('Senior Deep Learning Architect');
      expect(rawJob.rawDescription).toContain('Senior Deep Learning Architect');
      expect(rawJob.rawDescription).toContain('• CUDA');
      expect(rawJob.rawLocations).toContain('Santa Clara, CA');
      expect(rawJob.rawLocations).toContain('Austin, TX');
      expect(rawJob.rawEmploymentType).toBe('Full time');
    });

    it('rejects with error on HTTP 404 fetch failure without creating synthetic job', async () => {
      const candidate: JobCandidate = {
        sourceId: '10000000-0000-0000-0000-000000000004',
        externalJobId: 'JR_FAIL_404',
        discoveryUrl: 'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs',
        sourceJobUrl: 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Santa-Clara/NonExistent_JR_FAIL_404',
        companyIdentifier: 'nvidia/NVIDIAExternalCareerSite',
      };

      vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
        data: null,
        headers: new Headers(),
        url: candidate.sourceJobUrl,
      } as any);

      await expect(adapter.fetch(candidate)).rejects.toThrow('HTTP 404');
    });

    it('rejects with error on HTTP 429 rate limit failure', async () => {
      const candidate: JobCandidate = {
        sourceId: '10000000-0000-0000-0000-000000000004',
        externalJobId: 'JR_FAIL_429',
        discoveryUrl: 'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs',
        sourceJobUrl: 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Santa-Clara/RateLimited_JR_FAIL_429',
        companyIdentifier: 'nvidia/NVIDIAExternalCareerSite',
      };

      vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
        status: 429,
        statusText: 'Too Many Requests',
        data: null,
        headers: new Headers(),
        url: candidate.sourceJobUrl,
      } as any);

      await expect(adapter.fetch(candidate)).rejects.toThrow('HTTP 429');
    });

    it('rejects with error on network timeout', async () => {
      const candidate: JobCandidate = {
        sourceId: '10000000-0000-0000-0000-000000000004',
        externalJobId: 'JR_TIMEOUT',
        discoveryUrl: 'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs',
        sourceJobUrl: 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Santa-Clara/Timeout_JR_TIMEOUT',
        companyIdentifier: 'nvidia/NVIDIAExternalCareerSite',
      };

      vi.spyOn(httpClient, 'get').mockRejectedValueOnce(new Error('ETIMEDOUT'));

      await expect(adapter.fetch(candidate)).rejects.toThrow('ETIMEDOUT');
    });

    it('normalizes parsed Workday job with workplace and skills extraction', async () => {
      const rawPayload: RawJobPayload = {
        sourceId: '10000000-0000-0000-0000-000000000004',
        externalId: 'JR888',
        payload: {
          title: 'Staff Platform Engineer',
          jobReqId: 'JR888',
          jobDescription: '<p>Build Kubernetes infrastructure with Go, TypeScript, and AWS.</p>',
          location: 'Remote - US',
          additionalLocations: ['San Francisco, CA'],
          timeType: 'Full time',
          postedOn: '2026-08-25',
          externalUrl: 'https://target.wd5.myworkdayjobs.com/en-US/targetcareers/job/Remote/Staff-Engineer_JR888',
          applyUrl: 'https://target.wd5.myworkdayjobs.com/en-US/targetcareers/job/Remote/Staff-Engineer_JR888/apply',
        },
        payloadHash: 'a'.repeat(64),
        parserVersion: 'workday_v1',
        fetchedAt: new Date().toISOString(),
      };

      const rawJob = await adapter.parse(rawPayload);
      const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);

      expect(normalized.canonicalTitle).toBe('Staff Platform Engineer');
      expect(normalized.employmentType).toBe('full_time');
      expect(normalized.workplaceType).toBe('remote');
      expect(normalized.locations).toContain('Remote - US');
      expect(normalized.locations).toContain('San Francisco, CA');
      expect(normalized.skills).toContain('Kubernetes');
      expect(normalized.skills).toContain('TypeScript');
      expect(normalized.skills).toContain('Go');
      expect(normalized.skills).toContain('AWS');

      const validation = adapter.validate(normalized);
      expect(validation.isValid).toBe(true);
    });
  });

  describe('6. Registry Integration', () => {
    it('is registered in ATSAdapterRegistry under "workday"', () => {
      expect(ATSAdapterRegistry.hasAdapter('workday')).toBe(true);
      const retrieved = ATSAdapterRegistry.getAdapter('workday');
      expect(retrieved.platformSlug).toBe('workday');
    });

    it('has definition with hasPublicApi=true and requiresBrowserRendering=false', () => {
      const def = ATSAdapterRegistry.getDefinition('workday');
      expect(def).not.toBeNull();
      expect(def!.isImplemented).toBe(true);
      expect(def!.capabilities.hasPublicApi).toBe(true);
      expect(def!.capabilities.requiresBrowserRendering).toBe(false);
    });
  });
});
