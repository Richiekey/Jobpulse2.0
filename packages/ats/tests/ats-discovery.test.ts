import { describe, it, expect, vi } from 'vitest';
import { ATSDetector, SourceValidator } from '../src/index.js';
import type { CompanySourceConfig } from '@jobpulse/domain';
import { httpClient } from '@jobpulse/shared';

describe('ATS Discovery & Detection Engine (S12 & S13)', () => {
  it('detects direct Greenhouse board URLs with confirmed confidence', () => {
    const result = ATSDetector.detect('https://boards.greenhouse.io/stripe?gh_src=custom');
    expect(result.detected).toBe(true);
    expect(result.atsType).toBe('greenhouse');
    expect(result.boardIdentifier).toBe('stripe');
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('detects direct Lever board URLs with confirmed confidence', () => {
    const result = ATSDetector.detect('https://jobs.lever.co/figma/');
    expect(result.detected).toBe(true);
    expect(result.atsType).toBe('lever');
    expect(result.boardIdentifier).toBe('figma');
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('detects direct Ashby board URLs with confirmed confidence', () => {
    const result = ATSDetector.detect('https://jobs.ashbyhq.com/linear');
    expect(result.detected).toBe(true);
    expect(result.atsType).toBe('ashby');
    expect(result.boardIdentifier).toBe('linear');
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('detects embedded Greenhouse iframe / script from career page HTML', () => {
    const html = `
      <html>
        <head><title>Careers at Acme</title></head>
        <body>
          <script src="https://boards.greenhouse.io/embed/job_board.js?for=acme"></script>
        </body>
      </html>
    `;
    const result = ATSDetector.detect('https://acme.com/careers', html);
    expect(result.detected).toBe(true);
    expect(result.atsType).toBe('greenhouse');
    expect(result.boardIdentifier).toBe('acme');
    expect(result.confidence).toBeGreaterThanOrEqual(0.80);
  });

  it('detects recognized Workday portal without crashing', () => {
    const result = ATSDetector.detect('https://target.myworkdayjobs.com/targetcareers');
    expect(result.detected).toBe(true);
    expect(result.atsType).toBe('workday');
    expect(result.boardIdentifier).toBe('target/targetcareers');
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('resolves competing matches deterministically based on confidence score', () => {
    // HTML with embedded Greenhouse embed (0.85) AND an external link to Ashby (0.65)
    const html = `
      <html>
        <body>
          <script src="https://boards.greenhouse.io/embed/job_board.js?for=uber"></script>
          <a href="https://jobs.ashbyhq.com/uber_engineering">Ashby link</a>
        </body>
      </html>
    `;
    const result = ATSDetector.detect('https://uber.com/careers', html);
    expect(result.detected).toBe(true);
    expect(result.atsType).toBe('greenhouse');
    expect(result.boardIdentifier).toBe('uber');
    expect(result.confidence).toBeGreaterThan(0.80);
  });

  it('direct board URL (0.99) wins deterministically over lower-confidence HTML matches (0.65)', () => {
    const html = `<a href="https://jobs.lever.co/stripe">Old Lever link</a>`;
    // Direct URL is Greenhouse (0.99)
    const result = ATSDetector.detect('https://boards.greenhouse.io/stripe', html);
    expect(result.detected).toBe(true);
    expect(result.atsType).toBe('greenhouse');
    expect(result.boardIdentifier).toBe('stripe');
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('breaks ties between equal-confidence matches deterministically', () => {
    // Both Greenhouse link and Lever link in HTML with equal confidence (0.65)
    const html = `
      <a href="https://jobs.lever.co/acme">Lever</a>
      <a href="https://boards.greenhouse.io/acme">Greenhouse</a>
    `;
    const result = ATSDetector.detect('https://acme.com/careers', html);
    expect(result.detected).toBe(true);
    // Greenhouse comes before Lever alphabetically as tie-breaker
    expect(result.atsType).toBe('greenhouse');
    expect(result.boardIdentifier).toBe('acme');
  });

  it('returns non-detected for unknown custom career sites without ATS signature', () => {
    const result = ATSDetector.detect('https://example.com/careers', '<div>Work with us</div>');
    expect(result.detected).toBe(false);
    expect(result.atsType).toBeNull();
    expect(result.boardIdentifier).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

describe('Source Pre-Flight Validation Engine (S11)', () => {
  it('validates a live or mocked Greenhouse company source successfully', async () => {
    vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      status: 200,
      data: {
        jobs: [
          { id: 101, title: 'Staff Software Engineer', absolute_url: 'https://boards.greenhouse.io/stripe/jobs/101' },
          { id: 102, title: 'Engineering Manager', absolute_url: 'https://boards.greenhouse.io/stripe/jobs/102' },
        ],
      },
      headers: new Headers(),
      statusText: 'OK',
      url: 'https://boards-api.greenhouse.io/v1/boards/stripe/jobs',
    } as any);

    const mockConfig: CompanySourceConfig = {
      id: 'cs_100',
      companyId: 'comp_1',
      sourceId: 'src_gh',
      sourceIdentifier: 'stripe',
      adapterConfig: { atsType: 'greenhouse' },
      isActive: false,
      healthStatus: 'healthy',
      priority: 10,
      scheduleIntervalMinutes: 360,
      consecutiveFailures: 0,
      lastJobCount: 0,
      discoveryMethod: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validation = await SourceValidator.validate(mockConfig, 'greenhouse');
    expect(validation.isValid).toBe(true);
    expect(validation.atsType).toBe('greenhouse');
    expect(validation.boardIdentifier).toBe('stripe');
    expect(validation.jobsDiscoveredCount).toBe(2);
    expect(validation.sampleJobTitles).toContain('Staff Software Engineer');
  });

  it('fails gracefully when an unimplemented catalog ATS is validated', async () => {
    const mockConfig: CompanySourceConfig = {
      id: 'cs_101',
      companyId: 'comp_2',
      sourceId: 'src_workable',
      sourceIdentifier: 'enterprise',
      adapterConfig: { atsType: 'workable' },
      isActive: false,
      healthStatus: 'healthy',
      priority: 10,
      scheduleIntervalMinutes: 360,
      consecutiveFailures: 0,
      lastJobCount: 0,
      discoveryMethod: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validation = await SourceValidator.validate(mockConfig, 'workable');
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('is recognized in catalog but adapter implementation is pending');
  });

  it('fails gracefully on unknown ATS platform name', async () => {
    const mockConfig: CompanySourceConfig = {
      id: 'cs_102',
      companyId: 'comp_3',
      sourceId: 'src_unk',
      sourceIdentifier: 'foo',
      adapterConfig: { atsType: 'nonexistent_ats' },
      isActive: false,
      healthStatus: 'healthy',
      priority: 10,
      scheduleIntervalMinutes: 360,
      consecutiveFailures: 0,
      lastJobCount: 0,
      discoveryMethod: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validation = await SourceValidator.validate(mockConfig, 'nonexistent_ats');
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('Unknown or unsupported ATS platform');
  });
});
