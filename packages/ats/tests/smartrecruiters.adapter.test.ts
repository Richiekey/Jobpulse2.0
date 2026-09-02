import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../src/index.js';
import { SmartRecruitersAdapter } from '../src/adapters/smartrecruiters.adapter.js';
import { ATSAdapterRegistry } from '../src/registry.js';
import { httpClient } from '@jobpulse/shared';
import type { CompanySourceConfig, JobCandidate, RawJobPayload } from '@jobpulse/domain';

describe('SmartRecruitersAdapter — Comprehensive ATS Verification', () => {
  const adapter = new SmartRecruitersAdapter();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. ATS Detection', () => {
    it('detects SmartRecruiters from standard jobs.smartrecruiters.com URL', () => {
      const result = adapter.detect('https://jobs.smartrecruiters.com/Visa');
      expect(result.detected).toBe(true);
      expect(result.atsType).toBe('smartrecruiters');
      expect(result.boardIdentifier).toBe('visa');
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    });

    it('detects SmartRecruiters from HTML embedding', () => {
      const html = '<script src="https://smartrecruiters.com/company_abc/widget.js"></script>';
      const result = adapter.detect('https://company.com/careers', html);
      expect(result.detected).toBe(true);
      expect(result.atsType).toBe('smartrecruiters');
      expect(result.boardIdentifier).toBe('company_abc');
    });

    it('returns false for unrelated URLs', () => {
      const result = adapter.detect('https://boards.greenhouse.io/stripe');
      expect(result.detected).toBe(false);
    });
  });

  describe('2. Source Validation', () => {
    const mockConfig: CompanySourceConfig = {
      id: '00000000-0000-0000-0000-000000000001',
      companyId: '00000000-0000-0000-0000-000000000002',
      sourceId: '10000000-0000-0000-0000-000000000006',
      sourceIdentifier: 'visa',
      sourceUrl: 'https://jobs.smartrecruiters.com/Visa',
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('validates healthy SmartRecruiters company source', async () => {
      vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        data: {
          totalFound: 120,
          offset: 0,
          limit: 5,
          content: [
            { id: '101', name: 'Lead Software Engineer' },
            { id: '102', name: 'Security Architect' },
          ],
        },
        headers: new Headers(),
        url: 'https://api.smartrecruiters.com/v1/companies/visa/postings',
      } as any);

      const result = await adapter.validateSource(mockConfig);
      expect(result.isValid).toBe(true);
      expect(result.jobsDiscoveredCount).toBe(120);
      expect(result.sampleJobTitles).toContain('Lead Software Engineer');
      expect(result.sampleJobTitles).toContain('Security Architect');
    });

    it('handles HTTP error during validation', async () => {
      vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
        data: null,
        headers: new Headers(),
        url: 'https://api.smartrecruiters.com/v1/companies/visa/postings',
      } as any);

      const result = await adapter.validateSource(mockConfig);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('404');
    });
  });

  describe('3. Discovery & Pagination', () => {
    const mockConfig: CompanySourceConfig = {
      id: '00000000-0000-0000-0000-000000000001',
      companyId: '00000000-0000-0000-0000-000000000002',
      sourceId: '10000000-0000-0000-0000-000000000006',
      sourceIdentifier: 'spotify',
      sourceUrl: 'https://jobs.smartrecruiters.com/Spotify',
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('discovers candidates across paginated responses', async () => {
      vi.spyOn(httpClient, 'get')
        .mockResolvedValueOnce({
          status: 200,
          data: {
            totalFound: 3,
            offset: 0,
            limit: 50,
            content: [
              { id: 'sr_1', name: 'Frontend Engineer' },
              { id: 'sr_2', name: 'Backend Engineer' },
            ],
          },
          headers: {},
        })
        .mockResolvedValueOnce({
          status: 200,
          data: {
            totalFound: 3,
            offset: 2,
            limit: 50,
            content: [{ id: 'sr_3', name: 'Data Scientist' }],
          },
          headers: {},
        });

      const candidates = await adapter.discover(mockConfig);
      expect(candidates.length).toBe(3);
      expect(candidates[0]!.externalJobId).toBe('sr_1');
      expect(candidates[1]!.externalJobId).toBe('sr_2');
      expect(candidates[2]!.externalJobId).toBe('sr_3');
    });

    it('handles empty results and malformed data', async () => {
      vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
        status: 200,
        data: { totalFound: 0, offset: 0, limit: 50, content: [] },
        headers: {},
      });

      const candidates = await adapter.discover(mockConfig);
      expect(candidates).toEqual([]);
    });
  });

  describe('4. Detailed Fetch & Parse', () => {
    it('fetches and parses full job sections, locations, and salary', async () => {
      const candidate: JobCandidate = {
        sourceId: '10000000-0000-0000-0000-000000000006',
        externalJobId: '743999123',
        discoveryUrl: 'https://api.smartrecruiters.com/v1/companies/visa/postings',
        sourceJobUrl: 'https://jobs.smartrecruiters.com/visa/743999123',
        companyIdentifier: 'visa',
      };

      vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
        status: 200,
        data: {
          id: '743999123',
          name: 'Senior Distributed Systems Engineer',
          releasedDate: '2026-08-25T10:00:00Z',
          location: {
            city: 'Austin',
            region: 'Texas',
            country: 'United States',
            remote: true,
          },
          secondaryLocations: [
            { city: 'Foster City', region: 'California', country: 'United States' },
          ],
          department: { label: 'Core Infrastructure' },
          typeOfEmployment: { id: 'full_time', label: 'Full-time' },
          compensation: {
            min: 150000,
            max: 210000,
            currency: 'USD',
          },
          jobAd: {
            sections: {
              jobDescription: {
                title: 'Job Description',
                text: '<p>Build high-throughput payment processing pipelines with Go, Kafka, and Postgres.</p>',
              },
              qualifications: {
                title: 'Qualifications',
                text: '<ul><li>5+ years backend systems</li><li>Experience with distributed consensus</li></ul>',
              },
            },
          },
          applyUrl: 'https://jobs.smartrecruiters.com/visa/743999123/apply',
        },
        headers: {},
      });

      const rawPayload = await adapter.fetch(candidate);
      expect(rawPayload.externalId).toBe('743999123');

      const rawJob = await adapter.parse(rawPayload);
      expect(rawJob.rawTitle).toBe('Senior Distributed Systems Engineer');
      expect(rawJob.rawDescription).toContain('high-throughput payment processing');
      expect(rawJob.rawDescription).toContain('• 5+ years backend systems');
      expect(rawJob.rawLocations).toContain('Austin, Texas, United States');
      expect(rawJob.rawLocations).toContain('Foster City, California, United States');
      expect(rawJob.rawLocations).toContain('Remote');
      expect(rawJob.rawSalary).toBe('USD 150000 - 210000');

      const normalized = await adapter.normalize(rawJob, rawPayload.payloadHash);
      expect(normalized.canonicalTitle).toBe('Senior Distributed Systems Engineer');
      expect(normalized.employmentType).toBe('full_time');
      expect(normalized.workplaceType).toBe('remote');
      expect(normalized.salary?.min).toBe(150000);
      expect(normalized.salary?.max).toBe(210000);
      expect(normalized.skills).toContain('Go');
      expect(normalized.skills).toContain('Kafka');

      const validation = adapter.validate(normalized);
      expect(validation.isValid).toBe(true);
    });
  });

  describe('5. Registry Integration', () => {
    it('is registered in ATSAdapterRegistry under "smartrecruiters"', () => {
      expect(ATSAdapterRegistry.hasAdapter('smartrecruiters')).toBe(true);
      const retrieved = ATSAdapterRegistry.getAdapter('smartrecruiters');
      expect(retrieved.platformSlug).toBe('smartrecruiters');
    });
  });
});
