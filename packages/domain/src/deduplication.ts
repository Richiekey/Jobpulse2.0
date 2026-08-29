import crypto from 'node:crypto';

export class DeduplicationEngine {
  /**
   * Generates a SHA-256 hash of a raw JSON payload for change detection.
   */
  public static hashPayload(payload: unknown): string {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Normalizes URLs for Level-2 deduplication by removing tracking parameters (UTM, ref, fbclid, etc.)
   */
  public static cleanUrl(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      // Strip common tracking and session parameters
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'ref', 'source', 'fbclid', 'gclid', 'msclkid', 'gh_jid', 'lever-source'
      ];
      for (const param of trackingParams) {
        parsed.searchParams.delete(param);
      }
      // Remove trailing slash
      const cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
      return `${parsed.protocol}//${parsed.host.toLowerCase()}${cleanPath}${parsed.search}${parsed.hash}`;
    } catch {
      return urlStr.trim().toLowerCase();
    }
  }

  /**
   * Generates a canonical fingerprint for Level-3 matching:
   * company_id + normalized canonical title + normalized location string.
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
}
