// scripts/backfill-jobright-enrichment.mjs
// JobPulse 2.0 - Jobright Existing-Job Enrichment Backfill
// Replaces Jobright aggregator URLs with real employer / ATS application URLs.
// Preserves original Jobright URL in source_metadata.jobright_reference_url.
// Sanitizes malformed titles and records enrichment telemetry.

import { supabase } from '../apps/worker/dist/db.js';

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(name, defaultValue = null) {
  const prefix = `--${name}=`;
  const match = args.find(a => a.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  if (args.includes(`--${name}`)) return true;
  return defaultValue;
}

const LIMIT = getArg('limit') ? parseInt(getArg('limit'), 10) : null;
const TARGET_ENRICHMENTS = getArg('target-enrichments') ? parseInt(getArg('target-enrichments'), 10) : null;
const DRY_RUN = Boolean(getArg('dry-run', false));
const CONCURRENCY = parseInt(getArg('concurrency', '5'), 10);
const BATCH_SIZE = parseInt(getArg('batch-size', '100'), 10);

const JOBRIGHT_SOURCE_ID = '10000000-0000-0000-0000-000000000005';

// Known ATS mapping
const ATS_PATTERNS = [
  { slug: 'greenhouse', domains: ['boards.greenhouse.io', 'job-boards.greenhouse.io', 'greenhouse.io'] },
  { slug: 'lever', domains: ['jobs.lever.co', 'api.lever.co', 'lever.co'] },
  { slug: 'ashby', domains: ['jobs.ashbyhq.com', 'ashbyhq.com'] },
  { slug: 'workday', domains: ['myworkdayjobs.com'] },
  { slug: 'icims', domains: ['icims.com', 'jobs.icims.com', 'careers.icims.com'] },
  { slug: 'smartrecruiters', domains: ['smartrecruiters.com', 'jobs.smartrecruiters.com'] },
  { slug: 'oracle', domains: ['oraclecloud.com', 'taleo.net'] },
  { slug: 'successfactors', domains: ['successfactors.com', 'successfactors.eu'] },
  { slug: 'jobvite', domains: ['jobvite.com', 'jobs.jobvite.com'] },
  { slug: 'bamboohr', domains: ['bamboohr.com'] },
  { slug: 'workable', domains: ['apply.workable.com', 'workable.com'] },
  { slug: 'recruitee', domains: ['recruitee.com'] },
  { slug: 'teamtailor', domains: ['teamtailor.com'] },
  { slug: 'rippling', domains: ['rippling.com', 'rippling-ats.com'] },
  { slug: 'breezy', domains: ['breezy.hr'] },
  { slug: 'pinpoint', domains: ['pinpointhq.com'] },
];

function isDomainMatch(hostname, targetDomain) {
  const host = hostname.toLowerCase();
  const target = targetDomain.toLowerCase();
  return host === target || host.endsWith('.' + target);
}

function detectAts(urlStr) {
  try {
    const parsed = new URL(urlStr);
    for (const { slug, domains } of ATS_PATTERNS) {
      if (domains.some(d => isDomainMatch(parsed.hostname, d))) {
        return slug;
      }
    }
  } catch {}
  return null;
}

function cleanApplicationUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    // Remove UTM and Jobright tracking params
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'source', 'ref', 'source_id', 'jr_ref'
    ];
    for (const p of trackingParams) {
      if (parsed.searchParams.has(p) && (parsed.searchParams.get(p) === 'jobright' || p.startsWith('utm_'))) {
        parsed.searchParams.delete(p);
      }
    }
    return parsed.toString();
  } catch {
    return urlStr;
  }
}

function sanitizeTitle(rawTitle, jobResultTitle) {
  if (!rawTitle && !jobResultTitle) return { title: 'Untitled Position', corrected: false };
  
  // If jobResultTitle is clean and human-readable, prioritize it
  if (jobResultTitle && typeof jobResultTitle === 'string') {
    const trimmed = jobResultTitle.trim();
    if (trimmed.length > 2 && !trimmed.includes('](') && !trimmed.startsWith('http') && !trimmed.endsWith(']')) {
      return { title: trimmed, corrected: trimmed !== rawTitle };
    }
  }

  let title = (rawTitle || '').trim();
  const original = title;

  // Pattern: [Company/Title](http://...)
  const mdLinkMatch = title.match(/^\[?(.*?)\]\((?:https?:\/\/[^\)]+)\)$/);
  if (mdLinkMatch && mdLinkMatch[1]) {
    title = mdLinkMatch[1].trim();
  }

  // Pattern: Title](http://...)
  const brokenMdMatch = title.match(/^(.*?)\]\((?:https?:\/\/[^\)]+)\)/);
  if (brokenMdMatch && brokenMdMatch[1]) {
    title = brokenMdMatch[1].trim();
  }

  // Pattern: Tag] Clean Title
  const bracketPrefixMatch = title.match(/^\[?[^\]]+\]\s*(.+)$/);
  if (bracketPrefixMatch && bracketPrefixMatch[1]) {
    title = bracketPrefixMatch[1].trim();
  }

  // Trailing bracket: Title]
  if (title.endsWith(']')) {
    title = title.slice(0, -1).trim();
  }

  // If title was completely stripped or is empty
  if (!title || title.length < 2) {
    title = jobResultTitle ? jobResultTitle.trim() : original;
  }

  return { title, corrected: title !== original };
}

// Jobright Session Manager
class JobrightSession {
  constructor() {
    this.email = process.env.JOBRIGHT_EMAIL?.trim();
    this.password = process.env.JOBRIGHT_PASSWORD;
    this.sessionId = null;
    this.lastLogin = 0;
  }

  async getSessionId(forceRefresh = false) {
    const now = Date.now();
    // Cache session for up to 30 minutes
    if (this.sessionId && !forceRefresh && now - this.lastLogin < 30 * 60 * 1000) {
      return this.sessionId;
    }

    if (!this.email || !this.password) {
      throw new Error('JOBRIGHT_EMAIL and JOBRIGHT_PASSWORD environment variables are required.');
    }

    console.log('[Auth] Authenticating with Jobright...');
    const loginRes = await fetch('https://jobright.ai/swan/auth/login/pwd', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://jobright.ai',
        'Referer': 'https://jobright.ai/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });

    if (loginRes.status !== 200) {
      throw new Error(`Jobright authentication failed with HTTP ${loginRes.status}`);
    }

    const setCookie = loginRes.headers.get('set-cookie') || '';
    const sessionMatch = setCookie.match(/SESSION_ID=([^;,\s]+)/i);
    if (!sessionMatch) {
      throw new Error('No SESSION_ID cookie returned in Jobright login response.');
    }

    this.sessionId = sessionMatch[1];
    this.lastLogin = now;
    console.log('[Auth] Session ID established successfully.');
    return this.sessionId;
  }
}

const sessionManager = new JobrightSession();

// Fetch job detail with retries
async function fetchJobrightDetail(externalJobId, retries = 2) {
  let sessionId = await sessionManager.getSessionId();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = `https://jobright.ai/jobs/info/${externalJobId}`;
      const res = await fetch(url, {
        headers: {
          'Cookie': `SESSION_ID=${sessionId}`,
          'Referer': 'https://jobright.ai/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        },
      });

      if (res.status === 401 || res.status === 403) {
        // Session expired, refresh and retry
        console.warn(`[Jobright] HTTP ${res.status} for ${externalJobId}. Refreshing session...`);
        sessionId = await sessionManager.getSessionId(true);
        continue;
      }

      if (res.status === 429) {
        const waitTime = (attempt + 1) * 2000;
        console.warn(`[Jobright] Rate limited (429) for ${externalJobId}. Waiting ${waitTime}ms...`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      if (res.status !== 200) {
        return { success: false, status: res.status, error: `HTTP ${res.status}` };
      }

      const html = await res.text();
      let jr = null;

      // Method 1: Check jobright-helper-job-detail-info
      const helperMatch = html.match(/<script[^>]*id=["']jobright-helper-job-detail-info["'][^>]*>([\s\S]*?)<\/script>/i);
      if (helperMatch) {
        try {
          const parsed = JSON.parse(helperMatch[1]);
          jr = parsed?.jobResult;
        } catch {}
      }

      // Method 2: Check __NEXT_DATA__
      if (!jr) {
        const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
        if (nextDataMatch) {
          try {
            const parsed = JSON.parse(nextDataMatch[1]);
            const pageProps = parsed?.props?.pageProps;
            jr = pageProps?.dataSource?.jobResult || pageProps?.jobResult;
          } catch {}
        }
      }

      if (!jr) {
        if (attempt < retries) {
          // Throttled shell returned; wait and retry
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return { success: false, status: 200, error: 'No jobResult found in helper or NEXT_DATA' };
      }

      return { success: true, jobResult: jr };
    } catch (err) {
      if (attempt === retries) {
        return { success: false, error: err.message };
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

// Simple concurrency runner
async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = new Set();
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= poolLimit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(ret);
}

async function main() {
  console.log('====================================================');
  console.log(' JobPulse 2.0 - Jobright Existing-Job Enrichment');
  console.log('====================================================');
  console.log(`Configuration: Limit=${LIMIT || 'ALL'}, Concurrency=${CONCURRENCY}, BatchSize=${BATCH_SIZE}, DryRun=${DRY_RUN}\n`);

  // Ensure auth works first
  await sessionManager.getSessionId();

  // Query stats
  const stats = {
    totalFound: 0,
    alreadyDirect: 0,
    successfullyEnriched: 0,
    directAtsCount: 0,
    employerAppCount: 0,
    unresolvedCount: 0,
    failedCount: 0,
    malformedTitlesFixed: 0,
    sampleRecords: [],
  };

  let processedCount = 0;
  let lastJobSourceId = '00000000-0000-0000-0000-000000000000';
  let hasMore = true;
  const startTime = Date.now();

  while (hasMore) {
    const fetchLimit = LIMIT ? Math.min(LIMIT - processedCount, BATCH_SIZE) : BATCH_SIZE;
    if (fetchLimit <= 0) break;

    // Keyset pagination using js.id
    let query = supabase
      .from('job_sources')
      .select(`
        id,
        job_id,
        external_job_id,
        source_job_url,
        jobs:job_id (
          id,
          canonical_title,
          display_title,
          apply_url,
          original_apply_url,
          canonical_url,
          ats_platform_slug,
          url_resolution_method,
          url_resolution_confidence,
          source_metadata
        )
      `)
      .eq('source_id', JOBRIGHT_SOURCE_ID)
      .gt('id', lastJobSourceId)
      .order('id', { ascending: true })
      .limit(fetchLimit);

    const { data: batch, error: fetchErr } = await query;
    if (fetchErr) {
      console.error('Error fetching job batch:', fetchErr);
      break;
    }

    if (!batch || batch.length === 0) {
      hasMore = false;
      break;
    }

    lastJobSourceId = batch[batch.length - 1].id;

    // Process each item in batch with concurrency limit
    let batchProcessed = 0;
    const results = await asyncPool(CONCURRENCY, batch, async (js) => {
      const job = js.jobs;
      if (!job) return null;

      stats.totalFound++;

      // Check if already enriched with direct link
      const isCurrentlyJobrightUrl = !job.apply_url || job.apply_url.includes('jobright.ai');
      const isAlreadyEnriched = job.source_metadata?.enrichment_status === 'enriched';

      if (!isCurrentlyJobrightUrl && isAlreadyEnriched) {
        stats.alreadyDirect++;
        return null;
      }

      const externalJobId = js.external_job_id;
      if (!externalJobId) {
        stats.unresolvedCount++;
        return {
          jobId: job.id,
          status: 'unresolved',
          reason: 'missing_external_job_id',
        };
      }

      // Fetch detail page
      const detail = await fetchJobrightDetail(externalJobId);

      if (!detail.success) {
        stats.failedCount++;
        if (!stats.failureReasons) stats.failureReasons = {};
        stats.failureReasons[detail.error] = (stats.failureReasons[detail.error] || 0) + 1;
        if ((stats.failedSampleIds || (stats.failedSampleIds = [])).length < 3) {
          stats.failedSampleIds.push({ id: externalJobId, error: detail.error });
          console.warn(`[Failed Detail] externalJobId=${externalJobId}, error=${detail.error}`);
        }
        return {
          jobId: job.id,
          status: 'failed',
          reason: detail.error,
        };
      }

      const jr = detail.jobResult;

      // Extract candidate URLs
      const candidates = [
        jr.originalUrl,
        jr.applyLink,
        jr.applyUrl,
        jr.sourceUrl,
      ].filter(u => typeof u === 'string' && u.startsWith('http') && !u.includes('jobright.ai'));

      const directUrl = candidates[0] || null;

      // Sanitize title
      const { title: cleanTitle, corrected: titleCorrected } = sanitizeTitle(job.display_title, jr.jobTitle);
      if (titleCorrected) {
        stats.malformedTitlesFixed++;
      }

      // Preserve Jobright reference URL
      const currentJobrightRef = job.apply_url?.includes('jobright.ai') 
        ? job.apply_url 
        : (job.source_metadata?.jobright_reference_url || `https://jobright.ai/jobs/info/${externalJobId}`);

      if (!directUrl) {
        // No direct URL found
        stats.unresolvedCount++;
        const updatePayload = {
          display_title: cleanTitle,
          canonical_title: cleanTitle,
          source_metadata: {
            ...(job.source_metadata || {}),
            jobright_reference_url: currentJobrightRef,
            enrichment_status: 'unresolved',
            enrichment_failure_reason: 'no_external_url_in_jobResult',
            enriched_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        };

        if (!DRY_RUN) {
          await supabase.from('jobs').update(updatePayload).eq('id', job.id);
        }

        return {
          jobId: job.id,
          status: 'unresolved',
          reason: 'no_external_url_in_jobResult',
        };
      }

      // Resolved direct URL!
      const detectedAtsSlug = detectAts(directUrl);
      const isDirectAts = Boolean(detectedAtsSlug);
      const cleanUrl = cleanApplicationUrl(directUrl);

      const resolutionMethod = isDirectAts ? 'direct_ats' : 'employer_application';
      const resolutionConfidence = isDirectAts ? 0.95 : 0.85;
      const finalAtsSlug = detectedAtsSlug || 'direct';

      stats.successfullyEnriched++;
      if (isDirectAts) {
        stats.directAtsCount++;
      } else {
        stats.employerAppCount++;
      }

      const updatePayload = {
        apply_url: cleanUrl,
        original_apply_url: directUrl,
        canonical_url: cleanUrl,
        ats_platform_slug: finalAtsSlug,
        url_resolution_method: resolutionMethod,
        url_resolution_confidence: resolutionConfidence,
        display_title: cleanTitle,
        canonical_title: cleanTitle,
        source_metadata: {
          ...(job.source_metadata || {}),
          jobright_reference_url: currentJobrightRef,
          enrichment_status: 'enriched',
          enriched_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      };

      if (!DRY_RUN) {
        const { error: updateErr } = await supabase
          .from('jobs')
          .update(updatePayload)
          .eq('id', job.id);

        if (updateErr) {
          console.error(`[DB Update Error] job ${job.id}:`, updateErr.message);
          stats.failedCount++;
          return null;
        }
      }

      // Collect sample records for final report (up to 10)
      if (stats.sampleRecords.length < 10) {
        stats.sampleRecords.push({
          id: job.id,
          title: cleanTitle,
          titleWasMalformed: titleCorrected,
          beforeTitle: job.display_title,
          beforeApplyUrl: job.apply_url,
          afterApplyUrl: cleanUrl,
          atsSlug: finalAtsSlug,
          resolutionMethod,
        });
      }

      batchProcessed++;
      if (batchProcessed % 5 === 0 || batchProcessed === batch.length) {
        const currentRate = ((processedCount + batchProcessed) / ((Date.now() - startTime) / 1000)).toFixed(1);
        console.log(`  [Batch Progress] ${batchProcessed}/${batch.length} done | Enriched: ${stats.successfullyEnriched} (ATS: ${stats.directAtsCount}, Direct: ${stats.employerAppCount}) | Speed: ${currentRate} j/s`);
      }

      return {
        jobId: job.id,
        status: 'enriched',
        atsSlug: finalAtsSlug,
        directUrl: cleanUrl,
      };
    });

    processedCount += batch.length;
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (processedCount / (Date.now() - startTime) * 1000).toFixed(1);

    console.log(
      `[Progress] Processed ${processedCount} | Enriched: ${stats.successfullyEnriched} ` +
      `(ATS: ${stats.directAtsCount}, Direct: ${stats.employerAppCount}) | ` +
      `Unresolved: ${stats.unresolvedCount} | Titles Fixed: ${stats.malformedTitlesFixed} | ` +
      `Rate: ${rate} jobs/s | Elapsed: ${elapsedSec}s`
    );

    if (LIMIT && processedCount >= LIMIT) {
      console.log(`[Limit] Reached limit of ${LIMIT} jobs.`);
      break;
    }

    if (TARGET_ENRICHMENTS && stats.successfullyEnriched >= TARGET_ENRICHMENTS) {
      console.log(`[Limit] Reached target enrichments limit of ${TARGET_ENRICHMENTS}.`);
      break;
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n====================================================');
  console.log(' ENRICHMENT BACKFILL COMPLETE');
  console.log('====================================================');
  console.log(`Total Jobright Records Evaluated: ${stats.totalFound}`);
  console.log(`Successfully Enriched with Direct URL: ${stats.successfullyEnriched}`);
  console.log(`  - Direct ATS (Greenhouse, Lever, Ashby, etc.): ${stats.directAtsCount}`);
  console.log(`  - Direct Employer Careers Portal: ${stats.employerAppCount}`);
  console.log(`Already Had Direct URL: ${stats.alreadyDirect}`);
  console.log(`Unresolved / No External Link: ${stats.unresolvedCount}`);
  console.log(`Failed (HTTP / parse error): ${stats.failedCount}`);
  if (stats.failureReasons) {
    console.log('  Failure reasons breakdown:', JSON.stringify(stats.failureReasons, null, 2));
  }
  console.log(`Malformed Titles Corrected: ${stats.malformedTitlesFixed}`);
  console.log(`Total Runtime: ${totalTime}s`);
  console.log('====================================================\n');

  if (stats.sampleRecords.length > 0) {
    console.log('Sample Enriched Records:');
    console.log('----------------------------------------------------');
    for (const r of stats.sampleRecords) {
      console.log(`Job ID: ${r.id}`);
      console.log(`  Title: "${r.title}" ${r.titleWasMalformed ? `(corrected from "${r.beforeTitle}")` : ''}`);
      console.log(`  Before Apply URL: ${r.beforeApplyUrl}`);
      console.log(`  After Apply URL:  ${r.afterApplyUrl}`);
      console.log(`  ATS Slug: ${r.atsSlug} | Method: ${r.resolutionMethod}`);
      console.log('----------------------------------------------------');
    }
  }
}

main().catch(err => {
  console.error('Fatal error in backfill execution:', err);
  process.exit(1);
});
