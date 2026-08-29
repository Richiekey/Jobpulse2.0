# JobPulse 2.0 — Backup, Disaster Recovery & Secret Rotation

## 1. Backup Strategy

- **Automated Point-in-Time Recovery (PITR)**: Supabase PostgreSQL continuous WAL archiving enabling restoration to any second within the retention window.
- **Daily Logical Backups**: Automated `pg_dump` snapshots stored securely in encrypted, isolated Cloud Storage with 30-day lifecycle retention.

---

## 2. Disaster Recovery Scenarios & Runbooks

### Scenario A: Corrupt Migration or Bad Database Deploy
1. **Action**: Revert application traffic to previous deployment on Vercel.
2. **Database Rollback**: Execute down-migration script or restore database to pre-migration PITR timestamp.
3. **Data Verification**: Verify `jobs`, `saved_jobs`, and `applications` row counts against metrics before reopening traffic.

### Scenario B: Massive Source Scraper Poisoning (e.g. Scraper bug marks active jobs stale)
1. **Action**: Immediately trigger worker pause via Redis / DB lock flag.
2. **Analysis**: Inspect `scrape_runs` and `raw_job_payloads` to isolate affected batch.
3. **Remediation**: Re-run targeted company scrape with updated parser version or run the reconciliation query:
   ```sql
   UPDATE jobs SET status = 'active', missed_scrape_count = 0 
   WHERE id IN (SELECT job_id FROM job_sources WHERE last_seen_at > NOW() - INTERVAL '7 days');
   ```

---

## 3. Secret Rotation Procedures

1. **Supabase Service Role Key**:
   - Generate new key in Supabase Dashboard.
   - Update worker environment variables (`SUPABASE_SERVICE_ROLE_KEY`).
   - Verify worker ingestion and API auth.
   - Revoke previous key.
2. **OAuth Credentials & Google Cloud Service Accounts**:
   - Create secondary key pair in Google Cloud Console.
   - Update `GOOGLE_SHEETS_PRIVATE_KEY` across environments.
   - Verify application export flows.
   - Delete old key pair.
