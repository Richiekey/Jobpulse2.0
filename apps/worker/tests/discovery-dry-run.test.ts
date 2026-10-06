import { describe, it, expect, vi } from 'vitest';
import { DiscoveryEngineRunner } from '../src/engine/discovery-engine-runner.js';
import { supabase } from '../src/db.js';
import { HackerNewsHiringProvider, AtsDirectoryProvider } from '@jobpulse/discovery-engine';

vi.mock('../src/db.js', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  },
}));

// Mock providers on the prototype
const mockHnDiscover = vi.spyOn(HackerNewsHiringProvider.prototype, 'discover');
const mockAtsDiscover = vi.spyOn(AtsDirectoryProvider.prototype, 'discover');

describe('DiscoveryEngineRunner Dry-Run Isolation (P1)', () => {
  it('does not instantiate or use Supabase-backed persistence when dryRun is true', async () => {
    mockHnDiscover.mockResolvedValue([
      {
        company_name: 'TestCo',
        company_domain: 'testco.com',
        careers_url: null,
        detected_ats: null,
        ats_url: null,
        board_identifier: null,
        job_evidence: [],
        discovered_from: 'hn-hiring',
        discovered_at: new Date().toISOString(),
        evidence: [],
        confidence: 0.8,
      },
    ]);
    
    mockAtsDiscover.mockResolvedValue([]);

    const runner = new DiscoveryEngineRunner();
    
    const metrics = await runner.run({ dryRun: true });

    expect(metrics).toBeDefined();
    expect(metrics.raw_candidates).toBeGreaterThanOrEqual(1);

    // Verify absolutely no Supabase calls occurred
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
