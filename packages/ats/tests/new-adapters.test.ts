import { describe, it, expect } from 'vitest';
import {
  WorkableAdapter,
  BambooHRAdapter,
  RipplingAdapter,
  JobviteAdapter,
  RecruiteeAdapter,
  ApplyToJobAdapter,
  TeamtailorAdapter,
  BreezyAdapter,
  PersonioAdapter,
  ADPAdapter,
  ATSAdapterRegistry,
} from '../src/index.js';
import type { RawJobPayload } from '@jobpulse/domain';

describe('Phase 3: ATS Expansion Suite — 10 New Adapters', () => {
  // 1. Workable
  describe('WorkableAdapter', () => {
    const adapter = new WorkableAdapter();

    it('detects Workable URLs accurately', () => {
      const match = adapter.detect('https://apply.workable.com/spotify-tech/j/123ABC456D/');
      expect(match.detected).toBe(true);
      expect(match.atsType).toBe('workable');
      expect(match.boardIdentifier).toBe('spotify-tech');
      expect(match.confidence).toBeGreaterThanOrEqual(0.9);

      const nonMatch = adapter.detect('https://customcompany.com/careers');
      expect(nonMatch.detected).toBe(false);
      expect(nonMatch.atsType).toBeNull();
    });

    it('parses and normalizes Workable jobs correctly', async () => {
      const rawPayload: RawJobPayload = {
        sourceId: 'src_workable_1',
        externalId: '123ABC456D',
        payload: {
          id: '123ABC456D',
          shortcode: '123ABC456D',
          title: 'Senior Software Engineer (Remote)',
          description: '<p>Join our team building platforms.</p>',
          requirements: '<ul><li>TypeScript</li><li>Node.js</li></ul>',
          department: 'Engineering',
          employment_type: 'Full-time',
          telecommuting: true,
          location: {
            city: 'San Francisco',
            region: 'CA',
            country: 'United States',
          },
          url: 'https://apply.workable.com/spotify-tech/j/123ABC456D/',
          application_url: 'https://apply.workable.com/spotify-tech/j/123ABC456D/apply/',
        },
        payloadHash: 'hash_w_1',
        parserVersion: 'workable_v1',
        fetchedAt: new Date().toISOString(),
      };

      const raw = await adapter.parse(rawPayload);
      expect(raw.rawTitle).toBe('Senior Software Engineer (Remote)');
      expect(raw.rawLocations).toContain('San Francisco, CA, United States');

      const normalized = await adapter.normalize(raw, 'hash_w_1');
      expect(normalized.canonicalTitle).toBe('Senior Software Engineer');
      expect(normalized.workplaceType).toBe('remote');
      expect(normalized.employmentType).toBe('full_time');
      expect(normalized.urls.applyUrl).toBe('https://apply.workable.com/spotify-tech/j/123ABC456D/apply');
      expect(normalized.rawPayloadHash).toBe('hash_w_1');
    });
  });

  // 2. BambooHR
  describe('BambooHRAdapter', () => {
    const adapter = new BambooHRAdapter();

    it('detects BambooHR career URLs accurately', () => {
      const match = adapter.detect('https://postman.bamboohr.com/careers/567');
      expect(match.detected).toBe(true);
      expect(match.atsType).toBe('bamboohr');
      expect(match.boardIdentifier).toBe('postman');
      expect(match.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('parses and normalizes BambooHR jobs correctly', async () => {
      const rawPayload: RawJobPayload = {
        sourceId: 'postman',
        externalId: '567',
        payload: {
          id: 567,
          jobOpeningName: 'Staff Frontend Engineer',
          location: {
            city: 'Austin',
            state: 'TX',
          },
          employmentType: 'Full-Time',
          description: '<p>Lead our UI architecture.</p>',
          department: { label: 'Product Development' },
          url: 'https://postman.bamboohr.com/careers/567',
        },
        payloadHash: 'hash_b_1',
        parserVersion: 'bamboohr_v1',
        fetchedAt: new Date().toISOString(),
      };

      const raw = await adapter.parse(rawPayload);
      expect(raw.rawTitle).toBe('Staff Frontend Engineer');

      const normalized = await adapter.normalize(raw, 'hash_b_1');
      expect(normalized.displayTitle).toBe('Staff Frontend Engineer');
      expect(normalized.locations).toContain('Austin, TX');
      expect(normalized.urls.applyUrl).toContain('postman.bamboohr.com');
    });
  });

  // 3. Rippling
  describe('RipplingAdapter', () => {
    const adapter = new RipplingAdapter();

    it('detects Rippling ATS board URLs accurately', () => {
      const match = adapter.detect('https://ats.rippling.com/acme-corp/jobs/890');
      expect(match.detected).toBe(true);
      expect(match.atsType).toBe('rippling');
      expect(match.boardIdentifier).toBe('acme-corp');
    });

    it('parses and normalizes Rippling jobs correctly', async () => {
      const rawPayload: RawJobPayload = {
        sourceId: 'acme-corp',
        externalId: '890',
        payload: {
          id: '890',
          name: 'Principal DevOps Architect',
          locations: [
            {
              city: 'Seattle',
              state: 'WA',
              country: 'USA',
              workplaceType: 'hybrid',
            },
          ],
          department: { name: 'Infrastructure' },
          description: '<p>Scale our multi-region Kubernetes clusters with AWS and Terraform.</p>',
          createdAt: '2026-01-15T00:00:00Z',
          url: 'https://ats.rippling.com/acme-corp/jobs/890',
        },
        payloadHash: 'hash_r_1',
        parserVersion: 'rippling_v1',
        fetchedAt: new Date().toISOString(),
      };

      const raw = await adapter.parse(rawPayload);
      const normalized = await adapter.normalize(raw, 'hash_r_1');
      expect(normalized.canonicalTitle).toBe('Principal DevOps Architect');
      expect(normalized.workplaceType).toBe('hybrid');
      expect(normalized.skills).toContain('Kubernetes');
      expect(normalized.skills).toContain('AWS');
      expect(normalized.skills).toContain('Terraform');
    });
  });

  // 4. Jobvite
  describe('JobviteAdapter', () => {
    const adapter = new JobviteAdapter();

    it('detects Jobvite board URLs accurately', () => {
      const match = adapter.detect('https://jobs.jobvite.com/hulu/job/oX7Y8Z');
      expect(match.detected).toBe(true);
      expect(match.atsType).toBe('jobvite');
      expect(match.boardIdentifier).toBe('hulu');
    });

    it('parses and normalizes Jobvite HTML payloads safely', async () => {
      const html = `
        <h2 class="jv-header">Cloud Security Specialist</h2>
        <div class="jv-job-detail-meta">Remote - US</div>
        <div class="jv-job-detail-description">Protect infrastructure and cloud services.</div>
      `;
      const rawPayload: RawJobPayload = {
        sourceId: 'hulu',
        externalId: 'oX7Y8Z',
        payload: {
          id: 'oX7Y8Z',
          url: 'https://jobs.jobvite.com/hulu/job/oX7Y8Z',
          rawHtml: html,
        },
        payloadHash: 'hash_jv_1',
        parserVersion: 'jobvite_v1',
        fetchedAt: new Date().toISOString(),
      };

      const raw = await adapter.parse(rawPayload);
      expect(raw.rawTitle).toBe('Cloud Security Specialist');

      const normalized = await adapter.normalize(raw, 'hash_jv_1');
      expect(normalized.displayTitle).toBe('Cloud Security Specialist');
      expect(normalized.workplaceType).toBe('remote');
    });
  });

  // 5. Recruitee
  describe('RecruiteeAdapter', () => {
    const adapter = new RecruiteeAdapter();

    it('detects Recruitee URLs accurately', () => {
      const match = adapter.detect('https://hotjar.recruitee.com/o/full-stack-engineer');
      expect(match.detected).toBe(true);
      expect(match.atsType).toBe('recruitee');
      expect(match.boardIdentifier).toBe('hotjar');
    });

    it('parses and normalizes Recruitee offers', async () => {
      const rawPayload: RawJobPayload = {
        sourceId: 'hotjar',
        externalId: '4321',
        payload: {
          id: 4321,
          title: 'Senior Backend Engineer',
          city: 'London',
          country: 'United Kingdom',
          remote: true,
          description: '<p>Build microservices in Go and Python.</p>',
          requirements: '<p>5+ years experience</p>',
          department: 'Engineering',
          careers_url: 'https://hotjar.recruitee.com/o/senior-backend-engineer',
        },
        payloadHash: 'hash_rc_1',
        parserVersion: 'recruitee_v1',
        fetchedAt: new Date().toISOString(),
      };

      const raw = await adapter.parse(rawPayload);
      expect(raw.rawLocations).toContain('London, United Kingdom');

      const normalized = await adapter.normalize(raw, 'hash_rc_1');
      expect(normalized.canonicalTitle).toBe('Senior Backend Engineer');
      expect(normalized.workplaceType).toBe('remote');
      expect(normalized.urls.applyUrl).toBe('https://hotjar.recruitee.com/o/senior-backend-engineer');
    });
  });

  // 6. ApplyToJob (JazzHR)
  describe('ApplyToJobAdapter', () => {
    const adapter = new ApplyToJobAdapter();

    it('detects ApplyToJob URLs accurately', () => {
      const match = adapter.detect('https://databox.applytojob.com/apply/abc123xyz/QA-Lead');
      expect(match.detected).toBe(true);
      expect(match.atsType).toBe('applytojob');
      expect(match.boardIdentifier).toBe('databox');
    });

    it('parses and normalizes ApplyToJob listings', async () => {
      const rawPayload: RawJobPayload = {
        sourceId: 'databox',
        externalId: 'abc123xyz',
        payload: {
          id: 'abc123xyz',
          url: 'https://databox.applytojob.com/apply/abc123xyz/QA-Lead',
          rawHtml: '<h1>QA Lead</h1><div class="description">Own software testing quality.</div>',
        },
        payloadHash: 'hash_atj_1',
        parserVersion: 'applytojob_v1',
        fetchedAt: new Date().toISOString(),
      };

      const raw = await adapter.parse(rawPayload);
      expect(raw.rawTitle).toBe('QA Lead');

      const normalized = await adapter.normalize(raw, 'hash_atj_1');
      expect(normalized.displayTitle).toBe('QA Lead');
    });
  });

  // 7. Teamtailor
  describe('TeamtailorAdapter', () => {
    const adapter = new TeamtailorAdapter();

    it('detects Teamtailor job URLs accurately', () => {
      const match = adapter.detect('https://kinsta.teamtailor.com/jobs/998877-support-engineer');
      expect(match.detected).toBe(true);
      expect(match.atsType).toBe('teamtailor');
      expect(match.boardIdentifier).toBe('kinsta');
    });

    it('parses and normalizes Teamtailor job postings', async () => {
      const rawPayload: RawJobPayload = {
        sourceId: 'kinsta',
        externalId: '998877',
        payload: {
          id: '998877',
          url: 'https://kinsta.teamtailor.com/jobs/998877',
          rawHtml: '<h1>Support Engineer (Remote)</h1><section class="body">24/7 technical customer assistance.</section>',
        },
        payloadHash: 'hash_tt_1',
        parserVersion: 'teamtailor_v1',
        fetchedAt: new Date().toISOString(),
      };

      const raw = await adapter.parse(rawPayload);
      const normalized = await adapter.normalize(raw, 'hash_tt_1');
      expect(normalized.canonicalTitle).toBe('Support Engineer');
      expect(normalized.workplaceType).toBe('remote');
    });
  });

  // 8. Breezy HR
  describe('BreezyAdapter', () => {
    const adapter = new BreezyAdapter();

    it('detects Breezy HR portal URLs accurately', () => {
      const match = adapter.detect('https://zapier.breezy.hr/p/445566-data-analyst');
      expect(match.detected).toBe(true);
      expect(match.atsType).toBe('breezy');
      expect(match.boardIdentifier).toBe('zapier');
    });

    it('parses and normalizes Breezy positions', async () => {
      const rawPayload: RawJobPayload = {
        sourceId: 'zapier',
        externalId: '445566',
        payload: {
          _id: '445566',
          name: 'Lead Data Analyst',
          location: {
            city: 'Chicago',
            country: { name: 'United States' },
            is_remote: true,
          },
          remote: true,
          department: 'Analytics',
          description: '<p>Analyze product trends with SQL and Python.</p>',
          url: 'https://zapier.breezy.hr/p/445566',
        },
        payloadHash: 'hash_bz_1',
        parserVersion: 'breezy_v1',
        fetchedAt: new Date().toISOString(),
      };

      const raw = await adapter.parse(rawPayload);
      expect(raw.rawLocations).toContain('Chicago, United States');

      const normalized = await adapter.normalize(raw, 'hash_bz_1');
      expect(normalized.workplaceType).toBe('remote');
      expect(normalized.skills).toContain('SQL');
    });
  });

  // 9. Personio
  describe('PersonioAdapter', () => {
    const adapter = new PersonioAdapter();

    it('detects Personio career URLs accurately', () => {
      const match = adapter.detect('https://finleap.jobs.personio.de/job/112233');
      expect(match.detected).toBe(true);
      expect(match.atsType).toBe('personio');
      expect(match.boardIdentifier).toBe('finleap');
    });

    it('parses and normalizes Personio positions', async () => {
      const rawPayload: RawJobPayload = {
        sourceId: 'finleap',
        externalId: '112233',
        payload: {
          id: '112233',
          name: 'Product Manager - Fintech',
          office: 'Berlin',
          department: 'Product',
          employmentType: 'full_time',
          description: '<p>Lead payment gateway features.</p>',
        },
        payloadHash: 'hash_per_1',
        parserVersion: 'personio_v1',
        fetchedAt: new Date().toISOString(),
      };

      const raw = await adapter.parse(rawPayload);
      expect(raw.rawLocations).toContain('Berlin');

      const normalized = await adapter.normalize(raw, 'hash_per_1');
      expect(normalized.displayTitle).toBe('Product Manager - Fintech');
      expect(normalized.locations).toContain('Berlin');
    });
  });

  // 10. ADP
  describe('ADPAdapter', () => {
    const adapter = new ADPAdapter();

    it('detects ADP Workforce Now URLs accurately', () => {
      const match = adapter.detect('https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=adp_org_1&jobId=9988');
      expect(match.detected).toBe(true);
      expect(match.atsType).toBe('adp');
      expect(match.boardIdentifier).toBe('adp_org_1');
    });

    it('parses and normalizes ADP job requisitions', async () => {
      const rawPayload: RawJobPayload = {
        sourceId: 'adp_org_1',
        externalId: '9988',
        payload: {
          itemID: '9988',
          requisitionTitle: 'Senior Systems Engineer',
          requisitionDescription: '<p>Administer enterprise Linux and cloud servers.</p>',
          postDate: '2026-02-01T10:00:00Z',
          requisitionLocations: [
            {
              address: {
                cityName: 'Dallas',
                countrySubdivisionLevel1: { codeValue: 'TX' },
                countryCode: 'US',
              },
            },
          ],
        },
        payloadHash: 'hash_adp_1',
        parserVersion: 'adp_v1',
        fetchedAt: new Date().toISOString(),
      };

      const raw = await adapter.parse(rawPayload);
      expect(raw.rawLocations).toContain('Dallas, TX, US');

      const normalized = await adapter.normalize(raw, 'hash_adp_1');
      expect(normalized.displayTitle).toBe('Senior Systems Engineer');
      expect(normalized.urls.applyUrl).toContain('adp_org_1');
    });
  });

  // Registry validation
  describe('ATSAdapterRegistry coverage', () => {
    it('has all 20 ATS adapters registered and retrievable', () => {
      const expectedAdapters = [
        'greenhouse',
        'lever',
        'ashby',
        'workday',
        'jobright',
        'smartrecruiters',
        'icims',
        'successfactors',
        'oracle',
        'workable',
        'bamboohr',
        'rippling',
        'jobvite',
        'recruitee',
        'applytojob',
        'teamtailor',
        'breezy',
        'personio',
        'adp',
      ];

      for (const slug of expectedAdapters) {
        expect(ATSAdapterRegistry.hasAdapter(slug)).toBe(true);
        const instance = ATSAdapterRegistry.getAdapter(slug);
        expect(instance).toBeDefined();
        expect(instance.platformSlug).toBe(slug);
      }
    });
  });
});
