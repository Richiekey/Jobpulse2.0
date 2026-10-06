import { StateStore } from '@jobpulse/shared-state';
import { logger } from '@jobpulse/shared';
import {
  DiscoveryCandidate,
  DiscoveryRunOptions,
  DiscoveryRunMetrics,
} from './types.js';
import { DiscoveryProvider } from './providers/provider.interface.js';
import { normalizeCandidate } from './normalization.js';
import { deduplicateCandidates } from './deduplication.js';
import { createInitialMetrics } from './metrics.js';

export interface DiscoveryEnricher {
  enrich(candidate: DiscoveryCandidate): Promise<DiscoveryCandidate>;
}

export interface DiscoveryScorer {
  score(candidate: DiscoveryCandidate): number;
}

export class DiscoveryOrchestrator {
  constructor(
    private readonly providers: DiscoveryProvider[],
    private readonly store: StateStore,
    private readonly enricher?: DiscoveryEnricher,
    private readonly scorer?: DiscoveryScorer,
  ) {}

  async run(options: DiscoveryRunOptions = {}): Promise<DiscoveryRunMetrics> {
    const startTime = Date.now();
    const metrics = createInitialMetrics();

    // 1. Resolve active providers
    let activeProviders = this.providers;
    if (options.provider) {
      const normalizedReq = options.provider.toLowerCase();
      activeProviders = this.providers.filter((p) => p.name.toLowerCase() === normalizedReq);
      if (activeProviders.length === 0) {
        logger.warn(`No discovery provider matched name: ${options.provider}`);
        metrics.duration_ms = Date.now() - startTime;
        return metrics;
      }
    }

    metrics.providers_attempted = activeProviders.length;

    // 2. Execute providers
    const allRawCandidates: DiscoveryCandidate[] = [];

    for (const provider of activeProviders) {
      try {
        if (options.verbose) {
          logger.info(`Running discovery provider: ${provider.name}...`);
        }
        const candidates = await provider.discover({
          limit: options.limit,
          dryRun: options.dryRun,
          verbose: options.verbose,
        });
        metrics.providers_succeeded++;
        allRawCandidates.push(...candidates);
        if (options.verbose) {
          logger.info(`Provider ${provider.name} produced ${candidates.length} candidates.`);
        }
      } catch (err) {
        metrics.errors++;
        logger.error(`Discovery provider ${provider.name} failed:`, { error: String(err) });
      }
    }

    metrics.raw_candidates = allRawCandidates.length;

    // 3. Normalize candidates
    const normalizedCandidates: DiscoveryCandidate[] = [];
    for (const raw of allRawCandidates) {
      const normalized = normalizeCandidate(raw);
      if (normalized) {
        normalizedCandidates.push(normalized);
      } else {
        metrics.candidates_skipped++;
      }
    }

    // 4. Deduplicate candidates across all providers
    let uniqueCandidates = deduplicateCandidates(normalizedCandidates);
    metrics.duplicate_candidates = normalizedCandidates.length - uniqueCandidates.length;
    metrics.unique_companies = uniqueCandidates.length;

    // 5. Enrichment (Careers Discovery & ATS Detection) if enricher configured
    if (this.enricher) {
      const enrichPromises = uniqueCandidates.map(async (candidate) => {
        try {
          return await this.enricher!.enrich(candidate);
        } catch (err) {
          metrics.errors++;
          logger.warn(`Enrichment failed for ${candidate.company_domain}:`, { error: String(err) });
          return candidate;
        }
      });
      uniqueCandidates = await Promise.all(enrichPromises);
    }

    // 6. Scoring if scorer configured
    if (this.scorer) {
      for (const candidate of uniqueCandidates) {
        candidate.confidence = this.scorer.score(candidate);
      }
      // Sort candidates by confidence descending
      uniqueCandidates.sort((a, b) => b.confidence - a.confidence);
    }

    // 7. Enforce limit if specified
    if (options.limit && uniqueCandidates.length > options.limit) {
      uniqueCandidates = uniqueCandidates.slice(0, options.limit);
    }

    // 8. Tally metrics from candidate properties
    for (const c of uniqueCandidates) {
      if (c.careers_url) metrics.careers_pages_found++;
      if (c.detected_ats && c.detected_ats !== 'UNKNOWN') {
        metrics.ats_detected++;
        metrics.supported_ats_detected++;
      }
      metrics.job_evidence_count += c.job_evidence.length;
    }

    // 9. Persist to StateStore
    const now = new Date().toISOString();

    for (const candidate of uniqueCandidates) {
      try {
        const existing = await this.store.findRecord({ domain: candidate.company_domain });

        if (existing) {
          // Company already exists: idempotently update metadata
          const existingProviders: string[] = Array.isArray(existing.discovery_providers)
            ? existing.discovery_providers
            : existing.discovery_source
            ? [existing.discovery_source]
            : [];

          const incomingProviders = [candidate.discovered_from, ...candidate.evidence.map((e) => e.provider)];
          const mergedProviders = Array.from(new Set([...existingProviders, ...incomingProviders]));

          const existingEvidence: any[] = Array.isArray(existing.discovery_evidence)
            ? existing.discovery_evidence
            : [];
          const evidenceKey = (e: any) => `${e.provider}:${e.evidence_type}:${e.url || ''}`;
          const evidenceMap = new Map();
          for (const ev of existingEvidence) evidenceMap.set(evidenceKey(ev), ev);
          for (const ev of candidate.evidence) evidenceMap.set(evidenceKey(ev), ev);
          const mergedEvidence = Array.from(evidenceMap.values());

          const existingJobs: any[] = Array.isArray(existing.job_evidence)
            ? existing.job_evidence
            : [];
          const jobMap = new Map();
          for (const j of existingJobs) jobMap.set(j.job_url, j);
          for (const j of candidate.job_evidence) jobMap.set(j.job_url, j);
          const mergedJobs = Array.from(jobMap.values());

          const updatePayload: Record<string, any> = {
            last_seen_at: now,
            discovery_providers: mergedProviders,
            discovery_evidence: mergedEvidence,
            job_evidence: mergedJobs,
            job_evidence_count: mergedJobs.length,
          };

          if (candidate.detected_ats && (!existing.ats_provider || existing.ats_provider === 'UNKNOWN')) {
            updatePayload.ats_provider = candidate.detected_ats;
          }
          if (candidate.careers_url && !existing.careers_url) {
            updatePayload.careers_url = candidate.careers_url;
          }
          if (candidate.ats_url && !existing.detection_url) {
            updatePayload.detection_url = candidate.ats_url;
          }
          if (candidate.board_identifier && !existing.board_identifier) {
            updatePayload.board_identifier = candidate.board_identifier;
          }

          await this.store.updateRecord(existing.id, updatePayload);
          metrics.candidates_updated++;
        } else {
          // Brand new discovery candidate: insert with DISCOVERED status
          const providerList = Array.from(
            new Set([candidate.discovered_from, ...candidate.evidence.map((e) => e.provider)]),
          );

          await this.store.insertRecord({
            domain: candidate.company_domain,
            company_name: candidate.company_name,
            discovery_status: 'DISCOVERED',
            verification_status: 'PENDING',
            discovery_source: candidate.discovered_from,
            discovery_providers: providerList,
            discovery_evidence: candidate.evidence,
            job_evidence: candidate.job_evidence,
            careers_url: candidate.careers_url ?? null,
            detection_url: candidate.ats_url ?? candidate.careers_url ?? candidate.source_url ?? null,
            ats_provider: candidate.detected_ats ?? 'UNKNOWN',
            board_identifier: candidate.board_identifier ?? null,
            job_evidence_count: candidate.job_evidence.length,
            first_discovered_at: candidate.discovered_at || now,
            last_seen_at: now,
          });
          metrics.candidates_persisted++;
        }
      } catch (err) {
        metrics.errors++;
        logger.error(`Failed to persist candidate ${candidate.company_domain}:`, { error: String(err) });
      }
    }

    metrics.duration_ms = Date.now() - startTime;
    return metrics;
  }
}
