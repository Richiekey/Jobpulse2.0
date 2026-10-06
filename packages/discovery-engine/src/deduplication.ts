import { DiscoveryCandidate, JobEvidence, DiscoveryEvidence } from './types.js';

/**
 * Deduplicates a list of discovery candidates by normalized company domain.
 * Combines evidence, job proofs, and chooses highest-confidence ATS metadata.
 */
export function deduplicateCandidates(candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const byDomain = new Map<string, DiscoveryCandidate>();

  for (const candidate of candidates) {
    const domain = candidate.company_domain;
    if (!domain) continue;

    const existing = byDomain.get(domain);
    if (!existing) {
      byDomain.set(domain, {
        ...candidate,
        job_evidence: [...candidate.job_evidence],
        evidence: [...candidate.evidence],
      });
      continue;
    }

    // Merge job evidence (deduplicate by job_url)
    const existingJobUrls = new Set(existing.job_evidence.map((j) => j.job_url));
    const mergedJobEvidence: JobEvidence[] = [...existing.job_evidence];
    for (const job of candidate.job_evidence) {
      if (!existingJobUrls.has(job.job_url)) {
        existingJobUrls.add(job.job_url);
        mergedJobEvidence.push(job);
      }
    }

    // Merge structured evidence (deduplicate by provider + evidence_type + url)
    const evidenceKey = (e: DiscoveryEvidence) => `${e.provider}:${e.evidence_type}:${e.url || ''}`;
    const existingEvidenceKeys = new Set(existing.evidence.map(evidenceKey));
    const mergedEvidence: DiscoveryEvidence[] = [...existing.evidence];
    for (const ev of candidate.evidence) {
      const key = evidenceKey(ev);
      if (!existingEvidenceKeys.has(key)) {
        existingEvidenceKeys.add(key);
        mergedEvidence.push(ev);
      }
    }

    // Choose best ATS information (favor detected ATS and higher confidence)
    const preferIncomingAts =
      (!existing.detected_ats && Boolean(candidate.detected_ats)) ||
      (Boolean(candidate.detected_ats) && candidate.confidence > existing.confidence);

    const detected_ats = preferIncomingAts ? candidate.detected_ats : existing.detected_ats;
    const ats_url = preferIncomingAts ? (candidate.ats_url ?? existing.ats_url) : (existing.ats_url ?? candidate.ats_url);
    const board_identifier = preferIncomingAts ? (candidate.board_identifier ?? existing.board_identifier) : (existing.board_identifier ?? candidate.board_identifier);

    // Pick best company name (prefer longer/more capitalized name over bare slug)
    const company_name =
      candidate.company_name.length > existing.company_name.length
        ? candidate.company_name
        : existing.company_name;

    // Pick earliest discovered_at
    const discovered_at =
      existing.discovered_at < candidate.discovered_at
        ? existing.discovered_at
        : candidate.discovered_at;

    const merged: DiscoveryCandidate = {
      company_name,
      company_domain: domain,
      careers_url: existing.careers_url ?? candidate.careers_url ?? null,
      source_url: existing.source_url ?? candidate.source_url ?? null,
      detected_ats: detected_ats ?? null,
      ats_url: ats_url ?? null,
      board_identifier: board_identifier ?? null,
      job_evidence: mergedJobEvidence,
      discovered_from: existing.discovered_from,
      discovered_at,
      evidence: mergedEvidence,
      confidence: Math.max(existing.confidence, candidate.confidence),
    };

    byDomain.set(domain, merged);
  }

  return Array.from(byDomain.values());
}
