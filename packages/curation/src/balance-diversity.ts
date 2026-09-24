/**
 * JobPulse Diversity & Anti-Monopoly Balancing Algorithm
 *
 * Enforces company caps & ATS platform distribution,
 * deduplicates multi-location postings, relaxes constraints gracefully,
 * and interleaves results so consecutive items in the feed alternate companies.
 */

import type { CurationCriteria, ScoredJob, DiversitySummary, CurationResult } from './types.js';

export function balanceJobDiversity(
  scoredJobs: ScoredJob[],
  criteria: CurationCriteria = {}
): CurationResult {
  const targetTotal = criteria.targetTotalJobs ?? 1000;
  const maxPerCompany = criteria.maxJobsPerCompany ?? 3;
  const minScore = criteria.minScoreThreshold ?? 0; // if zero/not set, include all valid scored jobs

  // Filter out jobs below minimum score threshold, sorted by score DESC
  const qualified = scoredJobs
    .filter((j) => j.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore);

  // Group by ATS source
  const sourceBuckets = new Map<string, ScoredJob[]>();
  qualified.forEach((job) => {
    const src = (job.source || job.ats_platform_slug || 'OTHER').toUpperCase();
    if (!sourceBuckets.has(src)) sourceBuckets.set(src, []);
    sourceBuckets.get(src)!.push(job);
  });

  // Track counts per company
  const companyCounts = new Map<string, number>();
  const selected: ScoredJob[] = [];
  const selectedIds = new Set<string>();
  const seenJobSignatures = new Set<string>();

  // Helper to add job if company cap permits and job is not a duplicate title
  const tryAddJob = (job: ScoredJob, allowedCap: number): boolean => {
    if (selectedIds.has(job.id)) return false;

    const rawComp = (job.company_name || 'Unknown').trim().toLowerCase();
    const rawTitle = (job.title || job.canonical_title || job.display_title || 'Untitled').trim().toLowerCase();
    const compKey = rawComp.replace(/[^a-z0-9]/g, '');
    const titleKey = rawTitle.replace(/[^a-z0-9]/g, '');
    const signature = `${compKey}:::${titleKey}`;

    if (seenJobSignatures.has(signature)) return false;

    const currentCount = companyCounts.get(rawComp) || 0;
    if (currentCount >= allowedCap) return false;

    companyCounts.set(rawComp, currentCount + 1);
    seenJobSignatures.add(signature);
    selected.push(job);
    selectedIds.add(job.id);
    return true;
  };

  // Pass 1: Proportional / Round-robin across ATS platforms with strict company cap
  const allSources = Array.from(sourceBuckets.keys());
  let madeProgress = true;
  const sourcePointers: Record<string, number> = {};
  allSources.forEach((s) => { sourcePointers[s] = 0; });

  while (selected.length < targetTotal && madeProgress) {
    madeProgress = false;
    for (const src of allSources) {
      if (selected.length >= targetTotal) break;
      const bucket = sourceBuckets.get(src) || [];
      let ptr = sourcePointers[src] ?? 0;

      while (ptr < bucket.length) {
        const candidate = bucket[ptr++];
        sourcePointers[src] = ptr;
        if (candidate && tryAddJob(candidate, maxPerCompany)) {
          madeProgress = true;
          break; // Move to next ATS to keep round-robin diversity
        }
      }
    }
  }

  // Pass 2: If we still haven't reached target total due to strict company caps, relax company cap
  if (selected.length < targetTotal) {
    const relaxedCap = maxPerCompany + 2;
    for (const job of qualified) {
      if (selected.length >= targetTotal) break;
      tryAddJob(job, relaxedCap);
    }
  }

  // Pass 3: Final backfill from qualified if needed with unbounded company cap
  if (selected.length < targetTotal) {
    for (const job of qualified) {
      if (selected.length >= targetTotal) break;
      tryAddJob(job, Number.MAX_SAFE_INTEGER);
    }
  }

  // Final Interleaving: Round-robin by company so consecutive jobs don't repeat the same company
  const companyQueues = new Map<string, ScoredJob[]>();
  for (const job of selected) {
    const compKey = (job.company_name || 'Unknown').trim().toLowerCase();
    if (!companyQueues.has(compKey)) companyQueues.set(compKey, []);
    companyQueues.get(compKey)!.push(job);
  }

  const interleaved: ScoredJob[] = [];
  let remaining = selected.length;
  while (remaining > 0) {
    for (const [_, queue] of companyQueues.entries()) {
      if (queue.length > 0) {
        interleaved.push(queue.shift()!);
        remaining--;
      }
    }
  }

  // Calculate Diversity Summary Metrics
  const atsBreakdown: Record<string, number> = {};
  const roleBreakdown: Record<string, number> = {};
  let totalScore = 0;

  interleaved.forEach((j) => {
    const src = (j.source || j.ats_platform_slug || 'OTHER').toUpperCase();
    atsBreakdown[src] = (atsBreakdown[src] || 0) + 1;

    const role = (j.role_category || j.job_function_slug || 'engineering').toUpperCase();
    roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;

    totalScore += j.matchScore;
  });

  const summary: DiversitySummary = {
    totalSelected: interleaved.length,
    uniqueCompanies: companyCounts.size,
    atsBreakdown,
    roleBreakdown,
    averageScore: interleaved.length > 0 ? Math.round(totalScore / interleaved.length) : 0,
  };

  return {
    selectedJobs: interleaved,
    summary,
  };
}
