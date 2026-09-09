/**
 * JobPulse 2.0 — Comprehensive Corpus Purge Script
 *
 * Enforces all three product invariants against the production database:
 * 1. Hard 30-day Age Invariant (posted_at >= now() - 30 days)
 * 2. Geography Whitelist (US, Canada, Europe only)
 * 3. Technical Roles Only (no Sales, Marketing, HR, Finance, etc.)
 *
 * Safe guards:
 * - Application-linked and assignment-linked jobs are NEVER physically deleted.
 * - Protected jobs are transitioned to status='expired' so they leave the public feed
 *   but remain accessible in the user's application tracker.
 * - Operates in bounded batches to avoid lock amplification and memory exhaustion.
 *
 * Usage:
 *   node --env-file=.env scripts/run-corpus-purge.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run');
const supabase = createClient(supabaseUrl, serviceKey);

const BATCH_SIZE = 500;
const MAX_BATCHES = 100; // up to 50,000 jobs per category

// ── Excluded region countries (lowercase) ───────────────────────────────────
const EXCLUDED_COUNTRIES = [
  // Africa
  'nigeria', 'kenya', 'south africa', 'ghana', 'egypt', 'morocco', 'uganda',
  'tanzania', 'rwanda', 'ethiopia', 'algeria', 'tunisia', 'zimbabwe', 'senegal',
  'cameroon', 'ivory coast', 'zambia', 'angola',
  // Asia
  'india', 'pakistan', 'china', 'japan', 'south korea', 'philippines', 'singapore',
  'indonesia', 'vietnam', 'thailand', 'malaysia', 'taiwan', 'hong kong', 'bangladesh',
  'sri lanka', 'nepal', 'myanmar', 'cambodia',
  // LATAM
  'brazil', 'mexico', 'argentina', 'colombia', 'chile', 'peru', 'uruguay',
  'venezuela', 'ecuador', 'bolivia', 'paraguay', 'costa rica', 'panama', 'guatemala',
  'dominican republic', 'puerto rico',
  // Middle East
  'united arab emirates', 'uae', 'saudi arabia', 'israel', 'qatar', 'kuwait',
  'bahrain', 'oman', 'jordan', 'lebanon', 'iraq',
  // Oceania
  'australia', 'new zealand', 'fiji', 'papua new guinea',
];

// ── Non-technical job function slugs to exclude ─────────────────────────────
const EXCLUDED_JOB_FUNCTIONS = [
  'sales-marketing',
  'finance-accounting',
  'hr-people',
  'legal',
  'healthcare',
  'education',
  'operations',
  'customer-success',
  'administrative',
  'retail-hospitality',
  'logistics-supply-chain',
  'construction-trades',
  'manufacturing',
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function line(msg) {
  console.log(`  ${msg}`);
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

async function countQuery(filterFn) {
  let query = supabase.from('jobs').select('id', { count: 'exact', head: true });
  query = filterFn(query);
  const { count, error } = await query;
  if (error) {
    console.error('  Count query error:', error.message);
    return -1;
  }
  return count ?? 0;
}

// ── 1. PRE-PURGE TELEMETRY ─────────────────────────────────────────────────

section('1. PRE-PURGE TELEMETRY');

const totalJobs = await countQuery(q => q);
const activeJobs = await countQuery(q => q.eq('status', 'active'));
const expiredJobs = await countQuery(q => q.eq('status', 'expired'));

line(`Total jobs: ${totalJobs}`);
line(`Active jobs: ${activeJobs}`);
line(`Expired jobs: ${expiredJobs}`);

// Jobs older than 30 days
const { count: olderThan30d } = await supabase
  .from('jobs')
  .select('id', { count: 'exact', head: true })
  .lt('posted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
line(`Jobs older than 30 days (by posted_at): ${olderThan30d}`);

// Excluded-region jobs (by location_country)
const { count: excludedGeoCount } = await supabase
  .from('jobs')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'active')
  .in('location_country', EXCLUDED_COUNTRIES);
line(`Active jobs in excluded regions (by location_country): ${excludedGeoCount}`);

// Non-technical jobs (by job_function_slug)
const { count: nonTechCount } = await supabase
  .from('jobs')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'active')
  .in('job_function_slug', EXCLUDED_JOB_FUNCTIONS);
line(`Active non-technical jobs (by job_function_slug): ${nonTechCount}`);

// Application-protected jobs
const { data: appProtected } = await supabase.rpc('get_retention_and_storage_metrics');
const appProtectedCount = appProtected?.jobs?.application_linked_protected_total ?? 'N/A';
line(`Application-linked jobs (total): ${appProtectedCount}`);

// Workplace type distribution
const remoteCount = await countQuery(q => q.eq('status', 'active').eq('workplace_type', 'remote'));
const hybridCount = await countQuery(q => q.eq('status', 'active').eq('workplace_type', 'hybrid'));
const onsiteCount = await countQuery(q => q.eq('status', 'active').eq('workplace_type', 'on_site'));
line(`Remote: ${remoteCount} | Hybrid: ${hybridCount} | On-site: ${onsiteCount}`);

// Storage baseline
line(`Storage (pre-purge):`);
line(`  jobs table: ${appProtected?.storage?.jobs_table_pretty ?? 'N/A'}`);
line(`  raw_job_payloads table: ${appProtected?.storage?.raw_job_payloads_pretty ?? 'N/A'}`);

if (isDryRun) {
  section('DRY RUN — No mutations will be performed.');
  console.log('\n  Re-run without --dry-run to execute the purge.\n');
  process.exit(0);
}

// ── 2. TRANSITION PROTECTED STALE/INELIGIBLE JOBS TO 'EXPIRED' ─────────────

section('2. TRANSITION PROTECTED JOBS TO EXPIRED');

// 2a. Expire stale jobs (>30d) that have applications
const { data: expireStaleResult, error: expireStaleErr } = await supabase.rpc('purge_stale_job_records', {
  p_batch_size: BATCH_SIZE,
  p_max_batches: MAX_BATCHES,
  p_retention_days: 30,
});
if (expireStaleErr) {
  console.error('  purge_stale_job_records error:', expireStaleErr.message);
} else {
  line(`Stale job purge result: ${JSON.stringify(expireStaleResult)}`);
}

// 2b. Expire excluded-geography active jobs that have applications
let geoExpiredCount = 0;
for (const country of EXCLUDED_COUNTRIES) {
  const { data: rows } = await supabase
    .from('jobs')
    .select('id')
    .eq('status', 'active')
    .eq('location_country', country)
    .limit(BATCH_SIZE);
  
  if (rows && rows.length > 0) {
    // Check which have applications
    for (const row of rows) {
      const { count: appCount } = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', row.id);
      
      if (appCount && appCount > 0) {
        // Transition to expired — preserve application link
        await supabase.from('jobs').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', row.id);
        geoExpiredCount++;
      }
    }
  }
}
line(`Excluded-geography jobs transitioned to expired (app-protected): ${geoExpiredCount}`);

// 2c. Expire non-technical active jobs that have applications
let roleExpiredCount = 0;
for (const fnSlug of EXCLUDED_JOB_FUNCTIONS) {
  const { data: rows } = await supabase
    .from('jobs')
    .select('id')
    .eq('status', 'active')
    .eq('job_function_slug', fnSlug)
    .limit(BATCH_SIZE);
  
  if (rows && rows.length > 0) {
    for (const row of rows) {
      const { count: appCount } = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', row.id);
      
      if (appCount && appCount > 0) {
        await supabase.from('jobs').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', row.id);
        roleExpiredCount++;
      }
    }
  }
}
line(`Non-technical jobs transitioned to expired (app-protected): ${roleExpiredCount}`);

// ── 3. PHYSICAL PURGE OF UNPROTECTED INELIGIBLE JOBS ───────────────────────

section('3. PHYSICAL PURGE OF UNPROTECTED INELIGIBLE JOBS');

let totalPurged = 0;

// 3a. Purge excluded-geography unprotected active jobs
let geoPurgedCount = 0;
for (let batch = 0; batch < MAX_BATCHES; batch++) {
  // Find active excluded-geo jobs without applications or assignments
  const { data: candidates, error: err } = await supabase
    .from('jobs')
    .select('id')
    .eq('status', 'active')
    .in('location_country', EXCLUDED_COUNTRIES)
    .limit(BATCH_SIZE);
  
  if (err) {
    console.error('  Excluded-geo query error:', err.message);
    break;
  }
  if (!candidates || candidates.length === 0) break;

  // Filter out protected jobs client-side
  const deletable = [];
  for (const row of candidates) {
    const { count: ac } = await supabase.from('applications').select('id', { count: 'exact', head: true }).eq('job_id', row.id);
    const { count: jc } = await supabase.from('job_assignments').select('id', { count: 'exact', head: true }).eq('job_id', row.id);
    if ((!ac || ac === 0) && (!jc || jc === 0)) {
      deletable.push(row.id);
    }
  }

  if (deletable.length === 0) break;

  const { error: delErr } = await supabase.from('jobs').delete().in('id', deletable);
  if (delErr) {
    console.error('  Delete batch error:', delErr.message);
    break;
  }
  geoPurgedCount += deletable.length;
  line(`  Batch ${batch + 1}: Deleted ${deletable.length} excluded-geography jobs`);
}
line(`Total excluded-geography jobs purged: ${geoPurgedCount}`);
totalPurged += geoPurgedCount;

// 3b. Purge non-technical unprotected active jobs
let rolePurgedCount = 0;
for (let batch = 0; batch < MAX_BATCHES; batch++) {
  const { data: candidates, error: err } = await supabase
    .from('jobs')
    .select('id')
    .eq('status', 'active')
    .in('job_function_slug', EXCLUDED_JOB_FUNCTIONS)
    .limit(BATCH_SIZE);
  
  if (err) {
    console.error('  Non-tech query error:', err.message);
    break;
  }
  if (!candidates || candidates.length === 0) break;

  const deletable = [];
  for (const row of candidates) {
    const { count: ac } = await supabase.from('applications').select('id', { count: 'exact', head: true }).eq('job_id', row.id);
    const { count: jc } = await supabase.from('job_assignments').select('id', { count: 'exact', head: true }).eq('job_id', row.id);
    if ((!ac || ac === 0) && (!jc || jc === 0)) {
      deletable.push(row.id);
    }
  }

  if (deletable.length === 0) break;

  const { error: delErr } = await supabase.from('jobs').delete().in('id', deletable);
  if (delErr) {
    console.error('  Delete batch error:', delErr.message);
    break;
  }
  rolePurgedCount += deletable.length;
  line(`  Batch ${batch + 1}: Deleted ${deletable.length} non-technical jobs`);
}
line(`Total non-technical jobs purged: ${rolePurgedCount}`);
totalPurged += rolePurgedCount;

// 3c. Purge stale raw payloads (>7 days)
line('\nPurging stale raw payloads (>7 days)...');
const { data: payloadPurge, error: payloadPurgeErr } = await supabase.rpc('purge_stale_raw_payloads', {
  p_batch_size: 1000,
  p_max_batches: 50,
  p_retention_days: 7,
});
if (payloadPurgeErr) {
  console.error('  Payload purge error:', payloadPurgeErr.message);
} else {
  line(`Raw payload purge result: ${JSON.stringify(payloadPurge)}`);
}

line(`\nTotal jobs physically purged: ${totalPurged}`);
line(`Total jobs expired (app-protected): ${geoExpiredCount + roleExpiredCount}`);

// ── 4. POST-PURGE TELEMETRY & VALIDATION ────────────────────────────────────

section('4. POST-PURGE TELEMETRY & VALIDATION');

const postTotalJobs = await countQuery(q => q);
const postActiveJobs = await countQuery(q => q.eq('status', 'active'));
const postExpiredJobs = await countQuery(q => q.eq('status', 'expired'));

line(`Total jobs: ${postTotalJobs} (was ${totalJobs}, Δ${postTotalJobs - totalJobs})`);
line(`Active jobs: ${postActiveJobs} (was ${activeJobs}, Δ${postActiveJobs - activeJobs})`);
line(`Expired jobs: ${postExpiredJobs} (was ${expiredJobs}, Δ${postExpiredJobs - expiredJobs})`);

// Validation checks
const { count: postOlderThan30d } = await supabase
  .from('jobs')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'active')
  .lt('posted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

const { count: postExcludedGeo } = await supabase
  .from('jobs')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'active')
  .in('location_country', EXCLUDED_COUNTRIES);

const { count: postNonTech } = await supabase
  .from('jobs')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'active')
  .in('job_function_slug', EXCLUDED_JOB_FUNCTIONS);

console.log('\n  INVARIANT VALIDATION:');
line(`  Active jobs >30 days old: ${postOlderThan30d} ${postOlderThan30d === 0 ? '✅' : '❌ VIOLATION'}`);
line(`  Active jobs in excluded regions: ${postExcludedGeo} ${postExcludedGeo === 0 ? '✅' : '❌ VIOLATION'}`);
line(`  Active non-technical jobs: ${postNonTech} ${postNonTech === 0 ? '✅' : '❌ VIOLATION'}`);

// Post-purge storage
const { data: postMetrics } = await supabase.rpc('get_retention_and_storage_metrics');
line(`\n  Storage (post-purge):`);
line(`    jobs table: ${postMetrics?.storage?.jobs_table_pretty ?? 'N/A'}`);
line(`    raw_job_payloads table: ${postMetrics?.storage?.raw_job_payloads_pretty ?? 'N/A'}`);

section('CORPUS PURGE COMPLETE');
console.log('');
