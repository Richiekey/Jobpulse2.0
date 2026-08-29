export type CompanyStatus = 'active' | 'inactive' | 'pending_verification';

export interface Company {
  id: string;
  name: string;
  normalizedName: string;
  slug: string;
  domain?: string | null;
  website?: string | null;
  careersUrl?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  industry?: string | null;
  companySize?: string | null;
  status: CompanyStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class CompanyNormalizer {
  // Known multi-part second-level public suffixes
  private static readonly MULTI_PART_SUFFIXES = new Set([
    'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'net.uk',
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
    'co.za', 'org.za', 'gov.za',
    'com.br', 'org.br', 'gov.br',
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
    'co.in', 'net.in', 'org.in', 'gen.in',
    'com.sg', 'org.sg', 'edu.sg', 'gov.sg',
    'co.nz', 'org.nz', 'net.nz',
    'com.mx', 'org.mx', 'gob.mx',
  ]);

  /**
   * Generates a deterministic normalized name for candidate similarity/search signal.
   * NOTE: This value is a candidate match signal, NEVER definitive company identity.
   */
  public static normalizeName(rawName: string): string {
    return rawName
      .toLowerCase()
      .replace(/[\u{1F600}-\u{1F6FF}|[\u{2600}-\u{26FF}]/gu, '')
      .replace(/\b(inc\.?|llc\.?|corp\.?|corporation|ltd\.?|limited|technologies|tech|group|co\.?|company)\b/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Generates a URL-friendly, deterministic slug from a company name.
   */
  public static generateSlug(rawName: string): string {
    const slug = rawName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'company';
  }

  /**
   * Generates a unique slug by appending numeric suffixes if collision exists.
   */
  public static generateUniqueSlug(rawName: string, existingSlugs: Set<string> | string[]): string {
    const baseSlug = this.generateSlug(rawName);
    const existing = existingSlugs instanceof Set ? existingSlugs : new Set(existingSlugs);

    if (!existing.has(baseSlug)) {
      return baseSlug;
    }

    let counter = 2;
    while (existing.has(`${baseSlug}-${counter}`)) {
      counter++;
    }
    return `${baseSlug}-${counter}`;
  }

  /**
   * Extracts the exact hostname from an arbitrary URL string.
   */
  public static extractHostname(rawUrl?: string | null): string | null {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    try {
      let target = rawUrl.trim();
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = `https://${target}`;
      }
      const parsed = new URL(target);
      return parsed.hostname.toLowerCase() || null;
    } catch {
      return null;
    }
  }

  /**
   * Extracts the true registrable (root) domain from a URL, correctly handling
   * multi-part public suffixes (e.g. .co.uk, .com.au) and subdomains (www, careers, jobs).
   */
  public static extractRegistrableDomain(rawUrl?: string | null): string | null {
    const hostname = this.extractHostname(rawUrl);
    if (!hostname) return null;

    // Split hostname into parts
    const parts = hostname.split('.');
    if (parts.length <= 1) return hostname;

    // Check if the last two parts match a known multi-part public suffix (e.g. co.uk)
    if (parts.length >= 3) {
      const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
      if (this.MULTI_PART_SUFFIXES.has(lastTwo)) {
        // Return <domain>.<suffix.tld> (e.g. company.co.uk)
        return `${parts[parts.length - 3]}.${lastTwo}`;
      }
    }

    // Standard single-part TLD (e.g. company.com from careers.company.com or www.company.com)
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  }

  /**
   * Backward-compatible alias for extractRegistrableDomain.
   */
  public static extractRootDomain(rawUrl?: string | null): string | null {
    return this.extractRegistrableDomain(rawUrl);
  }
}
