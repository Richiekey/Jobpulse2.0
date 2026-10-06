import { describe, it, expect, vi } from 'vitest';
import { InMemoryStateStore, StateStore } from '@jobpulse/shared-state';
import { DiscoveryOrchestrator } from '../src/orchestrator.js';
import { DiscoveryProvider } from '../src/providers/provider.interface.js';
import { DiscoveryCandidate } from '../src/types.js';

describe('Dry-Run Isolation', () => {
  it('guarantees zero database calls when run with InMemoryStateStore', async () => {
    // Mock a fallback store (simulating SupabaseStateStore)
    const mockDbStore: StateStore = {
      queryByStatus: vi.fn(),
      updateRecord: vi.fn(),
      insertRecord: vi.fn(),
      bulkUpdateStatus: vi.fn(),
      findRecord: vi.fn().mockResolvedValue(null),
      queryAll: vi.fn(),
    };

    // InMemoryStateStore wrapping the mock db store
    const store = new InMemoryStateStore(mockDbStore);

    const candidates: DiscoveryCandidate[] = [
      {
        company_name: 'Acme',
        company_domain: 'acme.com',
        job_evidence: [],
        discovered_from: 'test-p',
        discovered_at: '2026-10-07T00:00:00Z',
        evidence: [],
        confidence: 0.8,
      },
    ];

    const provider: DiscoveryProvider = {
      name: 'test-p',
      discover: async () => candidates,
    };

    const orchestrator = new DiscoveryOrchestrator([provider], store);
    const metrics = await orchestrator.run({ dryRun: true });

    expect(metrics.candidates_persisted).toBe(1);

    // Verify mutations never hit mockDbStore
    expect(mockDbStore.insertRecord).not.toHaveBeenCalled();
    expect(mockDbStore.updateRecord).not.toHaveBeenCalled();
    expect(mockDbStore.bulkUpdateStatus).not.toHaveBeenCalled();

    // Verify record exists in memory
    const inMemoryRecords = store.getAllRecords();
    expect(inMemoryRecords.length).toBe(1);
    expect(inMemoryRecords[0]!.id).toMatch(/^dry-run-/);
    expect(inMemoryRecords[0]!.domain).toBe('acme.com');
  });
});
