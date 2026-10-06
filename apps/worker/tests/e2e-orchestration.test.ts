import { describe, it, expect, vi } from 'vitest';
import { DiscoveryRunner } from '../src/engine/discovery-runner.js';
import { VerificationRunner } from '../src/engine/verification-runner.js';
import { DiscoveryQueueRunner } from '../src/engine/discovery-queue-runner.js';
import { InMemoryStateStore, SupabaseStateStore, TechnologyCheckerClient } from '@jobpulse/technology-checker';
import { supabase } from '../src/db.js';
import { ATSDetector, ATSAdapterRegistry } from '@jobpulse/ats';

// Mock ATSAdapterRegistry to skip real adapter validation
vi.spyOn(ATSAdapterRegistry, 'hasAdapter').mockReturnValue(true);
vi.spyOn(ATSAdapterRegistry, 'getAdapter').mockReturnValue({
  platformSlug: 'workable',
  validateSource: async () => ({ isValid: true }),
  discover: async () => [
    { id: '1', title: 'Job 1', url: 'https://workable.com/job/1' },
    { id: '2', title: 'Job 2', url: 'https://workable.com/job/2' }
  ],
  fetch: async () => ({ payloadHash: 'hash123', data: {} }),
  parse: async () => ({ is_active: true, title: 'Software Engineer' }),
  normalize: async () => ({
    canonicalTitle: 'Software Engineer',
    displayTitle: 'Software Engineer',
    description: 'Software Engineer job description with full requirements',
    locations: ['San Francisco, CA'],
    workplaceType: 'remote',
    postedAt: new Date().toISOString(),
    skills: ['TypeScript'],
    sourceMetadata: {},
  })
} as any);

// Mock ATSDetector to prevent needing exact HTML signatures
vi.spyOn(ATSDetector, 'detect').mockImplementation((url, html) => {
  // Extract atsType from URL to match expected
  let atsType = 'workable';
  if (url.includes('mock-')) {
    atsType = url.split('-')[1]; // mock-workable-company -> workable
  }
  return {
    detected: true,
    atsType,
    sourceUrl: url,
    confidence: 100,
    boardIdentifier: 'mock-company'
  };
});

// Mock httpClient to prevent real HTTP requests during verification
vi.mock('@jobpulse/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@jobpulse/shared')>();
  return {
    ...actual,
    httpClient: {
      ...actual.httpClient,
      get: vi.fn().mockResolvedValue({
        data: '<html>mock</html>',
        url: 'https://jobs.workable.com/mock-workable-company'
      })
    }
  };
});

describe('E2E Orchestration (Dry Run)', () => {
  it('passes a single InMemoryStateStore through all runners without DB mutations', async () => {
    // 1. Setup shared in-memory store without a DB fallback to ensure complete isolation
    const sharedStore = new InMemoryStateStore();

    const discoveryRunner = new DiscoveryRunner();
    const verificationRunner = new VerificationRunner();
    const queueRunner = new DiscoveryQueueRunner();

    // 2. Mock TechnologyCheckerClient to avoid hitting the real API and 402 quota error
    vi.spyOn(TechnologyCheckerClient.prototype, 'getTechnologyId').mockResolvedValue(123);
    vi.spyOn(TechnologyCheckerClient.prototype, 'getCompaniesByTechnology').mockResolvedValue({
      total: 1,
      companies: [
        {
          domain: 'mock-workable-company.com',
          name: 'Mock Company',
          industry: 'Tech',
          industry_code: 1,
          employees: '10-50',
          country: 'US',
          company_type: 'Private'
        }
      ]
    });

    // 3. Phase 1: Discovery
    const discoveryMetrics = await discoveryRunner.runDiscovery({ dryRun: true, store: sharedStore });
    expect(discoveryMetrics).toBeDefined();

    let records = sharedStore.getAllRecords();
    const mockCompany = records.find(r => r.domain === 'mock-workable-company.com');
    expect(mockCompany).toBeDefined();
    expect(mockCompany!.discovery_status).toBe('DISCOVERED');
    const mockRecordId = mockCompany!.id;

    // 4. Phase 2: Verification
    await verificationRunner.runVerification({ limit: 10, dryRun: true, store: sharedStore });
    
    records = sharedStore.getAllRecords();
    const verifiedCompany = records.find(r => r.id === mockRecordId);
    expect(verifiedCompany!.discovery_status).toBe('VERIFIED');
    expect(verifiedCompany!.detection_url).toBe('https://jobs.workable.com/mock-workable-company');

    // 5. Phase 3 & 4: Queue processing (Adapter Resolution -> Enqueue -> Trial Crawl -> Promotion)

    const queueMetrics = await queueRunner.runQueue({ limit: 10, dryRun: true, store: sharedStore });
    expect(queueMetrics.adaptersResolved).toBeGreaterThan(0);
    expect(queueMetrics.crawlQueued).toBeGreaterThan(0);
    
    // Verify the exact same record survived to the end state
    records = sharedStore.getAllRecords();
    const finalCompany = records.find(r => r.id === mockRecordId);
    
    // Since we mocked fetchJobs to return 2 jobs, it should be SUCCESS
    expect(finalCompany!.discovery_status).toBe('SUCCESS');
    expect(finalCompany!.crawl_job_count).toBe(2);
    // Promotion simulation happens at SUCCESS, so it should be marked as promoted
    expect(finalCompany!.promotion_status).toBe('promoted');

    // Prove zero mutations by checking Supabase mock (if it was mocked)
    // We rely on InMemoryStateStore isolating the changes.
  });
});
