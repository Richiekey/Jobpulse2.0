import { SupabaseClient } from '@supabase/supabase-js';
import { logger, httpClient, HttpError } from '@jobpulse/shared';
import { ATSDetector, ATSAdapterRegistry } from '@jobpulse/ats';
import { CompanyNormalizer } from '@jobpulse/domain';
import { StateStore, DiscoveryRecord } from './state-store.js';

export interface VerificationMetrics {
  totalProcessed: number;
  verified: number;
  probable: number;
  mismatch: number;
  inaccessible: number;
  unresolved: number;
  stale: number;
  errors: number;
}

export function buildVerificationUrls(record: { domain: string; detection_url?: string | null }): string[] {
  const urls: string[] = [];
  if (record.detection_url) urls.push(record.detection_url);
  urls.push(
    `https://${record.domain}/careers`,
    `https://${record.domain}/jobs`,
    `https://careers.${record.domain}`,
    `https://jobs.${record.domain}`,
    `https://${record.domain}`
  );
  return urls;
}

export class TechnologyCheckerVerifier {
  constructor(private readonly store: StateStore) {}

  /**
   * Phase 4 + Phase 6: Claim DISCOVERED records, transition to VERIFYING,
   * then resolve to VERIFIED (or a terminal verification state).
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
      errors: 0,
    };

    // Claim: fetch DISCOVERED records
    let records: DiscoveryRecord[];
    try {
      records = await this.store.queryByStatus('DISCOVERED', {}, limit);
    } catch (error: any) {
      logger.error('Failed to fetch DISCOVERED records', { error: error.message });
      throw new Error(`Store Error: ${error.message}`);
    }

    if (!records || records.length === 0) {
      return metrics;
    }

    // Transition all claimed records to VERIFYING atomically
    const claimedIds = records.map((r: any) => r.id);
    await this.store.bulkUpdateStatus(claimedIds, { discovery_status: 'VERIFYING' });

    for (const record of records) {
      await this.verifyRecord(record, metrics);
    }

    return metrics;
  }

  private async verifyRecord(record: any, metrics: VerificationMetrics) {
    metrics.totalProcessed++;
    let verificationStatus = 'unresolved';
    let discoveryStatus = 'FAILED';
    let detectionUrl: string | null = record.detection_url || null;
    let confidence = 0;
    let adapterSlug: string | null = null;
    let adapterStatus: string | null = null;
    let boardIdentifier: string | null = null;
    let discoveryError: string | null = null;

    try {
      // Issue 4: Prioritize TechnologyChecker detection URL/domain first
      const testUrls = buildVerificationUrls({
        domain: record.domain,
        detection_url: record.detection_url
      });

      let html = '';
      let finalUrl = '';
      let fetchSuccess = false;

      for (const url of testUrls) {
        try {
          const res = await httpClient.get<string>(url, {
            timeoutMs: 10000,
            followRedirects: true,
            maxRedirectHops: 3,
            throwOn404: true,
          });
          html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
          finalUrl = res.url;
          fetchSuccess = true;
          break;
        } catch (e) {
          // Try next URL
        }
      }

      if (!fetchSuccess) {
        verificationStatus = 'inaccessible';
        discoveryStatus = 'FAILED';
        discoveryError = 'All candidate URLs inaccessible';
        metrics.inaccessible++;
      } else {
        const detection = ATSDetector.detect(finalUrl, html);

        if (detection.detected && detection.atsType) {
          detectionUrl = detection.sourceUrl;
          confidence = detection.confidence;
          boardIdentifier = detection.boardIdentifier;

          if (detection.atsType !== record.ats_provider) {
            verificationStatus = 'mismatch';
            discoveryStatus = 'FAILED';
            discoveryError = `Expected ${record.ats_provider}, detected ${detection.atsType}`;
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
                  metrics.stale++;
                }
              } catch (e) {
                verificationStatus = 'probable';
                discoveryStatus = 'VERIFIED';
                adapterStatus = 'error';
                discoveryError = `Adapter validation threw: ${e instanceof Error ? e.message : String(e)}`;
                metrics.probable++;
              }
            } else {
              // Phase 5: No adapter, but ATS confirmed — still verified, adapter unavailable
              verificationStatus = 'verified';
              discoveryStatus = 'VERIFIED';
              adapterSlug = detection.atsType;
              adapterStatus = 'unavailable';
              metrics.verified++;
            }
          }
        } else {
          verificationStatus = 'unresolved';
          discoveryStatus = 'FAILED';
          discoveryError = 'No ATS signature detected in HTML';
          metrics.unresolved++;
        }
      }
    } catch (err) {
      metrics.errors++;
      verificationStatus = 'unresolved';
      discoveryStatus = 'FAILED';
      discoveryError = `Verification error: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(`Error verifying record ${record.id}`, { error: String(err) });
    }

    // Update the record with verification result AND queue state
    await this.store.updateRecord(record.id, {
      discovery_status: discoveryStatus,
      verification_status: verificationStatus,
      detection_url: detectionUrl,
      discovery_confidence: confidence > 0 ? confidence : null,
      adapter: adapterSlug,
      adapter_status: adapterStatus,
      board_identifier: boardIdentifier,
      discovery_error: discoveryError,
      last_verified_at: new Date().toISOString(),
    });
  }
}
