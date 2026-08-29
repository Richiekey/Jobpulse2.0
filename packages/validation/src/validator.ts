import type { NormalizedJob } from '@jobpulse/domain';
import { NormalizedJobSchema } from './schemas/job.schema.js';
import { SSRFGuard } from './ssrf.js';

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface JobValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
}

export class JobValidator {
  private static readonly BLOCKED_CONTENT_PATTERNS = [
    /404 Not Found/i,
    /Access Denied/i,
    /Cloudflare Ray ID/i,
    /Attention Required! \| Cloudflare/i,
    /Please enable cookies/i,
    /Checking your browser before accessing/i,
    /Robot or human\?/i,
  ];

  public static validate(job: NormalizedJob): JobValidationResult {
    const issues: ValidationIssue[] = [];

    // 1. Zod Schema parse
    const parseResult = NormalizedJobSchema.safeParse(job);
    if (!parseResult.success) {
      for (const err of parseResult.error.errors) {
        issues.push({
          field: err.path.join('.'),
          message: err.message,
        });
      }
    }

    // 2. Anti-bot / Error page text detection
    for (const pattern of this.BLOCKED_CONTENT_PATTERNS) {
      if (pattern.test(job.description)) {
        issues.push({
          field: 'description',
          message: `Job description appears to be an error/anti-bot page: matched ${pattern}`,
        });
        break;
      }
    }

    // 3. Plausible posting date (not > 1 year in past, not > 1 day in future)
    const postedTime = new Date(job.postedAt).getTime();
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
    const tomorrow = now + 24 * 60 * 60 * 1000;

    if (postedTime < oneYearAgo) {
      issues.push({
        field: 'postedAt',
        message: 'Posting date is absurdly old (> 1 year)',
      });
    } else if (postedTime > tomorrow) {
      issues.push({
        field: 'postedAt',
        message: 'Posting date is in the future',
      });
    }

    // 4. SSRF & Protocol Safety on URLs
    const urlChecks = [
      { name: 'applyUrl', url: job.urls.applyUrl },
      { name: 'canonicalUrl', url: job.urls.canonicalUrl },
      { name: 'discoveryUrl', url: job.urls.discoveryUrl },
      { name: 'sourceJobUrl', url: job.urls.sourceJobUrl },
    ];

    for (const check of urlChecks) {
      const guard = SSRFGuard.isSafeUrl(check.url);
      if (!guard.safe) {
        issues.push({
          field: `urls.${check.name}`,
          message: `Unsafe URL rejected: ${guard.reason}`,
        });
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }
}
