import { describe, it, expect } from 'vitest';
import { scoreCandidate, DISCOVERY_WEIGHTS } from '../src/scoring.js';
import { DiscoveryCandidate } from '../src/types.js';

describe('Scoring Module', () => {
  it('awards full positive weights to a comprehensive candidate', () => {
    const candidate: DiscoveryCandidate = {
      company_name: 'Figma',
      company_domain: 'figma.com',
      careers_url: 'https://figma.com/careers',
      detected_ats: 'greenhouse',
      ats_url: 'https://boards.greenhouse.io/figma',
      job_evidence: [
        {
          job_url: 'https://boards.greenhouse.io/figma/jobs/1',
          job_title: 'Product Designer',
          discovered_at: '2026-10-07T00:00:00Z',
          source_provider: 'p1',
        },
      ],
      discovered_from: 'p1',
      discovered_at: '2026-10-07T00:00:00Z',
      evidence: [
        { provider: 'p1', timestamp: '2026-10-07T00:00:00Z', evidence_type: 'e1' },
        { provider: 'p2', timestamp: '2026-10-07T00:00:00Z', evidence_type: 'e2' },
      ],
      confidence: 0.9,
    };

    const score = scoreCandidate(candidate);
    // +30 (ATS) +20 (Domain) +20 (Careers) +15 (Job evidence) +10 (ATS URL) +5 (Multiple providers) = 100
    expect(score).toBe(100);
  });

  it('penalizes unknown / unsupported ATS platforms', () => {
    const candidate: DiscoveryCandidate = {
      company_name: 'Unknown ATS Co',
      company_domain: 'unknownats.com',
      detected_ats: 'nonexistent-custom-ats',
      job_evidence: [],
      discovered_from: 'p1',
      discovered_at: '2026-10-07T00:00:00Z',
      evidence: [],
      confidence: 0.2,
    };

    const score = scoreCandidate(candidate);
    // +20 (Domain) -20 (Unsupported ATS) = 0
    expect(score).toBe(0);
  });

  it('clamps candidate score strictly to [0, 100]', () => {
    const bareCandidate: DiscoveryCandidate = {
      company_name: 'Empty',
      company_domain: '',
      detected_ats: 'unsupported-ats-123',
      job_evidence: [],
      discovered_from: 'p1',
      discovered_at: '2026-10-07T00:00:00Z',
      evidence: [],
      confidence: 0,
    };

    expect(scoreCandidate(bareCandidate)).toBe(0);
  });
});
