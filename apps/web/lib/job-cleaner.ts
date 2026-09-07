/**
 * Job data sanitization and ATS resolution utilities.
 * Handles defensive cleanup for aggregated feeds and markdown edge cases.
 */

export function sanitizeCompanyName(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return 'Verified Employer';
  
  // Remove markdown bold/italic
  let clean = raw.replace(/\*\*/g, '').replace(/\*/g, '').trim();

  // If full markdown link: [Company Name](http...)
  const linkMatch = clean.match(/\[([^\]]+)\]\([^)]+\)/);
  if (linkMatch && linkMatch[1]) {
    clean = linkMatch[1].trim();
  }

  // If trailing link artifact: Company Name](http...)
  clean = clean.replace(/\]\([^\)]*\)/g, '').trim();

  // If surrounded by square brackets: [Company Name]
  clean = clean.replace(/^\[(.*)\]$/, '$1').trim();

  // Strip dangling unclosed bracket at start: [Company Name -> Company Name
  clean = clean.replace(/^\[+/, '').replace(/\]+$/, '').trim();

  return clean || 'Verified Employer';
}

export function sanitizeJobTitle(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return 'Untitled Role';

  let clean = raw.replace(/\*\*/g, '').replace(/\*/g, '').trim();

  // If full markdown link: [Job Title](http...)
  const linkMatch = clean.match(/\[([^\]]+)\]\([^)]+\)/);
  if (linkMatch && linkMatch[1]) {
    clean = linkMatch[1].trim();
  }

  // If trailing link artifact: Job Title](http...)
  clean = clean.replace(/\]\([^\)]*\)/g, '').trim();

  // If surrounded by square brackets: [Job Title]
  clean = clean.replace(/^\[(.*)\]$/, '$1').trim();

  // Strip dangling unclosed bracket at start or end
  clean = clean.replace(/^\[+/, '').replace(/\]+$/, '').trim();

  return clean || 'Untitled Role';
}

export function sanitizeLocation(loc?: string | null): string {
  if (!loc || typeof loc !== 'string') return 'Unspecified';

  const trimmed = loc.trim();
  // If it's pure URL or markdown link pointing to a URL, don't show as location
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.includes('jobright.ai')
  ) {
    return 'Unspecified';
  }

  // If markdown link with text: [City, ST](http...)
  const linkMatch = trimmed.match(/\[([^\]]+)\]\([^)]+\)/);
  if (linkMatch && linkMatch[1]) {
    const extracted = linkMatch[1].trim();
    if (!extracted.startsWith('http') && !extracted.includes('jobright.ai')) {
      return extracted;
    }
    return 'Unspecified';
  }

  if (trimmed.includes('](') || trimmed.startsWith('**[')) {
    return 'Unspecified';
  }

  const clean = trimmed.replace(/^\[+/, '').replace(/\]+$/, '').trim();
  return clean || 'Unspecified';
}

export function isJobrightOrigin(job: any): boolean {
  if (!job) return false;
  return Boolean(
    job.ats_platform_slug === 'jobright' ||
    job.source === 'jobright' ||
    job.source_metadata?.originalSource === 'jobright_github_markdown' ||
    job.source_metadata?.jobright_reference_url ||
    job.apply_url?.includes('jobright.ai') ||
    job.original_apply_url?.includes('jobright.ai') ||
    job.canonical_url?.includes('jobright.ai')
  );
}

export function getDirectAtsUrl(job: any): string | null {
  if (!job) return null;

  // Direct ATS candidate from source_metadata
  if (job.source_metadata?.direct_ats_url && !job.source_metadata.direct_ats_url.includes('jobright.ai')) {
    return job.source_metadata.direct_ats_url;
  }
  if (job.source_metadata?.ats_url && !job.source_metadata.ats_url.includes('jobright.ai')) {
    return job.source_metadata.ats_url;
  }

  // Check apply_url
  if (job.apply_url && !job.apply_url.includes('jobright.ai')) {
    // If it's not marked as jobright platform, or if enrichment confirmed it
    if (job.ats_platform_slug !== 'jobright' || job.source_metadata?.enrichment_status === 'enriched') {
      return job.apply_url;
    }
  }

  // Check original_apply_url
  if (job.original_apply_url && !job.original_apply_url.includes('jobright.ai')) {
    if (job.ats_platform_slug !== 'jobright' || job.source_metadata?.enrichment_status === 'enriched') {
      return job.original_apply_url;
    }
  }

  // Check canonical_url
  if (job.canonical_url && !job.canonical_url.includes('jobright.ai')) {
    if (job.ats_platform_slug !== 'jobright' || job.source_metadata?.enrichment_status === 'enriched') {
      return job.canonical_url;
    }
  }

  return null;
}

export function getJobrightReferenceUrl(job: any): string | null {
  if (!job) return null;

  if (job.source_metadata?.jobright_reference_url) {
    return job.source_metadata.jobright_reference_url;
  }
  if (job.apply_url?.includes('jobright.ai')) {
    return job.apply_url;
  }
  if (job.original_apply_url?.includes('jobright.ai')) {
    return job.original_apply_url;
  }
  if (job.canonical_url?.includes('jobright.ai')) {
    return job.canonical_url;
  }
  const jobSource = job.job_sources?.find((s: any) => s.source_job_url?.includes('jobright.ai'));
  if (jobSource?.source_job_url) {
    return jobSource.source_job_url;
  }

  return null;
}
