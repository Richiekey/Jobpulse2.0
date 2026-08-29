import { describe, it, expect } from 'vitest';
import { DeduplicationEngine } from '../src/deduplication.js';

describe('DeduplicationEngine & 3-Level Deduplication', () => {
  it('Level 1: Generates consistent SHA-256 payload hashes', () => {
    const payload1 = { title: 'Staff Software Engineer', salary: 220000 };
    const payload2 = { title: 'Staff Software Engineer', salary: 220000 };
    const hash1 = DeduplicationEngine.hashPayload(payload1);
    const hash2 = DeduplicationEngine.hashPayload(payload2);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('Level 2: Provider-aware URL cleaning strips tracking while preserving routes and hash', () => {
    const dirtyGreenhouse = 'https://boards.greenhouse.io/stripe/jobs/12345?utm_source=linkedin&gh_src=custom_ref#app';
    expect(DeduplicationEngine.cleanUrl(dirtyGreenhouse)).toBe('https://boards.greenhouse.io/stripe/jobs/12345#app');

    const dirtyLever = 'https://jobs.lever.co/acme/11223344?lever-source=referral&utm_medium=cpc';
    expect(DeduplicationEngine.cleanUrl(dirtyLever)).toBe('https://jobs.lever.co/acme/11223344');

    const dirtyAshby = 'https://jobs.ashbyhq.com/figma/abc-123?ashby_jid=tracking_val&utm_campaign=winter2026';
    expect(DeduplicationEngine.cleanUrl(dirtyAshby)).toBe('https://jobs.ashbyhq.com/figma/abc-123');
  });

  it('Level 3: Generates stable conservative canonical fingerprints', () => {
    const fp1 = DeduplicationEngine.generateCanonicalFingerprint(
      'company-uuid-1',
      'Principal Distributed Systems Engineer',
      ['San Francisco, CA', 'Remote - US']
    );

    const fp2 = DeduplicationEngine.generateCanonicalFingerprint(
      'company-uuid-1',
      'principal distributed systems engineer',
      ['remote - us', 'san francisco, ca']
    );

    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(64);
  });
});
