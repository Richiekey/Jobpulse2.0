import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/cron/retention
 *
 * Automated database retention cron. Purges stale raw payloads and expired job
 * records to keep database storage under control on the Supabase Free plan.
 *
 * Called by Vercel Cron (daily at 03:00 UTC). Protected by CRON_SECRET.
 *
 * Retention policy:
 *   - raw_job_payloads: 3-day retention (largest table, ~63 MB/day)
 *   - jobs (expired/stale): 14-day retention (protects applied/assigned jobs)
 */
export const maxDuration = 10; // Vercel Hobby plan limit

interface PurgeResult {
  raw_payloads: Record<string, unknown> | null;
  stale_jobs: Record<string, unknown> | null;
  db_size_before: string | null;
  db_size_after: string | null;
  error: string | null;
}

async function runRetention(): Promise<PurgeResult> {
  const supabase = createAdminClient();
  const result: PurgeResult = {
    raw_payloads: null,
    stale_jobs: null,
    db_size_before: null,
    db_size_after: null,
    error: null,
  };

  // Measure DB size before
  const { data: sizeBefore } = await supabase.rpc('get_retention_and_storage_metrics');
  if (sizeBefore) {
    result.db_size_before = JSON.stringify(sizeBefore);
  }

  // 1. Purge raw payloads — 3-day retention, small batches to stay within 10s limit
  const { data: payloadResult, error: payloadError } = await supabase.rpc(
    'purge_stale_raw_payloads',
    {
      p_batch_size: 500,
      p_max_batches: 5,
      p_retention_days: 3,
    }
  );

  if (payloadError) {
    result.error = `raw_payloads purge failed: ${payloadError.message}`;
    return result;
  }
  result.raw_payloads = payloadResult;

  // 2. Purge stale job records — 14-day retention (protects applied/assigned jobs)
  const { data: jobResult, error: jobError } = await supabase.rpc(
    'purge_stale_job_records',
    {
      p_batch_size: 500,
      p_max_batches: 5,
      p_retention_days: 14,
    }
  );

  if (jobError) {
    result.error = `stale_jobs purge failed: ${jobError.message}`;
    return result;
  }
  result.stale_jobs = jobResult;

  // Measure DB size after
  const { data: sizeAfter } = await supabase.rpc('get_retention_and_storage_metrics');
  if (sizeAfter) {
    result.db_size_after = JSON.stringify(sizeAfter);
  }

  return result;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env['CRON_SECRET'];
  const authHeader = request.headers.get('authorization');

  // Vercel Cron sends the secret as a Bearer token
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runRetention();

    if (result.error) {
      console.error('[retention-cron] Partial failure:', result.error);
      return NextResponse.json(result, { status: 207 });
    }

    console.log('[retention-cron] Success:', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[retention-cron] Fatal error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
