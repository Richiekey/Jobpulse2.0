import type {
  EmploymentType,
  WorkplaceType,
  SalaryRange,
  RawJob,
  NormalizedJob,
  ResolvedURLs,
} from './entities/job.js';

const KNOWN_SKILLS = [
  'TypeScript', 'JavaScript', 'React', 'Next.js', 'Vue', 'Angular', 'Node.js',
  'Python', 'Django', 'FastAPI', 'Flask', 'Go', 'Golang', 'Rust', 'Java',
  'Spring', 'Kotlin', 'Swift', 'C++', 'C#', '.NET', 'Ruby', 'Rails', 'PHP',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'GraphQL', 'REST',
  'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD',
  'TailwindCSS', 'CSS', 'HTML', 'SQL', 'BigQuery', 'Snowflake', 'Kafka',
  'Solidity', 'Web3', 'AI', 'LLM', 'Machine Learning', 'PyTorch', 'TensorFlow'
];

export class Normalizer {
  public static normalizeTitle(rawTitle: string): { canonicalTitle: string; displayTitle: string } {
    const cleanDisplay = rawTitle
      .replace(/[\u{1F600}-\u{1F6FF}|[\u{2600}-\u{26FF}]/gu, '') // Strip emojis
      .replace(/\s+/g, ' ')
      .trim();

    // Canonical title strips common tagging like "(Remote)", "- New York", "[Req #1234]"
    let canonical = cleanDisplay
      .replace(/\[.*?\]|\(.*?\)/g, '')
      .replace(/\s*#\w+/g, '')
      .trim()
      .replace(/\s*-\s*(Remote|Hybrid|On-site|Full-time|Contract|US|UK|EMEA|APAC)$/i, '')
      .trim()
      .replace(/\s+/g, ' ');

    return {
      canonicalTitle: canonical.length > 0 ? canonical : cleanDisplay,
      displayTitle: cleanDisplay,
    };
  }

  public static normalizeWorkplaceType(
    rawWorkplace?: string | null,
    title?: string,
    locations?: string[],
    description?: string
  ): WorkplaceType {
    const combined = `${rawWorkplace ?? ''} ${title ?? ''} ${(locations ?? []).join(' ')} ${description ? description.slice(0, 500) : ''}`.toLowerCase();

    if (combined.includes('remote') || combined.includes('work from home') || combined.includes('anywhere')) {
      return 'remote';
    }
    if (combined.includes('hybrid')) {
      return 'hybrid';
    }
    if (combined.includes('on-site') || combined.includes('onsite') || combined.includes('in-office')) {
      return 'on_site';
    }
    return 'unspecified';
  }

  public static normalizeEmploymentType(rawEmployment?: string | null): EmploymentType {
    if (!rawEmployment) return 'full_time';
    const val = rawEmployment.toLowerCase();

    if (val.includes('part') || val.includes('pt')) return 'part_time';
    if (val.includes('contract') || val.includes('freelance') || val.includes('temp')) return 'contract';
    if (val.includes('intern') || val.includes('co-op')) return 'internship';
    if (val.includes('temporary')) return 'temporary';
    return 'full_time';
  }

  public static normalizeLocations(rawLocations: string[]): string[] {
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const loc of rawLocations) {
      const clean = loc.replace(/\s+/g, ' ').trim();
      if (clean.length > 0 && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        normalized.push(clean);
      }
    }

    return normalized.length > 0 ? normalized : ['Unspecified'];
  }

  public static parseSalary(rawSalary?: string | null, description?: string): SalaryRange | null {
    const targetText = rawSalary || description?.slice(0, 1500) || '';
    if (!targetText) return null;

    // Matches patterns like "$120,000 - $160,000", "$120k - $160k", "$80/hr", "£60,000 - £80,000"
    const rangeRegex = /([$€£¥])\s*(\d{1,3}(?:,\d{3})*|\d+)(?:k)?\s*(?:-|to|–)\s*(?:[$€£¥])?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:k)?/i;
    const match = targetText.match(rangeRegex);

    if (match && match[1] && match[2] && match[3]) {
      const currencySymbol = match[1];
      const currencyMap: Record<string, string> = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };
      const currency = currencyMap[currencySymbol] || 'USD';

      let min = parseFloat(match[2].replace(/,/g, ''));
      let max = parseFloat(match[3].replace(/,/g, ''));

      if (match[0].toLowerCase().includes('k') && min < 1000) min *= 1000;
      if (match[0].toLowerCase().includes('k') && max < 1000) max *= 1000;

      let interval: 'yearly' | 'monthly' | 'hourly' | 'daily' = 'yearly';
      const lower = targetText.toLowerCase();
      if (lower.includes('/hr') || lower.includes('/hour') || lower.includes('/ hour') || lower.includes('per hour') || lower.includes('hourly')) {
        interval = 'hourly';
      } else if (lower.includes('/mo') || lower.includes('/month') || lower.includes('per month') || lower.includes('monthly')) {
        interval = 'monthly';
      }

      return { min, max, currency, interval };
    }

    return null;
  }

  public static extractSkills(text: string): string[] {
    const matchedSkills = new Set<string>();
    const textLower = ` ${text.toLowerCase()} `;

    for (const skill of KNOWN_SKILLS) {
      const pattern = new RegExp(`[\\s,.(]${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s,.)]`, 'i');
      if (pattern.test(textLower)) {
        matchedSkills.add(skill);
      }
    }

    return Array.from(matchedSkills);
  }

  public static normalize(
    raw: RawJob,
    resolvedUrls: ResolvedURLs,
    payloadHash: string
  ): NormalizedJob {
    const { canonicalTitle, displayTitle } = this.normalizeTitle(raw.rawTitle);
    const workplaceType = this.normalizeWorkplaceType(
      raw.rawWorkplaceType,
      raw.rawTitle,
      raw.rawLocations,
      raw.rawDescription
    );
    const employmentType = this.normalizeEmploymentType(raw.rawEmploymentType);
    const locations = this.normalizeLocations(raw.rawLocations);
    const salary = this.parseSalary(raw.rawSalary, raw.rawDescription);
    const skills = this.extractSkills(`${displayTitle} ${raw.rawDescription}`);

    const nowIso = new Date().toISOString();
    const postedAt = raw.rawPostedAt && !isNaN(Date.parse(raw.rawPostedAt))
      ? new Date(raw.rawPostedAt).toISOString()
      : nowIso;

    return {
      sourceId: raw.sourceId,
      externalJobId: raw.externalJobId,
      canonicalTitle,
      displayTitle,
      description: raw.rawDescription.trim(),
      descriptionHtml: raw.rawDescriptionHtml || null,
      employmentType,
      workplaceType,
      locations,
      salary,
      skills,
      postedAt,
      firstSeenAt: nowIso,
      lastSeenAt: nowIso,
      status: 'active',
      urls: resolvedUrls,
      rawPayloadHash: payloadHash,
      sourceMetadata: raw.sourceMetadata || {},
    };
  }
}
