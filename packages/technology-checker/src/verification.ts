import { SupabaseClient } from '@supabase/supabase-js';
import { logger, httpClient, HttpError } from '@jobpulse/shared';
import { ATSDetector, ATSAdapterRegistry } from '@jobpulse/ats';
import { CompanyNormalizer } from '@jobpulse/domain';
import { DiscoveryRateLimiter, DomainCircuitBreaker } from '@jobpulse/discovery-engine';
import { StateStore, DiscoveryRecord } from './state-store.js';
import { RetryClassifier } from './retry-classifier.js';
import { PipelineExecutionContext } from './execution-context.js';

export interface VerificationMetrics {
  totalProcessed: number;
  verified: number;
  probable: number;
  mismatch: number;
  inaccessible: number;
  unresolved: number;
  stale: number;
  retried: number;
  errors: number;
}

export interface VerifierOptions {
  rateLimiter?: DiscoveryRateLimiter;
  circuitBreaker?: DomainCircuitBreaker;
  retryClassifier?: RetryClassifier;
  workerId?: string;
  claimDurationMinutes?: number;
  maxVerificationAttempts?: number;
}

/**
 * Builds candidate verification URLs prioritizing rich evidence from Discovery Engine V1:
 * 1. Explicit careers_url (if present)
 * 2. detection_url (if present)
 * 3. URLs from job_evidence (if present)
 * 4. Standard conventional endpoints (/careers, /jobs, subdomains)
 */
export function buildVerificationUrls(record: {
  domain: string;
  detection_url?: string | null;
  careers_url?: string | null;
  job_evidence?: any[] | null;
}): string[] {
  const urls: string[] = [];
  const cleanDomain = record.domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();

  // 1. Explicit careers URL
  if (record.careers_url && typeof record.careers_url === 'string') {
    urls.push(record.careers_url);
  }

  // 2. Detection URL
  if (record.detection_url && typeof record.detection_url === 'string' && !urls.includes(record.detection_url)) {
    urls.push(record.detection_url);
  }

  // 3. URLs from job_evidence
  if (Array.isArray(record.job_evidence)) {
    for (const item of record.job_evidence) {
      const url = typeof item === 'string' ? item : item?.url || item?.job_url;
      if (typeof url === 'string' && url.startsWith('http') && !urls.includes(url)) {
        urls.push(url);
      }
    }
  }

  // 4. Standard conventional endpoints
  const standard = [
    `https://${cleanDomain}/careers`,
    `https://${cleanDomain}/jobs`,
    `https://careers.${cleanDomain}`,
    `https://jobs.${cleanDomain}`,
    `https://${cleanDomain}`,
  ];

  for (const url of standard) {
    if (!urls.includes(url)) {
      urls.push(url);
    }
  }

  return urls;
}

export class TechnologyCheckerVerifier {
  private readonly store: StateStore;
  private readonly rateLimiter: DiscoveryRateLimiter;
  private readonly circuitBreaker: DomainCircuitBreaker;
  private readonly retryClassifier: RetryClassifier;
  private readonly workerId: string;
  private readonly claimDurationMinutes: number;
  private readonly maxVerificationAttempts: number;

  constructor(
    contextOrStore: PipelineExecutionContext | StateStore,
    options?: VerifierOptions
  ) {
    if (contextOrStore instanceof PipelineExecutionContext) {
      this.store = contextOrStore.store;
      this.rateLimiter = contextOrStore.rateLimiter;
      this.circuitBreaker = contextOrStore.circuitBreaker;
      this.retryClassifier = contextOrStore.retryClassifier;
      this.workerId = contextOrStore.workerId;
      this.claimDurationMinutes = contextOrStore.claimDurationMinutes;
      this.maxVerificationAttempts = contextOrStore.maxVerificationAttempts;
    } else {
      this.store = contextOrStore;
      this.rateLimiter = options?.rateLimiter ?? new DiscoveryRateLimiter();
      this.circuitBreaker = options?.circuitBreaker ?? new DomainCircuitBreaker();
      this.retryClassifier = options?.retryClassifier ?? new RetryClassifier();
      this.workerId = options?.workerId ?? `verifier-${Math.random().toString(36).substring(2, 9)}`;
      this.claimDurationMinutes = options?.claimDurationMinutes ?? 10;
      this.maxVerificationAttempts = options?.maxVerificationAttempts ?? 3;
    }
  }

  /**
   * Phase 4 + Phase 6: Atomically claim DISCOVERED records (MC-1), transition to VERIFYING,
   * then resolve to VERIFIED (or a terminal/retry verification state).
   * Does NOT mix with job parsing failures.
   */
  public async verifyPending(options: { limit?: number; dryRun?: boolean } = {}): Promise<VerificationMetrics> {
    const limit = options.limit || 100;
    const metrics: VerificationMetrics = {
      totalProcessed: 0,
      verified: 0,
      probable: 0,
      mismatch: 0,
      inaccessible: 0,
      unresolved: 0,
      stale: 0,
      retried: 0,
      errors: 0,
    };

    // MC-1: Recover stale claims before claiming new work
    try {
      await this.store.recoverStaleClaims(this.claimDurationMinutes);
    } catch (err: any) {
      logger.warn('Failed to recover stale claims during verification pass', { error: err.message });
    }

    // MC-1: Atomic candidate claiming via FOR UPDATE SKIP LOCKED
    let records: DiscoveryRecord[];
    try {
      records = await this.store.claimCandidates('DISCOVERED', this.workerId, limit, this.claimDurationMinutes);
    } catch (error: any) {
      logger.error('Failed to atomically claim DISCOVERED records', { error: error.message });
      throw new Error(`Store Error: ${error.message}`);
    }

    if (!records || records.length === 0) {
      return metrics;
    }

    // Mark claimed records as VERIFYING
    const claimedIds = records.map((r: any) => r.id);
    await this.store.bulkUpdateStatus(claimedIds, { discovery_status: 'VERIFYING' });

    for (const record of records) {
      try {
        await this.verifyRecord(record, metrics);
      } finally {
        // Release claim upon completion
        try {
          await this.store.releaseClaim(record.id, this.workerId);
        } catch (releaseErr: any) {
          logger.warn(`Failed to release claim for record ${record.id}`, { error: releaseErr.message });
        }
      }
    }

    return metrics;
  }

  private async verifyRecord(record: DiscoveryRecord, metrics: VerificationMetrics) {
    metrics.totalProcessed++;
    const currentAttempts = (record.verification_attempts ?? 0) + 1;
    let verificationStatus = 'unresolved';
    let discoveryStatus = 'FAILED';
    let detectionUrl: string | null = record.detection_url || null;
    let confidence = 0;
    let adapterSlug: string | null = null;
    let adapterStatus: string | null = null;
    let boardIdentifier: string | null = null;
    let discoveryError: string | null = null;
    let verificationError: string | null = null;

    // Safety guard: Check if circuit breaker is open for this domain
    if (this.circuitBreaker.isOpen(record.domain)) {
      const decision = this.retryClassifier.classify(
        new Error(`Circuit breaker open for domain ${record.domain}`),
        'verification',
        currentAttempts
      );
      if (decision.shouldRetry) {
        metrics.retried++;
        await this.store.updateRecord(record.id, {
          discovery_status: 'DISCOVERED',
          verification_attempts: currentAttempts,
          verification_error: decision.reason,
          discovery_error: decision.reason,
          last_failure_at: new Date().toISOString(),
        });
        return;
      }
    }

    try {
      const testUrls = buildVerificationUrls({
        domain: record.domain,
        detection_url: record.detection_url,
        careers_url: record.careers_url,
        job_evidence: record.job_evidence,
      });

      let html = '';
      let finalUrl = '';
      let fetchSuccess = false;
      let detection: ReturnType<typeof ATSDetector.detect> | null = null;
      let anyFetchSucceeded = false;

      // Rate-limited domain probe — traverse ALL evidence URLs until ATSDetector
      // produces a valid detection. Do NOT stop at the first HTTP-200 response.
      await this.rateLimiter.acquire(record.domain);
      try {
        for (const url of testUrls) {
          try {
            const res = await httpClient.get<string>(url, {
              timeoutMs: 10000,
              followRedirects: true,
              maxRedirectHops: 3,
              throwOn404: true,
            });
            const pageHtml = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            anyFetchSucceeded = true;
            this.circuitBreaker.recordSuccess(record.domain);

            // Attempt ATS detection on this page
            const pageDetection = ATSDetector.detect(res.url, pageHtml);
            if (pageDetection.detected && pageDetection.atsType) {
              // Valid detection found — use this URL's results
              html = pageHtml;
              finalUrl = res.url;
              fetchSuccess = true;
              detection = pageDetection;
              break;
            }
            // HTTP-200 but no ATS signature: continue to the next evidence URL
          } catch (e) {
            // Network/HTTP error on this URL — try next candidate URL
          }
        }
      } finally {
        this.rateLimiter.release(record.domain);
      }

      if (!anyFetchSucceeded) {
        // No URL was reachable at all
        this.circuitBreaker.recordFailure(record.domain);
        verificationStatus = 'inaccessible';
        discoveryError = 'All candidate URLs inaccessible';
        metrics.inaccessible++;

        // Classify inaccessible error
        const decision = this.retryClassifier.classify(
          new Error(discoveryError),
          'verification',
          currentAttempts
        );

        if (decision.shouldRetry) {
          metrics.retried++;
          await this.store.updateRecord(record.id, {
            discovery_status: 'DISCOVERED',
            verification_status: verificationStatus,
            verification_attempts: currentAttempts,
            verification_error: decision.reason,
            discovery_error: decision.reason,
            last_failure_at: new Date().toISOString(),
          });
          return;
        }

        discoveryStatus = 'FAILED';
        verificationError = decision.reason;
      } else if (!fetchSuccess || !detection) {
        // At least one page responded HTTP-200 but none had a valid ATS detection
        verificationStatus = 'unresolved';
        discoveryStatus = 'FAILED';
        discoveryError = 'No ATS signature detected across all reachable evidence URLs';
        verificationError = discoveryError;
        metrics.unresolved++;
      } else {
        // Valid ATS detection found
        detectionUrl = detection.sourceUrl;
        confidence = detection.confidence;
        boardIdentifier = detection.boardIdentifier;

        if (detection.atsType !== record.ats_provider) {
          verificationStatus = 'mismatch';
          discoveryStatus = 'FAILED';
          discoveryError = `Expected ${record.ats_provider}, detected ${detection.atsType}`;
          verificationError = discoveryError;
          metrics.mismatch++;
        } else {
          // ATS matches — check adapter availability
          const hasAdapter = ATSAdapterRegistry.hasAdapter(detection.atsType);

          if (hasAdapter) {
            const adapter = ATSAdapterRegistry.getAdapter(detection.atsType);
            adapterSlug = adapter.platformSlug;

            try {
              const validation = await adapter.validateSource({
                sourceUrl: detection.sourceUrl,
                sourceIdentifier: detection.boardIdentifier!,
                adapterConfig: {},
              } as any);

              if (validation.isValid) {
                verificationStatus = 'verified';
                discoveryStatus = 'VERIFIED';
                adapterStatus = 'ready';
                metrics.verified++;
              } else {
                verificationStatus = 'stale';
                discoveryStatus = 'FAILED';
                adapterStatus = 'invalid';
                discoveryError = 'Adapter validation failed: source not valid';
                verificationError = discoveryError;
                metrics.stale++;
              }
            } catch (e: any) {
              verificationStatus = 'probable';
              discoveryStatus = 'VERIFIED';
              adapterStatus = 'error';
              discoveryError = `Adapter validation threw: ${e instanceof Error ? e.message : String(e)}`;
              verificationError = discoveryError;
              metrics.probable++;
            }
          } else {
            // ATS confirmed but no adapter yet — still verified
            verificationStatus = 'verified';
            discoveryStatus = 'VERIFIED';
            adapterSlug = detection.atsType;
            adapterStatus = 'unavailable';
            metrics.verified++;
          }
        }
      }
    } catch (err: any) {
      metrics.errors++;
      const decision = this.retryClassifier.classify(err, 'verification', currentAttempts);

      if (decision.shouldRetry) {
        metrics.retried++;
        await this.store.updateRecord(record.id, {
          discovery_status: 'DISCOVERED',
          verification_attempts: currentAttempts,
          verification_error: decision.reason,
          discovery_error: decision.reason,
          last_failure_at: new Date().toISOString(),
        });
        return;
      }

      verificationStatus = 'unresolved';
      discoveryStatus = 'FAILED';
      discoveryError = `Verification error: ${err instanceof Error ? err.message : String(err)}`;
      verificationError = decision.reason;
      logger.error(`Error verifying record ${record.id}`, { error: String(err) });
    }

    // Update the record with verification result and metadata
    await this.store.updateRecord(record.id, {
      discovery_status: discoveryStatus,
      verification_status: verificationStatus,
      detection_url: detectionUrl,
      discovery_confidence: confidence > 0 ? confidence : null,
      adapter: adapterSlug,
      adapter_status: adapterStatus,
      board_identifier: boardIdentifier,
      discovery_error: discoveryError,
      verification_error: verificationError,
      verification_attempts: currentAttempts,
      last_verified_at: new Date().toISOString(),
    });
  }
}
