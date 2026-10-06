import { describe, it, expect } from 'vitest';
import { InMemoryStateStore } from '@jobpulse/shared-state';
import { DiscoveryOrchestrator } from '../src/orchestrator.js';
import { DiscoveryProvider } from '../src/providers/provider.interface.js';
import { DiscoveryCandidate } from '../src/types.js';

describe('Persistence & Idempotency', () => {
  it('inserts new candidate as DISCOVERED and updates idempotently on repeat runs', async () => {
    const store = new InMemoryStateStore();

    const candidate: DiscoveryCandidate = {
      company_name: 'Linear',
      company_domain: 'linear.app',
      careers_url: 'https://linear.app/careers',
      detected_ats: 'ashby',
      ats_url: 'https://jobs.ashbyhq.com/linear',
      board_identifier: 'linear',
      job_evidence: [
        {
          job_url: 'https://jobs.ashbyhq.com/linear/123',
          job_title: 'Full Stack Engineer',
          discovered_at: '2026-10-07T00:00:00Z',
          source_provider: 'test-p1',
        },
      ],
      discovered_from: 'test-p1',
      discovered_at: '2026-10-07T00:00:00Z',
      evidence: [
        {
          provider: 'test-p1',
          timestamp: '2026-10-07T00:00:00Z',
          evidence_type: 'initial_discovery',
          url: 'https://linear.app',
        },
      ],
      confidence: 0.9,
    };

    const mockProvider1: DiscoveryProvider = {
      name: 'test-p1',
      discover: async () => [candidate],
    };

    const orchestrator1 = new DiscoveryOrchestrator([mockProvider1], store);
    const metrics1 = await orchestrator1.run();

    expect(metrics1.candidates_persisted).toBe(1);
    expect(metrics1.candidates_updated).toBe(0);

    const stored1 = await store.findRecord({ domain: 'linear.app' });
    expect(stored1).not.toBeNull();
    expect(stored1!.discovery_status).toBe('DISCOVERED');
    expect(stored1!.ats_provider).toBe('ashby');
    expect(stored1!.discovery_providers).toContain('test-p1');

    // Run a second time with a different provider finding the same domain
    const candidate2: DiscoveryCandidate = {
      ...candidate,
      discovered_from: 'test-p2',
      evidence: [
        {
          provider: 'test-p2',
          timestamp: '2026-10-07T01:00:00Z',
          evidence_type: 'corroboration',
          url: 'https://linear.app/jobs',
        },
      ],
    };

    const mockProvider2: DiscoveryProvider = {
      name: 'test-p2',
      discover: async () => [candidate2],
    };

    const orchestrator2 = new DiscoveryOrchestrator([mockProvider2], store);
    const metrics2 = await orchestrator2.run();

    expect(metrics2.candidates_persisted).toBe(0);
    expect(metrics2.candidates_updated).toBe(1);

    // Verify record in store was merged, not duplicated
    const allRecords = store.getAllRecords();
    expect(allRecords.length).toBe(1);

    const updated = allRecords[0]!;
    expect(updated.discovery_providers).toContain('test-p1');
    expect(updated.discovery_providers).toContain('test-p2');
    expect(updated.discovery_evidence!.length).toBe(2);
    expect(updated.job_evidence_count).toBe(2);
  });
});
