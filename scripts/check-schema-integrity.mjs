import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.resolve(__dirname, '../supabase/migrations');

function checkLocalMigrations() {
  console.log('🔍 Checking local canonical migrations...');
  if (!fs.existsSync(migrationsDir)) {
    console.error('❌ Migrations directory missing:', migrationsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  console.log(`✅ Found ${files.length} canonical migration files:`);
  for (const f of files) {
    console.log(`   - ${f}`);
  }

  const expectedMigrations = [
    '20260829000001_initial_production_schema.sql',
    '20260829000002_atomic_ingestion_and_constraints.sql',
    '20260829000003_harden_security_and_contracts.sql',
    '20260829000004_distributed_locks_and_dispatch_queue.sql',
    '20260829000005_worker_token_authorization.sql',
    '20260829000006_company_source_intelligence.sql',
    '20260829000007_transactional_onboarding_and_identity.sql',
    '20260829000008_outbound_clicks_and_application_tracking.sql',
    '20260829000009_admin_metrics_and_job_lifecycle.sql',
    '20260829000010_atomic_scrape_scheduling.sql',
    '20260829000011_job_alerts_and_notifications.sql',
    '20260829000012_alert_delivery_idempotency.sql',
    '20260829000013_alert_claim_lifecycle.sql',
    '20260829000014_salary_compensation_intelligence.sql',
    '20260829000015_production_readiness_fixes.sql',
    '20260829000016_security_advisor_hardening.sql',
  ];

  const missing = expectedMigrations.filter((m) => !files.includes(m));
  if (missing.length > 0) {
    console.error('❌ Missing expected migration files:', missing);
    process.exit(1);
  }

  console.log('✅ Schema migration sequence integrity passed.');
}

checkLocalMigrations();
