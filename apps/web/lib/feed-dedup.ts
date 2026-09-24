/**
 * Feed-level deduplication and diversity balancing.
 * Groups jobs by (company + normalized_title), keeps the first occurrence,
 * and interleaves to prevent company monopolization.
 */

export interface FeedJob {
  id: string;
  company_name?: string;
  companies?: { name?: string | null } | { name?: string | null }[] | null | any;
  title?: string;
  canonical_title?: string;
  display_title?: string;
  [key: string]: any;
}

function getCompanyName(job: FeedJob): string {
  if (job.company_name) return job.company_name.toLowerCase().trim();
  const c = Array.isArray(job.companies) ? job.companies[0] : job.companies;
  if (c && typeof c === 'object' && c.name) {
    return String(c.name).toLowerCase().trim();
  }
  return '';
}

/**
 * Deduplicates jobs by company + title combination.
 * When duplicates exist, keeps the first (newest, since feed is sorted by date).
 */
export function deduplicateJobs<T extends FeedJob>(jobs: T[]): T[] {
  const seen = new Map<string, T>();
  
  for (const job of jobs) {
    const company = getCompanyName(job);

    const title = (
      job.canonical_title ||
      job.display_title ||
      job.title ||
      ''
    ).toLowerCase().trim();

    // If company or title is missing, don't blindly dedup (key would collide)
    const key = company && title ? `${company}::${title}` : `job::${job.id}`;
    
    if (!seen.has(key)) {
      seen.set(key, job);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Interleaves jobs to prevent a single company from dominating the feed.
 * Max `maxPerCompany` consecutive jobs from the same company.
 */
export function interleaveByCompany<T extends FeedJob>(
  jobs: T[], 
  maxPerCompany: number = 3
): T[] {
  if (jobs.length <= maxPerCompany) {
    return jobs;
  }

  // Group by company
  const byCompany = new Map<string, T[]>();
  for (const job of jobs) {
    const company = getCompanyName(job) || 'unknown';

    if (!byCompany.has(company)) byCompany.set(company, []);
    byCompany.get(company)!.push(job);
  }
  
  // Round-robin interleave
  const result: T[] = [];
  const queues = Array.from(byCompany.values());
  const indices = new Array(queues.length).fill(0);
  let added = true;
  
  while (added) {
    added = false;
    for (let q = 0; q < queues.length; q++) {
      const queue = queues[q]!;
      const count = Math.min(maxPerCompany, queue.length - indices[q]!);
      for (let i = 0; i < count; i++) {
        if (indices[q]! < queue.length) {
          result.push(queue[indices[q]!]!);
          indices[q]!++;
          added = true;
        }
      }
    }
  }
  
  return result;
}

/**
 * Full feed processing pipeline: dedup then interleave.
 */
export function processFeedJobs<T extends FeedJob>(
  jobs: T[],
  options: { maxPerCompany?: number } = {}
): T[] {
  const deduped = deduplicateJobs(jobs);
  return interleaveByCompany(deduped, options.maxPerCompany ?? 3);
}
