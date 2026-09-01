import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Schema Integrity & Migration Invariants (P0 Gate)', () => {
  const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');

  it('should have all canonical migration files in strictly chronological sequence', () => {
    expect(fs.existsSync(migrationsDir)).toBe(true);
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    
    expect(files.length).toBeGreaterThanOrEqual(15);
    
    // Verify each expected migration is present
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

    for (const expected of expectedMigrations) {
      expect(files).toContain(expected);
    }
  });

  it('should define all core tables with RLS enabled across migrations', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    const combinedSql = files.map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf-8')).join('\n');

    const expectedTables = [
      'profiles',
      'companies',
      'ats_platforms',
      'sources',
      'company_sources',
      'jobs',
      'raw_job_payloads',
      'scrape_runs',
      'saved_jobs',
      'hidden_jobs',
      'applications',
      'user_preferences',
      'user_integrations',
      'scrape_locks',
      'outbound_clicks',
      'job_alerts',
      'job_alert_deliveries',
      'job_alert_delivered_jobs',
    ];

    for (const table of expectedTables) {
      const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
      expect(combinedSql).toMatch(rlsRegex);
    }
  });

  it('should define all critical columns expected by application contracts', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    const combinedSql = files.map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf-8')).join('\n');

    // Jobs table critical evolution columns
    expect(combinedSql).toMatch(/annualized_min/i);
    expect(combinedSql).toMatch(/annualized_max/i);
    expect(combinedSql).toMatch(/has_salary/i);
    expect(combinedSql).toMatch(/equity_mentioned/i);
    expect(combinedSql).toMatch(/consecutive_misses/i);
    expect(combinedSql).toMatch(/canonical_fingerprint/i);

    // Companies table critical columns
    expect(combinedSql).toMatch(/slug/i);
    expect(combinedSql).toMatch(/verified/i);

    // Scrape runs concurrency scope
    expect(combinedSql).toMatch(/concurrency_scope/i);
  });

  it('should define all critical RPC functions required by workers and admin', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    const combinedSql = files.map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf-8')).join('\n');

    const expectedFunctions = [
      'ingest_job_transaction',
      'verify_worker_access',
      'try_acquire_scrape_lock',
      'release_scrape_lock',
      'claim_next_pending_scrape_run',
      'onboard_company_and_source',
      'get_admin_system_metrics',
      'reconcile_company_source_job_lifecycle',
      'schedule_admin_scrape_run',
      'record_job_alert_delivery',
      'claim_undelivered_alert_jobs',
      'mark_alert_jobs_delivered',
      'mark_alert_jobs_failed',
      'get_salary_benchmarks',
    ];

    for (const fn of expectedFunctions) {
      const fnRegex = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${fn}\\b`, 'i');
      expect(combinedSql).toMatch(fnRegex);
    }
  });
});
