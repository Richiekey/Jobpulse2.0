import { describe, it, expect } from 'vitest';
import { ATSAdapterRegistry } from '../src/registry.js';
import type { ATSAdapter } from '../src/adapter.interface.js';
import type {
  CompanySourceConfig,
  JobCandidate,
  RawJobPayload,
  RawJob,
  NormalizedJob,
  SourceValidationResult,
  ATSDetectionResult,
} from '@jobpulse/domain';
import { Normalizer, DeduplicationEngine } from '@jobpulse/domain';
import { URLResolver } from '@jobpulse/url-resolution';
import { JobValidator, type JobValidationResult } from '@jobpulse/validation';

/**
 * Minimal Fake ATS Adapter to prove that adding a new ATS requires ZERO core pipeline changes.
 */
class TestATSAdapter implements ATSAdapter {
  public readonly platformSlug = 'test_ats';
  public readonly parserVersion = 'test_v1';

  public detect(url: string): ATSDetectionResult {
    if (url.includes('test-ats.internal')) {
      return {
        detected: true,
        atsType: 'test_ats',
        boardIdentifier: 'test_corp',
        confidence: 1.0,
        sourceUrl: url,
      };
    }
    return { detected: false, atsType: null, boardIdentifier: null, confidence: 0, sourceUrl: url };
  }

  public async validateSource(config: CompanySourceConfig): Promise<SourceValidationResult> {
    return {
      isValid: true,
      atsType: 'test_ats',
      boardIdentifier: config.sourceIdentifier,
      jobsDiscoveredCount: 1,
      sampleJobTitles: ['Synthetic Test Engineer'],
      durationMs: 5,
    };
  }

  public async discover(config: CompanySourceConfig): Promise<JobCandidate[]> {
    return [
      {
        sourceId: config.sourceId,
        externalJobId: 'fake_job_001',
        discoveryUrl: 'https://test-ats.internal/boards/test_corp',
        sourceJobUrl: 'https://test-ats.internal/boards/test_corp/jobs/fake_job_001',
        companyIdentifier: config.sourceIdentifier,
      },
    ];
  }

  public async fetch(candidate: JobCandidate): Promise<RawJobPayload> {
    const payload = {
      id: candidate.externalJobId,
      title: 'Senior Systems Architect',
      description: 'Design and build resilient distributed systems with zero downtime.',
      location: 'Berlin, Germany',
      posted_at: '2026-08-29T10:00:00Z',
    };
    return {
      sourceId: candidate.sourceId,
      externalId: candidate.externalJobId,
      payload,
      payloadHash: DeduplicationEngine.hashPayload(payload),
      parserVersion: this.parserVersion,
      fetchedAt: new Date().toISOString(),
    };
  }

  public async parse(rawPayload: RawJobPayload): Promise<RawJob> {
    const data = rawPayload.payload as any;
    return {
      sourceId: rawPayload.sourceId,
      externalJobId: data.id,
      rawTitle: data.title,
      rawDescription: data.description,
      rawDescriptionHtml: null,
      rawLocations: [data.location],
      rawPostedAt: data.posted_at,
      sourceJobUrl: `https://test-ats.internal/boards/test_corp/jobs/${data.id}`,
      discoveryUrl: 'https://test-ats.internal/boards/test_corp',
    };
  }

  public async normalize(rawJob: RawJob, payloadHash: string): Promise<NormalizedJob> {
    const resolvedUrls = URLResolver.resolve({
      discoveryUrl: rawJob.discoveryUrl,
      sourceJobUrl: rawJob.sourceJobUrl,
      candidates: [{ url: rawJob.sourceJobUrl, sourceType: 'fallback_source' }],
    });
    return Normalizer.normalize(rawJob, resolvedUrls, payloadHash);
  }

  public validate(job: NormalizedJob): JobValidationResult {
    return JobValidator.validate(job);
  }

  public async resolveApplicationUrl(candidate: JobCandidate, raw: RawJob): Promise<string> {
    return raw.sourceJobUrl;
  }
}

describe('Fake ATS Extensibility Gate (Section 23 Audit)', () => {
  it('registers a brand new ATS adapter dynamically and executes the complete pipeline without modifying core systems', async () => {
    // 1. Dynamic registration
    ATSAdapterRegistry.register('test_ats', () => new TestATSAdapter());
    expect(ATSAdapterRegistry.hasAdapter('test_ats')).toBe(true);

    // 2. Resolve from registry
    const adapter = ATSAdapterRegistry.getAdapter('test_ats');
    expect(adapter).toBeInstanceOf(TestATSAdapter);
    expect(adapter.platformSlug).toBe('test_ats');

    // 3. Configure CompanySourceConfig
    const config: CompanySourceConfig = {
      id: '00000000-0000-0000-0000-000000000099',
      companyId: '00000000-0000-0000-0000-000000000001',
      sourceId: '00000000-0000-0000-0000-000000000002',
      sourceIdentifier: 'test_corp',
      adapterConfig: {},
      isActive: true,
      healthStatus: 'healthy',
      priority: 100,
      scheduleIntervalMinutes: 360,
      consecutiveFailures: 0,
      lastJobCount: 0,
      discoveryMethod: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 4. Source Validation
    const validation = await adapter.validateSource(config);
    expect(validation.isValid).toBe(true);

    // 5. Discovery
    const candidates = await adapter.discover(config);
    expect(candidates.length).toBe(1);
    expect(candidates[0]!.externalJobId).toBe('fake_job_001');

    // 6. Fetch & Parse
    const payload = await adapter.fetch(candidates[0]!);
    const rawJob = await adapter.parse(payload);
    expect(rawJob.rawTitle).toBe('Senior Systems Architect');

    // 7. Normalization
    const normalized = await adapter.normalize(rawJob, payload.payloadHash);
    expect(normalized.canonicalTitle).toBe('Senior Systems Architect');
    expect(normalized.locations).toEqual(['Berlin, Germany']);

    // 8. Quality Validation
    const quality = adapter.validate(normalized);
    expect(quality.isValid).toBe(true);

    // Clean up
    ATSAdapterRegistry.unregister('test_ats');
    expect(ATSAdapterRegistry.hasAdapter('test_ats')).toBe(false);
  });
});
