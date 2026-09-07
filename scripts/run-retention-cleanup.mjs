import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

console.log('=== Starting JobPulse Retention & Storage Reclamation Pass ===\n');

// 1. Initial metrics
const { data: initialMetrics } = await supabase.rpc('get_retention_and_storage_metrics');
console.log('Initial Database Metrics:');
console.log(JSON.stringify(initialMetrics, null, 2));

// 2. Purge stale jobs (30-day cutoff, application-protected)
console.log('\nPurging stale expired jobs (>30 days, unprotected)...');
const { data: jobPurge, error: jobPurgeErr } = await supabase.rpc('purge_stale_job_records', {
  p_batch_size: 500,
  p_max_batches: 20,
  p_retention_days: 30,
});
if (jobPurgeErr) {
  console.error('Job purge error:', jobPurgeErr.message);
} else {
  console.log('Job Purge Result:', jobPurge);
}

// 3. Purge stale raw payloads (>7 days)
console.log('\nPurging stale raw payloads (>7 days)...');
const { data: payloadPurge, error: payloadPurgeErr } = await supabase.rpc('purge_stale_raw_payloads', {
  p_batch_size: 1000,
  p_max_batches: 20,
  p_retention_days: 7,
});
if (payloadPurgeErr) {
  console.error('Payload purge error:', payloadPurgeErr.message);
} else {
  console.log('Payload Purge Result:', payloadPurge);
}

// 4. Final metrics
const { data: finalMetrics } = await supabase.rpc('get_retention_and_storage_metrics');
console.log('\nFinal Database Metrics Post-Purge:');
console.log(JSON.stringify(finalMetrics, null, 2));

console.log('\n=== Retention & Storage Reclamation Complete ===');
