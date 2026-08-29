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

  public static normalizeEmploymentType(rawType?: string | null): EmploymentType {
    if (!rawType) return 'full_time';
    const lower = rawType.toLowerCase();

    if (lower.includes('full') || lower.includes('permanent') || lower.includes('regular')) {
      return 'full_time';
    }
    if (lower.includes('part')) {
      return 'part_time';
    }
    if (lower.includes('contract') || lower.includes('consultant') || lower.includes('freelance')) {
      return 'contract';
    }
    if (lower.includes('intern') || lower.includes('co-op')) {
      return 'internship';
    }
    if (lower.includes('temp')) {
      return 'temporary';
    }
    return 'other';
  }

  public static normalizeLocations(rawLocations: string[]): string[] {
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const loc of rawLocations) {
      const clean = loc.trim().replace(/\s+/g, ' ');
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

    // Matches patterns like "$120,000 - $160,000", "$120k - $160k", "$80/hr", "£60,000 - £80,000", "$200000 - $260000"
    const rangeRegex = /([$€£¥])\s*([\d,.]+)\s*(k|m)?\s*(?:-|to|–)\s*(?:[$€£¥])?\s*([\d,.]+)\s*(k|m)?/i;
    const match = targetText.match(rangeRegex);

    if (match && match[1] && match[2] && match[4]) {
      const currencySymbol = match[1];
      const currencyMap: Record<string, string> = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };
      const currency = currencyMap[currencySymbol] || 'USD';

      let min = parseFloat(match[2].replace(/,/g, ''));
      let max = parseFloat(match[4].replace(/,/g, ''));

      const minSuffix = match[3]?.toLowerCase();
      const maxSuffix = match[5]?.toLowerCase();
      const hasOverallK = match[0].toLowerCase().includes('k');

      if (minSuffix === 'k' || (hasOverallK && min < 1000)) min *= 1000;
      if (maxSuffix === 'k' || (hasOverallK && max < 1000)) max *= 1000;
      if (minSuffix === 'm' || maxSuffix === 'm') {
        if (min < 100) min *= 1000000;
        if (max < 100) max *= 1000000;
      }

      let interval: 'yearly' | 'monthly' | 'hourly' | 'daily' = 'yearly';
      const lower = targetText.toLowerCase();
      if (lower.includes('/hr') || lower.includes('/hour') || lower.includes('/ hour') || lower.includes('per hour') || lower.includes('hourly')) {
        interval = 'hourly';
      } else if (lower.includes('/mo') || lower.includes('/month') || lower.includes('per month') || lower.includes('monthly')) {
        interval = 'monthly';
      }

      // Invariant: min must be <= max
      if (min > max) {
        const temp = min;
        min = max;
        max = temp;
      }

      return { min, max, currency, interval };
    }

    return null;
  }

  public static extractSkills(text: string): string[] {
    const matchedSkills = new Set<string>();
    const lowerText = ` ${text.toLowerCase()} `;

    for (const skill of KNOWN_SKILLS) {
      const lowerSkill = skill.toLowerCase();
      const escaped = lowerSkill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`[\\s,.:;()/\\[\\]-]${escaped}[\\s,.:;()/\\[\\]-]`, 'i');

      if (regex.test(lowerText) || lowerText.includes(` ${lowerSkill} `)) {
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
