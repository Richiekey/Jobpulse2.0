import { ATSAdapterRegistry } from '@jobpulse/ats';
import { DiscoveryCandidate } from './types.js';

export const DISCOVERY_WEIGHTS = {
  SUPPORTED_ATS_DETECTED:    +30,
  VERIFIED_COMPANY_DOMAIN:   +20,
  CAREERS_PAGE_FOUND:        +20,
  ACTIVE_JOB_EVIDENCE:       +15,
  ATS_URL_IDENTIFIED:        +10,
  MULTIPLE_PROVIDERS:         +5,
  CAREERS_UNREACHABLE:       -20,
  UNSUPPORTED_ATS:           -20,
  DEAD_CANDIDATE:            -30,
} as const;

/**
 * Pre-persistence confidence scoring for candidate prioritization.
 * Clamps output strictly between 0 and 100.
 */
export function scoreCandidate(candidate: DiscoveryCandidate): number {
  let score = 0;

  // 1. ATS Platform evaluation
  if (candidate.detected_ats && candidate.detected_ats !== 'UNKNOWN') {
    const slug = candidate.detected_ats.toLowerCase().trim();
    if (ATSAdapterRegistry.hasAdapter(slug) || ATSAdapterRegistry.isKnownPlatform(slug)) {
      score += DISCOVERY_WEIGHTS.SUPPORTED_ATS_DETECTED;
    } else {
      score += DISCOVERY_WEIGHTS.UNSUPPORTED_ATS;
    }
  }

  // 2. Company domain validation
  if (candidate.company_domain && !candidate.company_domain.includes('localhost')) {
    score += DISCOVERY_WEIGHTS.VERIFIED_COMPANY_DOMAIN;
  }

  // 3. Careers page found
  if (candidate.careers_url) {
    score += DISCOVERY_WEIGHTS.CAREERS_PAGE_FOUND;
  }

  // 4. Active job proof
  if (candidate.job_evidence && candidate.job_evidence.length > 0) {
    score += DISCOVERY_WEIGHTS.ACTIVE_JOB_EVIDENCE;
  }

  // 5. ATS URL identified
  if (candidate.ats_url) {
    score += DISCOVERY_WEIGHTS.ATS_URL_IDENTIFIED;
  }

  // 6. Multi-provider corroboration
  const distinctProviders = new Set([
    candidate.discovered_from,
    ...(candidate.evidence || []).map((e) => e.provider),
  ]);
  if (distinctProviders.size > 1) {
    score += DISCOVERY_WEIGHTS.MULTIPLE_PROVIDERS;
  }

  // Clamped to [0, 100]
  return Math.max(0, Math.min(100, score));
}

export class DefaultDiscoveryScorer {
  score(candidate: DiscoveryCandidate): number {
    return scoreCandidate(candidate);
  }
}
