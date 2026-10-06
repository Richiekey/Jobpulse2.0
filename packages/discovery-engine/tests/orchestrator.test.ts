import { describe, it, expect, vi } from 'vitest';
import { InMemoryStateStore } from '@jobpulse/shared-state';
import { DiscoveryOrchestrator } from '../src/orchestrator.js';
import { DiscoveryProvider } from '../src/providers/provider.interface.js';
import { DiscoveryCandidate } from '../src/types.js';

describe('DiscoveryOrchestrator', () => {
  it('runs complete pipeline: discovery -> normalize -> dedup -> persist -> metrics', async () => {
    const store = new InMemoryStateStore();

    const p1Candidates: DiscoveryCandidate[] = [
      {
        company_name: 'Figma',
        company_domain: 'FIGMA.COM',
        careers_url: 'http://figma.com/careers/?utm_source=twitter',
        detected_ats: 'greenhouse',
        ats_url: 'https://boards.greenhouse.io/figma',
        board_identifier: 'figma',
        job_evidence: [
          {
            job_url: 'https://boards.greenhouse.io/figma/jobs/1',
            job_title: 'Software Engineer',
            discovered_at: '2026-10-07T00:00:00Z',
            source_provider: 'p1',
          },
        ],
        discovered_from: 'p1',
        discovered_at: '2026-10-07T00:00:00Z',
        evidence: [
          { provider: 'p1', timestamp: '2026-10-07T00:00:00Z', evidence_type: 'web' },
        ],
        confidence: 0.85,
      },
    ];

    const p2Candidates: DiscoveryCandidate[] = [
      {
        company_name: 'Figma Design',
        company_domain: 'figma.com',
        detected_ats: null,
        job_evidence: [],
        discovered_from: 'p2',
        discovered_at: '2026-10-07T01:00:00Z',
        evidence: [
          { provider: 'p2', timestamp: '2026-10-07T01:00:00Z', evidence_type: 'social' },
        ],
        confidence: 0.5,
      },
      {
        company_name: 'Linear',
        company_domain: 'linear.app',
        detected_ats: 'ashby',
        job_evidence: [],
        discovered_from: 'p2',
        discovered_at: '2026-10-07T01:00:00Z',
        evidence: [
          { provider: 'p2', timestamp: '2026-10-07T01:00:00Z', evidence_type: 'social' },
        ],
        confidence: 0.9,
      },
    ];

    const p1: DiscoveryProvider = { name: 'p1', discover: async () => p1Candidates };
    const p2: DiscoveryProvider = { name: 'p2', discover: async () => p2Candidates };

    const orchestrator = new DiscoveryOrchestrator([p1, p2], store);
    const metrics = await orchestrator.run();

    expect(metrics.providers_attempted).toBe(2);
    expect(metrics.providers_succeeded).toBe(2);
    expect(metrics.raw_candidates).toBe(3);
    expect(metrics.unique_companies).toBe(2); // Figma and Linear
    expect(metrics.duplicate_candidates).toBe(1);
    expect(metrics.candidates_persisted).toBe(2);
    expect(metrics.errors).toBe(0);

    const figma = await store.findRecord({ domain: 'figma.com' });
    expect(figma).not.toBeNull();
    expect(figma!.domain).toBe('figma.com');
    expect(figma!.ats_provider).toBe('greenhouse');
  });

  it('tolerates individual provider failure without crashing the run', async () => {
    const store = new InMemoryStateStore();

    const failingProvider: DiscoveryProvider = {
      name: 'failing',
      discover: async () => {
        throw new Error('API Rate Limit Exceeded');
      },
    };

    const succeedingProvider: DiscoveryProvider = {
      name: 'healthy',
      discover: async () => [
        {
          company_name: 'Stripe',
          company_domain: 'stripe.com',
          job_evidence: [],
          discovered_from: 'healthy',
          discovered_at: '2026-10-07T00:00:00Z',
          evidence: [],
          confidence: 0.8,
        },
      ],
    };

    const orchestrator = new DiscoveryOrchestrator([failingProvider, succeedingProvider], store);
    const metrics = await orchestrator.run();

    expect(metrics.providers_attempted).toBe(2);
    expect(metrics.providers_succeeded).toBe(1);
    expect(metrics.errors).toBe(1);
    expect(metrics.candidates_persisted).toBe(1);
  });
});
