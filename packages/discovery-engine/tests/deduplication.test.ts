import { describe, it, expect } from 'vitest';
import { deduplicateCandidates } from '../src/deduplication.js';
import { DiscoveryCandidate } from '../src/types.js';

describe('Deduplication Module', () => {
  it('merges candidates with the same normalized company domain', () => {
    const c1: DiscoveryCandidate = {
      company_name: 'Stripe',
      company_domain: 'stripe.com',
      careers_url: 'https://stripe.com/jobs',
      source_url: 'https://news.ycombinator.com/item?id=1',
      detected_ats: null,
      ats_url: null,
      job_evidence: [
        {
          job_url: 'https://stripe.com/jobs/1',
          job_title: 'Backend Engineer',
          discovered_at: '2026-10-06T10:00:00Z',
          source_provider: 'hn-hiring',
        },
      ],
      discovered_from: 'hn-hiring',
      discovered_at: '2026-10-06T10:00:00Z',
      evidence: [
        {
          provider: 'hn-hiring',
          timestamp: '2026-10-06T10:00:00Z',
          evidence_type: 'hn_comment',
          url: 'https://news.ycombinator.com/item?id=1',
        },
      ],
      confidence: 0.65,
    };

    const c2: DiscoveryCandidate = {
      company_name: 'Stripe Inc',
      company_domain: 'stripe.com',
      careers_url: 'https://boards.greenhouse.io/stripe',
      source_url: 'https://boards.greenhouse.io/sitemap.xml',
      detected_ats: 'greenhouse',
      ats_url: 'https://boards.greenhouse.io/stripe',
      board_identifier: 'stripe',
      job_evidence: [
        {
          job_url: 'https://stripe.com/jobs/2',
          job_title: 'Frontend Engineer',
          discovered_at: '2026-10-07T10:00:00Z',
          source_provider: 'ats-directory',
        },
      ],
      discovered_from: 'ats-directory',
      discovered_at: '2026-10-07T10:00:00Z',
      evidence: [
        {
          provider: 'ats-directory',
          timestamp: '2026-10-07T10:00:00Z',
          evidence_type: 'sitemap_discovery',
          url: 'https://boards.greenhouse.io/sitemap.xml',
        },
      ],
      confidence: 0.90,
    };

    const merged = deduplicateCandidates([c1, c2]);
    expect(merged.length).toBe(1);

    const result = merged[0]!;
    expect(result.company_domain).toBe('stripe.com');
    expect(result.company_name).toBe('Stripe Inc'); // longer/more descriptive name preferred
    expect(result.detected_ats).toBe('greenhouse'); // higher confidence ATS preferred
    expect(result.ats_url).toBe('https://boards.greenhouse.io/stripe');
    expect(result.confidence).toBe(0.90);

    // Both job evidence records merged
    expect(result.job_evidence.length).toBe(2);
    expect(result.job_evidence.map((j) => j.job_title)).toEqual(
      expect.arrayContaining(['Backend Engineer', 'Frontend Engineer'])
    );

    // Both structured evidence records merged
    expect(result.evidence.length).toBe(2);
    expect(result.evidence.map((e) => e.provider)).toEqual(
      expect.arrayContaining(['hn-hiring', 'ats-directory'])
    );
  });

  it('deduplicates identical job URLs and structured evidence entries', () => {
    const c1: DiscoveryCandidate = {
      company_name: 'Acme',
      company_domain: 'acme.com',
      job_evidence: [
        {
          job_url: 'https://acme.com/jobs/1',
          job_title: 'Engineer',
          discovered_at: '2026-10-07T00:00:00Z',
          source_provider: 'test',
        },
      ],
      discovered_from: 'test',
      discovered_at: '2026-10-07T00:00:00Z',
      evidence: [
        {
          provider: 'test',
          timestamp: '2026-10-07T00:00:00Z',
          evidence_type: 'manual',
          url: 'https://acme.com',
        },
      ],
      confidence: 0.7,
    };

    const c2: DiscoveryCandidate = {
      ...c1,
      job_evidence: [
        {
          job_url: 'https://acme.com/jobs/1', // duplicate URL
          job_title: 'Engineer',
          discovered_at: '2026-10-07T00:00:00Z',
          source_provider: 'test',
        },
      ],
    };

    const merged = deduplicateCandidates([c1, c2]);
    expect(merged.length).toBe(1);
    expect(merged[0]!.job_evidence.length).toBe(1);
    expect(merged[0]!.evidence.length).toBe(1);
  });
});
