import { DiscoveryRunMetrics } from './types.js';

export function createInitialMetrics(): DiscoveryRunMetrics {
  return {
    providers_attempted: 0,
    providers_succeeded: 0,
    raw_candidates: 0,
    unique_companies: 0,
    duplicate_candidates: 0,
    careers_pages_found: 0,
    ats_detected: 0,
    supported_ats_detected: 0,
    unsupported_ats: 0,
    job_evidence_count: 0,
    candidates_persisted: 0,
    candidates_updated: 0,
    candidates_skipped: 0,
    errors: 0,
    duration_ms: 0,
  };
}

export function formatMetricsSummary(metrics: DiscoveryRunMetrics, isDryRun: boolean = false): string {
  return [
    `=== Discovery Engine V1 Report ${isDryRun ? '(DRY-RUN)' : '(LIVE)'} ===`,
    `Providers Attempted:      ${metrics.providers_attempted}`,
    `Providers Succeeded:      ${metrics.providers_succeeded}`,
    `Raw Candidates:          ${metrics.raw_candidates}`,
    `Unique Companies:         ${metrics.unique_companies}`,
    `Duplicate Candidates:     ${metrics.duplicate_candidates}`,
    `Careers Pages Found:      ${metrics.careers_pages_found}`,
    `ATS Detected:             ${metrics.ats_detected}`,
    `  Supported ATS:          ${metrics.supported_ats_detected}`,
    `  Unsupported ATS:        ${metrics.unsupported_ats}`,
    `Job Evidence Count:       ${metrics.job_evidence_count}`,
    `Candidates Persisted:     ${metrics.candidates_persisted}`,
    `Candidates Updated:       ${metrics.candidates_updated}`,
    `Candidates Skipped:       ${metrics.candidates_skipped}`,
    `Errors:                   ${metrics.errors}`,
    `Duration:                 ${metrics.duration_ms}ms`,
    `=============================================`,
  ].join('\n');
}
