import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const email = process.env.JOBRIGHT_EMAIL?.trim();
const password = process.env.JOBRIGHT_PASSWORD;

if (!email || !password) {
  console.error('Missing JOBRIGHT_EMAIL or JOBRIGHT_PASSWORD');
  process.exit(1);
}

let cachedSessionId = null;

async function getJobrightSession() {
  if (cachedSessionId) return cachedSessionId;
  console.log('[Auth] Logging into Jobright...');
  const loginRes = await fetch('https://jobright.ai/swan/auth/login/pwd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://jobright.ai', Referer: 'https://jobright.ai/' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = loginRes.headers.get('set-cookie') || '';
  const match = cookie.match(/SESSION_ID=([^;,\s]+)/i);
  if (!match) throw new Error('No SESSION_ID cookie returned');
  cachedSessionId = match[1];
  console.log('[Auth] Session established.');
  return cachedSessionId;
}

const ATS_DOMAINS = [
  { slug: 'greenhouse', domains: ['greenhouse.io', 'boards.greenhouse.io'] },
  { slug: 'lever', domains: ['lever.co', 'jobs.lever.co'] },
  { slug: 'ashby', domains: ['ashbyhq.com', 'jobs.ashbyhq.com'] },
  { slug: 'workday', domains: ['myworkdayjobs.com', 'workday.com'] },
  { slug: 'smartrecruiters', domains: ['smartrecruiters.com', 'jobs.smartrecruiters.com'] },
  { slug: 'icims', domains: ['icims.com', 'jobs.icims.com'] },
  { slug: 'bamboohr', domains: ['bamboohr.com'] },
  { slug: 'breezy', domains: ['breezy.hr'] },
  { slug: 'rippling', domains: ['rippling.com', 'rippling-ats.com'] },
];

function detectAts(urlStr) {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr);
    for (const { slug, domains } of ATS_DOMAINS) {
      if (domains.some(d => parsed.hostname.toLowerCase() === d || parsed.hostname.toLowerCase().endsWith('.' + d))) {
        return slug;
      }
    }
  } catch {}
  return null;
}

async function fetchJobrightDetail(externalJobId) {
  const sessionId = await getJobrightSession();
  const res = await fetch(`https://jobright.ai/jobs/info/${externalJobId}`, {
    headers: { Cookie: `SESSION_ID=${sessionId}`, Referer: 'https://jobright.ai/' },
  });
  const html = await res.text();
  const match = html.match(/<script[^>]*id=["']jobright-helper-job-detail-info["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return parsed.jobResult || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('=== FIXING CORRUPTED COMPANIES ===');
  const companyFixes = [
    { oldName: '[DELTA', newName: 'DELTA |v| Forensic Engineering', website: 'https://www.deltavinc.com' },
    { oldName: '[HSB', newName: 'HSB UK & Ireland', website: 'https://www.munichre.com/hsbeil/' },
    { oldName: '[CTL', newName: 'CTL | Thompson', website: 'http://ctlthompson.com/' },
    { oldName: '[Wiley', newName: 'Wiley|Wilson', website: 'https://wileywilson.com' },
    { oldName: '[Grumman', newName: 'Grumman|Butkus Associates', website: 'https://grummanbutkus.com' },
    { oldName: '[HY Engineering', newName: 'HY Engineering', website: null },
    { oldName: '[RI-MUHC', newName: 'RI-MUHC', website: null },
    { oldName: '[fs3', newName: 'fs3', website: null },
    { oldName: '[ISE Labs', newName: 'ISE Labs', website: null },
    { oldName: '[Veolia', newName: 'Veolia', website: null },
  ];

  for (const fix of companyFixes) {
    const { data: comp } = await supabase.from('companies').select('id').eq('name', fix.oldName).maybeSingle();
    if (comp) {
      await supabase.from('companies').update({
        name: fix.newName,
        website: fix.website,
      }).eq('id', comp.id);
      console.log(`Updated company: ${fix.oldName} -> ${fix.newName}`);
    }
  }

  console.log('\n=== QUERYING NEWEST UNRESOLVED / CORRUPTED JOBRIGHT JOBS ===');
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select(`
      id,
      canonical_title,
      display_title,
      apply_url,
      ats_platform_slug,
      posted_at,
      source_metadata,
      companies ( id, name, website ),
      job_sources ( external_job_id, source_job_url )
    `)
    .or('ats_platform_slug.eq.jobright,display_title.like.%]%,canonical_title.like.%]%,canonical_title.eq.v,canonical_title.eq.Thompson]')
    .order('posted_at', { ascending: false })
    .limit(300);

  if (error) {
    console.error('Error querying jobs:', error);
    process.exit(1);
  }

  console.log(`Found ${jobs.length} jobs to evaluate.`);

  let enrichedCount = 0;
  let titlesFixed = 0;

  for (const job of jobs) {
    const externalJobId =
      job.job_sources?.[0]?.external_job_id ||
      job.apply_url?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/)?.[1] ||
      job.canonical_url?.match(/jobright\.ai\/jobs\/info\/([a-zA-Z0-9_-]+)/)?.[1];

    if (!externalJobId) {
      continue;
    }

    try {
      const jr = await fetchJobrightDetail(externalJobId);
      if (!jr) {
        console.warn(`[Skip] No helper data for ${job.id} (${externalJobId})`);
        continue;
      }

      const rawJobTitle = jr.jobTitle;
      const cleanTitle = (rawJobTitle && typeof rawJobTitle === 'string') ? rawJobTitle.trim() : null;

      const candidates = [
        jr.originalUrl,
        jr.applyLink,
        jr.applyUrl,
        jr.sourceUrl,
      ].filter(u => typeof u === 'string' && u.startsWith('http') && !u.includes('jobright.ai'));

      const directUrl = candidates[0] || null;
      const detectedSlug = directUrl ? (detectAts(directUrl) || 'direct') : job.ats_platform_slug;
      const isDirectAts = Boolean(detectAts(directUrl));

      const currentJobrightRef = job.apply_url?.includes('jobright.ai')
        ? job.apply_url
        : `https://jobright.ai/jobs/info/${externalJobId}`;

      const updatePayload = {
        source_metadata: {
          ...(job.source_metadata || {}),
          jobright_reference_url: currentJobrightRef,
          enrichment_status: 'enriched',
          enriched_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      };

      if (cleanTitle && cleanTitle !== job.display_title) {
        updatePayload.canonical_title = cleanTitle;
        updatePayload.display_title = cleanTitle;
        titlesFixed++;
      }

      if (directUrl && directUrl !== job.apply_url) {
        updatePayload.apply_url = directUrl;
        updatePayload.original_apply_url = directUrl;
        updatePayload.canonical_url = directUrl;
        updatePayload.ats_platform_slug = detectedSlug;
        updatePayload.url_resolution_method = isDirectAts ? 'direct_ats' : 'employer_application';
        updatePayload.url_resolution_confidence = isDirectAts ? 0.95 : 0.85;
        enrichedCount++;
      }

      await supabase.from('jobs').update(updatePayload).eq('id', job.id);

      console.log(`[Enriched] ${cleanTitle || job.display_title} | URL: ${directUrl || 'none'} | ATS: ${detectedSlug}`);
    } catch (err) {
      console.error(`Error processing job ${job.id}:`, err.message);
    }
  }

  console.log(`\n=== COMPLETED ===`);
  console.log(`Direct URLs Enriched: ${enrichedCount}`);
  console.log(`Titles Fixed: ${titlesFixed}`);
}

main().catch(console.error);
