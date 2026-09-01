import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Security Privilege Boundaries & RBAC Hardening (Phase 10 & 11)', () => {
  const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');

  it('ensures migration 0016 enforces strict RBAC revoking anon access to privileged RPCs', () => {
    const migration16Path = path.join(migrationsDir, '20260829000016_security_advisor_hardening.sql');
    expect(fs.existsSync(migration16Path)).toBe(true);
    const sql = fs.readFileSync(migration16Path, 'utf-8');

    // Worker RPCs revoked from PUBLIC, anon, and authenticated
    const workerFns = [
      'ingest_job_transaction',
      'verify_worker_access',
      'try_acquire_scrape_lock',
      'release_scrape_lock',
      'claim_next_pending_scrape_run',
      'reconcile_company_source_job_lifecycle',
      'claim_undelivered_alert_jobs',
      'mark_alert_jobs_delivered',
      'mark_alert_jobs_failed',
      'record_job_alert_delivery',
    ];

    for (const fn of workerFns) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn}`);
      expect(sql).toContain(`TO service_role`);
    }

    // Admin RPCs revoked from PUBLIC and anon
    const adminFns = [
      'is_admin',
      'get_admin_system_metrics',
      'onboard_company_and_source',
      'schedule_admin_scrape_run',
      'force_unlock_scrape',
    ];

    for (const fn of adminFns) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn}`);
    }

    // Trigger functions revoked from API roles
    const triggerFns = [
      'jobs_search_vector_update',
      'handle_new_user',
      'prevent_role_escalation',
    ];

    for (const fn of triggerFns) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn}`);
    }
  });

  it('ensures public search functions use SECURITY INVOKER with explicit search_path', () => {
    const migration16Path = path.join(migrationsDir, '20260829000016_security_advisor_hardening.sql');
    const sql = fs.readFileSync(migration16Path, 'utf-8');

    expect(sql).toMatch(/get_salary_benchmarks[\s\S]*?SECURITY\s+INVOKER/i);
    expect(sql).toMatch(/get_salary_benchmarks[\s\S]*?SET\s+search_path\s*=\s*public,\s*pg_temp/i);
  });
});
