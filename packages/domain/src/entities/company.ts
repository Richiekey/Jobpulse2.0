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
  /**
   * Generates a deterministic normalized name for candidate deduplication.
   * Strips legal entity suffixes (Inc, LLC, Corp, Ltd, Technologies, Group) and punctuation.
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
   * Generates a URL-friendly, deterministic slug.
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
   * Extracts clean root domain from a website or careers URL.
   */
  public static extractRootDomain(rawUrl?: string | null): string | null {
    if (!rawUrl) return null;
    try {
      let target = rawUrl.trim();
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = `https://${target}`;
      }
      const parsed = new URL(target);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      return host || null;
    } catch {
      return null;
    }
  }
}
