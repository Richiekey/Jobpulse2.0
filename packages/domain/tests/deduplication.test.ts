import { describe, it, expect } from 'vitest';
import { DeduplicationEngine } from '../src/deduplication.ts';

describe('DeduplicationEngine', () => {
  it('strips tracking and session parameters from URLs', () => {
    const dirtyUrl = 'https://boards.greenhouse.io/stripe/jobs/12345?utm_source=linkedin&utm_medium=cpc&gh_jid=12345#app';
    const clean = DeduplicationEngine.cleanUrl(dirtyUrl);
    expect(clean).toBe('https://boards.greenhouse.io/stripe/jobs/12345#app');
  });

  it('generates consistent payload hashes', () => {
    const payload1 = { title: 'Engineer', salary: 150000 };
    const payload2 = { title: 'Engineer', salary: 150000 };
    const hash1 = DeduplicationEngine.hashPayload(payload1);
    const hash2 = DeduplicationEngine.hashPayload(payload2);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('generates stable canonical fingerprints', () => {
    const fp1 = DeduplicationEngine.generateCanonicalFingerprint(
      'company-1',
      'Senior Software Engineer',
      ['San Francisco, CA', 'Remote']
    );
    const fp2 = DeduplicationEngine.generateCanonicalFingerprint(
      'company-1',
      'senior software engineer',
      ['remote', 'San Francisco, CA']
    );
    expect(fp1).toBe(fp2);
  });
});
