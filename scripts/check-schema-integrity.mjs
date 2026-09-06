/**
 * JobPulse 2.0 — Schema & Migration Integrity Validator (Batch T)
 * 
 * Validates:
 * 1. Migration timestamp format (YYYYMMDDHHMMSS_name.sql)
 * 2. Monotonic timestamp ordering & absence of duplicate timestamps
 * 3. File non-emptiness & SQL syntax sanity
 * 4. Dangerous destructive statement prevention (no unhedged DROP TABLE)
 * 5. Specific architectural schema invariants:
 *    - R-H01: url_resolution_method is nullable with NO default in Batch R
 *    - R-H02: error_class exists with classification function in Batch R
 * 6. Live schema audit verification when --audit is specified
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { evaluateEnvironmentSafety, loadTestEnvFiles } from './environment-safety.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../supabase/migrations');

const isAuditMode = process.argv.includes('--audit') || process.env.AUDIT_MODE === '1';

async function main() {
  console.log('🔍 [Gate 5] Verifying Schema & Migration Integrity...');

  if (!fs.existsSync(migrationsDir)) {
    console.error('❌ FAIL: Migrations directory missing:', migrationsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  if (files.length === 0) {
    console.error('❌ FAIL: Zero migration files discovered.');
    process.exit(1);
  }

  console.log(`📁 Found ${files.length} canonical SQL migration files.`);

  // 1. Timestamp format & duplicate detection
  const timestampRegex = /^(\d{14})_([a-z0-9_]+)\.sql$/;
  const timestampsSeen = new Map();
  let previousTimestamp = '';

  for (const file of files) {
    const match = file.match(timestampRegex);
    if (!match) {
      console.error(`❌ FAIL: Invalid migration filename format: "${file}". Must match YYYYMMDDHHMMSS_<name>.sql`);
      process.exit(1);
    }

    const timestamp = match[1];
    if (timestampsSeen.has(timestamp)) {
      console.error(`❌ FAIL: Duplicate migration timestamp detected: "${timestamp}" in ${file} and ${timestampsSeen.get(timestamp)}`);
      process.exit(1);
    }
    timestampsSeen.set(timestamp, file);

    if (timestamp < previousTimestamp) {
      console.error(`❌ FAIL: Migrations out of chronological order: "${file}" (${timestamp}) is before previous (${previousTimestamp})`);
      process.exit(1);
    }
    previousTimestamp = timestamp;

    // 2. File sanity & syntax safety
    const fullPath = path.join(migrationsDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');

    if (content.trim().length === 0) {
      console.error(`❌ FAIL: Empty migration file: "${file}"`);
      process.exit(1);
    }

    // Flag raw unhedged DROP TABLE (without IF EXISTS)
    const rawDropMatch = content.match(/\bDROP\s+TABLE\s+(?!IF\s+EXISTS\b)[a-z0-9_."]+/i);
    if (rawDropMatch) {
      console.error(`❌ FAIL: Unhedged destructive statement in "${file}": ${rawDropMatch[0]}. Must use IF EXISTS.`);
      process.exit(1);
    }
  }

  console.log('✅ Timestamp ordering and SQL structural sanity verified.');

  // 3. Specific Invariant Checks
  const batchRMigration = files.find(f => f.includes('batch_r_operational_intelligence'));
  if (!batchRMigration) {
    console.error('❌ FAIL: Batch R operational intelligence migration missing.');
    process.exit(1);
  }

  const batchRContent = fs.readFileSync(path.join(migrationsDir, batchRMigration), 'utf-8');

  // Invariant R-H01: url_resolution_method must be nullable with NO default
  if (batchRContent.includes("url_resolution_method TEXT DEFAULT 'direct'")) {
    console.error('❌ FAIL [R-H01]: Fabricated DEFAULT \'direct\' detected in Batch R migration!');
    process.exit(1);
  }
  if (!batchRContent.includes('url_resolution_method DROP DEFAULT') && !batchRContent.includes('url_resolution_method TEXT;')) {
    console.error('❌ FAIL [R-H01]: Missing explicit DROP DEFAULT or un-defaulted url_resolution_method declaration.');
    process.exit(1);
  }
  console.log('✅ Schema Invariant R-H01 verified: url_resolution_method has NO fabricated default.');

  // Invariant R-H02: error_class must exist and have classify_source_error
  if (!batchRContent.includes('error_class TEXT') || !batchRContent.includes('classify_source_error')) {
    console.error('❌ FAIL [R-H02]: Missing error_class column or classify_source_error function in Batch R migration.');
    process.exit(1);
  }
  console.log('✅ Schema Invariant R-H02 verified: error_class column and taxonomy classifier present.');

  // 4. Live Schema State Verification (Audit Mode)
  if (isAuditMode) {
    console.log('🔍 [Gate 5 / Audit Mode] Validating live database schema state against target...');

    const fileEnv = loadTestEnvFiles();
    for (const [k, v] of Object.entries(fileEnv)) {
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }

    const safety = evaluateEnvironmentSafety();
    if (!safety.safe) {
      console.error(`❌ FAIL [Audit]: Environment safety check failed: ${safety.reason}`);
      process.exit(1);
    }

    const testUrl = process.env.SUPABASE_TEST_URL || process.env.NEXT_PUBLIC_SUPABASE_TEST_URL;
    const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

    if (!testUrl || !serviceKey) {
      console.error('❌ FAIL [Audit]: Live database credentials missing in audit mode.');
      process.exit(1);
    }

    const supabase = createClient(testUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Check key tables exist and queryable
    const tables = ['jobs', 'companies', 'scrape_runs', 'source_runs', 'applications', 'job_assignments', 'application_verifications'];
    for (const table of tables) {
      const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        console.error(`❌ FAIL [Audit]: Core table "${table}" failed live schema query:`, error.message);
        process.exit(1);
      }
    }

    // Verify R-H01 in live schema: test that inserting a row with url_resolution_method null does not default to 'direct'
    const testJobId = crypto.randomUUID();
    const { data: insertedJob, error: jobInsertErr } = await supabase
      .from('jobs')
      .insert({
        id: testJobId,
        title: `Gate 5 Schema Integrity Test (${Date.now()})`,
        company_name: 'Gate 5 Corp',
        status: 'active',
        source: 'GREENHOUSE',
        scraped_at: new Date().toISOString(),
      })
      .select('url_resolution_method')
      .single();

    if (jobInsertErr) {
      console.error('❌ FAIL [Audit]: Failed to insert test job for schema audit:', jobInsertErr.message);
      process.exit(1);
    }

    if (insertedJob.url_resolution_method !== null) {
      console.error(`❌ FAIL [Audit R-H01]: Live jobs table defaulted url_resolution_method to "${insertedJob.url_resolution_method}". Must be NULL.`);
      await supabase.from('jobs').delete().eq('id', testJobId);
      process.exit(1);
    }

    // Clean up test job
    await supabase.from('jobs').delete().eq('id', testJobId);
    console.log('✅ Live Schema Audit: All core tables accessible, url_resolution_method confirmed NULL by default.');
  }

  console.log('✅ [Gate 5] Schema & Migration Integrity passed all validations.');
}

main().catch((err) => {
  console.error('❌ Fatal error during schema integrity verification:', err);
  process.exit(1);
});
