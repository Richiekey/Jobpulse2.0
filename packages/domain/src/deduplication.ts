import crypto from 'node:crypto';

export type DeduplicationLevel =
  | 'level_1_source_identity'
  | 'level_2_canonical_url'
  | 'level_3_canonical_fingerprint';

export interface DeduplicationIdentity {
  sourceId: string;
  externalJobId: string;
  canonicalUrl?: string | null;
  canonicalFingerprint?: string | null;
}

export interface DuplicateConfidenceResult {
  isMatch: boolean;
  matchLevel: DeduplicationLevel | 'none';
  confidence: number;
  reason: string;
}

export class DeduplicationEngine {
  /**
   * Generates a SHA-256 hash of a raw JSON payload for change detection.
   */
  public static hashPayload(payload: unknown): string {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Provider-aware URL cleaning that strips non-essential tracking tokens while preserving
   * routing and identity parameters.
   */
  public static cleanUrl(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();

      // Universal tracking parameters
      const universalTracking = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'ref', 'source', 'fbclid', 'gclid', 'msclkid', '_hsenc', '_hsmi',
        'mc_cid', 'mc_eid', 'yclid', 'trk', 'sc_src'
      ];

      // Provider-specific tracking parameters to remove
      if (host.includes('lever.co')) {
        universalTracking.push('lever-source', 'lever-origin');
      } else if (host.includes('greenhouse.io')) {
        universalTracking.push('gh_src', 'gh_ref');
      } else if (host.includes('ashbyhq.com')) {
        universalTracking.push('ashby_jid');
      }

      for (const param of universalTracking) {
        parsed.searchParams.delete(param);
      }

      // Remove trailing slashes from path
      const cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
      const queryString = parsed.searchParams.toString() ? `?${parsed.searchParams.toString()}` : '';

      return `${parsed.protocol}//${parsed.host.toLowerCase()}${cleanPath}${queryString}${parsed.hash}`;
    } catch {
      return urlStr.trim().toLowerCase();
    }
  }

  /**
   * Generates a canonical fingerprint for conservative Level-3 candidate matching:
   * company_id + normalized canonical title + sorted normalized locations.
   */
  public static generateCanonicalFingerprint(
    companyId: string,
    canonicalTitle: string,
    locations: string[]
  ): string {
    const normTitle = canonicalTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normLoc = locations
      .map((l) => l.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .sort()
      .join('|');
    const combined = `${companyId}:${normTitle}:${normLoc}`;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Evaluates deduplication match confidence between two job representations (M08.4).
   */
  public static evaluateMatch(
    incoming: { sourceId: string; externalJobId: string; canonicalUrl: string; canonicalFingerprint: string },
    existing: { sourceId: string; externalJobId: string; canonicalUrl: string; canonicalFingerprint: string }
  ): DuplicateConfidenceResult {
    // Level 1: Deterministic source identity match (Confidence 1.0)
    if (incoming.sourceId === existing.sourceId && incoming.externalJobId === existing.externalJobId) {
      return {
        isMatch: true,
        matchLevel: 'level_1_source_identity',
        confidence: 1.0,
        reason: 'Exact sourceId and externalJobId identity match',
      };
    }

    // Level 2: Exact canonical clean URL match (Confidence 0.98)
    const cleanIn = this.cleanUrl(incoming.canonicalUrl);
    const cleanExist = this.cleanUrl(existing.canonicalUrl);
    if (cleanIn && cleanExist && cleanIn === cleanExist) {
      return {
        isMatch: true,
        matchLevel: 'level_2_canonical_url',
        confidence: 0.98,
        reason: 'Exact cleaned canonical URL match across sources',
      };
    }

    // Level 3: Canonical fingerprint candidate evaluation (Confidence 0.85)
    if (incoming.canonicalFingerprint && existing.canonicalFingerprint && incoming.canonicalFingerprint === existing.canonicalFingerprint) {
      return {
        isMatch: true,
        matchLevel: 'level_3_canonical_fingerprint',
        confidence: 0.85,
        reason: 'Identical company, normalized title, and normalized location fingerprint',
      };
    }

    return {
      isMatch: false,
      matchLevel: 'none',
      confidence: 0.0,
      reason: 'Distinct job requisitions',
    };
  }
}
