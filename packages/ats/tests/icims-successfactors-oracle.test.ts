import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../src/index.js';
import { iCIMSAdapter } from '../src/adapters/icims.adapter.js';
import { SuccessFactorsAdapter } from '../src/adapters/successfactors.adapter.js';
import { OracleAdapter } from '../src/adapters/oracle.adapter.js';
import { ATSAdapterRegistry } from '../src/registry.js';
import { httpClient } from '@jobpulse/shared';
import type { CompanySourceConfig, JobCandidate, RawJobPayload } from '@jobpulse/domain';

describe('Tier 1 Adapters (iCIMS, SuccessFactors, Oracle) — Verification', () => {
  const icims = new iCIMSAdapter();
  const sf = new SuccessFactorsAdapter();
  const oracle = new OracleAdapter();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('iCIMS Adapter', () => {
    it('detects iCIMS portals from URL', () => {
      const res = icims.detect('https://careers-microsoft.icims.com/jobs/12345/job');
      expect(res.detected).toBe(true);
      expect(res.atsType).toBe('icims');
      expect(res.boardIdentifier).toBe('careers-microsoft');
    });

    it('validates iCIMS company source with JSON schema', async () => {
      const config: CompanySourceConfig = {
        id: '00000000-0000-0000-0000-000000000001',
        companyId: '00000000-0000-0000-0000-000000000002',
        sourceId: '10000000-0000-0000-0000-000000000007',
        sourceIdentifier: 'enterprise',
        sourceUrl: 'https://enterprise.icims.com',
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

      vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        data: {
          jobs: [{ id: '101', title: 'Senior Cloud Engineer', url: 'https://enterprise.icims.com/jobs/101/job' }],
        },
        headers: new Headers(),
        url: 'https://enterprise.icims.com',
      } as any);

      const res = await icims.validateSource(config);
      expect(res.isValid).toBe(true);
      expect(res.jobsDiscoveredCount).toBe(1);
    });

    it('parses iCIMS Schema.org JSON-LD job payload', async () => {
      const rawPayload: RawJobPayload = {
        sourceId: '10000000-0000-0000-0000-000000000007',
        externalId: 'icims_99',
        payload: {
          title: 'Principal Security Architect',
          description: '<p>Protect enterprise workloads with AWS, Kubernetes, and zero trust architecture.</p>',
          datePosted: '2026-08-27T08:00:00Z',
          employmentType: 'FULL_TIME',
          jobLocation: {
            address: {
              addressLocality: 'Redmond',
              addressRegion: 'Washington',
              addressCountry: 'United States',
            },
          },
          baseSalary: {
            currency: 'USD',
            value: { minValue: 180000, maxValue: 260000, unitText: 'YEAR' },
          },
          sourceJobUrl: 'https://enterprise.icims.com/jobs/icims_99/job',
        },
        payloadHash: 'b'.repeat(64),
        parserVersion: 'icims_v1',
        fetchedAt: new Date().toISOString(),
      };

      const rawJob = await icims.parse(rawPayload);
      expect(rawJob.rawTitle).toBe('Principal Security Architect');
      expect(rawJob.rawLocations).toContain('Redmond, Washington, United States');

      const normalized = await icims.normalize(rawJob, rawPayload.payloadHash);
      expect(normalized.canonicalTitle).toBe('Principal Security Architect');
      expect(normalized.skills).toContain('AWS');
      expect(normalized.skills).toContain('Kubernetes');

      const val = icims.validate(normalized);
      expect(val.isValid).toBe(true);
    });
  });

  describe('SAP SuccessFactors Adapter', () => {
    it('detects SuccessFactors career site URLs', () => {
      const res = sf.detect('https://career4.successfactors.com/career?company=siemens');
      expect(res.detected).toBe(true);
      expect(res.atsType).toBe('successfactors');
      expect(res.boardIdentifier).toBe('siemens');
    });

    it('parses SuccessFactors Schema.org JSON-LD job payload', async () => {
      const rawPayload: RawJobPayload = {
        sourceId: '10000000-0000-0000-0000-000000000008',
        externalId: 'sf_55',
        payload: {
          title: 'Industrial Automation Software Engineer',
          description: '<p>Develop industrial control software with C++, Python, and Linux.</p>',
          datePosted: '2026-08-26T12:00:00Z',
          employmentType: 'Full-time',
          jobLocation: {
            address: {
              addressLocality: 'Munich',
              addressRegion: 'Bavaria',
              addressCountry: 'Germany',
            },
          },
          sourceJobUrl: 'https://career4.successfactors.com/career?company=siemens&career_job_req_id=sf_55',
        },
        payloadHash: 'c'.repeat(64),
        parserVersion: 'successfactors_v1',
        fetchedAt: new Date().toISOString(),
      };

      const rawJob = await sf.parse(rawPayload);
      const normalized = await sf.normalize(rawJob, rawPayload.payloadHash);

      expect(normalized.canonicalTitle).toBe('Industrial Automation Software Engineer');
      expect(normalized.locations).toContain('Munich, Bavaria, Germany');
      expect(normalized.skills).toContain('C++');
      expect(normalized.skills).toContain('Python');

      const val = sf.validate(normalized);
      expect(val.isValid).toBe(true);
    });
  });

  describe('Oracle Cloud HCM Adapter', () => {
    it('detects Oracle Cloud HCM and Taleo URLs', () => {
      const resCloud = oracle.detect('https://company.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX');
      expect(resCloud.detected).toBe(true);
      expect(resCloud.atsType).toBe('oracle');

      const resTaleo = oracle.detect('https://company.taleo.net/careersection/2/jobsearch.ftl');
      expect(resTaleo.detected).toBe(true);
      expect(resTaleo.atsType).toBe('oracle');
    });

    it('parses Oracle Cloud HCM requisition payload', async () => {
      const rawPayload: RawJobPayload = {
        sourceId: '10000000-0000-0000-0000-000000000009',
        externalId: 'req_1001',
        payload: {
          Title: 'Principal Cloud Database Architect',
          Description: '<p>Architect distributed databases and high availability clusters with SQL and Oracle.</p>',
          PrimaryLocation: 'Austin, TX',
          OtherLocations: [{ LocationName: 'Seattle, WA' }],
          PostingDate: '2026-08-25T00:00:00Z',
          MinSalary: 165000,
          MaxSalary: 235000,
          CurrencyCode: 'USD',
          ExternalURL: 'https://oracle.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/requisitions/req_1001',
        },
        payloadHash: 'd'.repeat(64),
        parserVersion: 'oracle_v1',
        fetchedAt: new Date().toISOString(),
      };

      const rawJob = await oracle.parse(rawPayload);
      expect(rawJob.rawTitle).toBe('Principal Cloud Database Architect');
      expect(rawJob.rawLocations).toContain('Austin, TX');
      expect(rawJob.rawLocations).toContain('Seattle, WA');

      const normalized = await oracle.normalize(rawJob, rawPayload.payloadHash);
      expect(normalized.canonicalTitle).toBe('Principal Cloud Database Architect');
      expect(normalized.salary?.min).toBe(165000);
      expect(normalized.salary?.max).toBe(235000);
      expect(normalized.skills).toContain('SQL');

      const val = oracle.validate(normalized);
      expect(val.isValid).toBe(true);
    });
  });

  describe('Registry Resolution', () => {
    it('resolves all Tier 1 adapters cleanly from registry', () => {
      expect(ATSAdapterRegistry.getAdapter('workday')).toBeInstanceOf(Object);
      expect(ATSAdapterRegistry.getAdapter('smartrecruiters')).toBeInstanceOf(Object);
      expect(ATSAdapterRegistry.getAdapter('icims')).toBeInstanceOf(Object);
      expect(ATSAdapterRegistry.getAdapter('successfactors')).toBeInstanceOf(Object);
      expect(ATSAdapterRegistry.getAdapter('oracle')).toBeInstanceOf(Object);
    });
  });
});
