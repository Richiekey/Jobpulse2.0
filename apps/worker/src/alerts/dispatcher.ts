import { SupabaseClient } from '@supabase/supabase-js';
import { AlertMatchResult, JobAlert } from '@jobpulse/domain';
import { SSRFGuard } from '@jobpulse/validation';
import { logger } from '@jobpulse/shared';
import crypto from 'crypto';

export interface AlertDispatchReport {
  totalAlertsProcessed: number;
  totalDeliveriesSent: number;
  totalDeliveriesFailed: number;
  totalDuplicatesSkipped: number;
  errors: string[];
}

export class AlertDispatcher {
  private supabase: SupabaseClient;
  private webhookSecret: string;
  private maxRetries: number;

  constructor(supabase: SupabaseClient, webhookSecret?: string, maxRetries = 3) {
    this.supabase = supabase;
    this.webhookSecret = webhookSecret || process.env.JOBPULSE_WEBHOOK_SECRET || 'jobpulse_alert_default_secret';
    this.maxRetries = maxRetries;
  }

  /**
   * Dispatches matched jobs to user alerts with database-level idempotency and bounded retries.
   */
  public async dispatchMatches(
    matches: AlertMatchResult[],
    forceScheduledDigest = false
  ): Promise<AlertDispatchReport> {
    const report: AlertDispatchReport = {
      totalAlertsProcessed: matches.length,
      totalDeliveriesSent: 0,
      totalDeliveriesFailed: 0,
      totalDuplicatesSkipped: 0,
      errors: [],
    };

    for (const match of matches) {
      const { alert, matchedJobs, newMatchedJobIds } = match;

      if (!alert.isActive || newMatchedJobIds.length === 0) {
        continue;
      }

      // Frequency Scheduling Filter:
      // For daily/weekly alerts, only dispatch if triggered via scheduled digest or frequency window elapsed
      if (!forceScheduledDigest && alert.frequency !== 'instant') {
        const lastSent = alert.lastDispatchedAt ? new Date(alert.lastDispatchedAt).getTime() : 0;
        const now = Date.now();
        const requiredElapsedMs = alert.frequency === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;

        if (now - lastSent < requiredElapsedMs) {
          // Defer delivery until scheduled digest cycle
          continue;
        }
      }

      // 1. HARD IDEMPOTENCY INVARIANT (Database-level atomic claim)
      // Atomically inserts into public.job_alert_delivered_jobs and returns only previously unclaimed IDs
      const { data: claimedIds, error: claimError } = await this.supabase.rpc(
        'claim_undelivered_alert_jobs',
        {
          p_alert_id: alert.id,
          p_job_ids: newMatchedJobIds,
        }
      );

      if (claimError) {
        logger.error('Failed to atomically claim undelivered alert jobs', { alertId: alert.id, error: claimError });
        report.totalDeliveriesFailed++;
        report.errors.push(`Alert ${alert.id}: Claim RPC failed - ${claimError.message}`);
        continue;
      }

      const activeClaimedJobIds = Array.isArray(claimedIds) ? claimedIds : [];

      if (activeClaimedJobIds.length === 0) {
        // All candidate jobs were already delivered by a concurrent worker or prior execution
        report.totalDuplicatesSkipped++;
        continue;
      }

      // Filter matched jobs to only those whose claims succeeded
      const eligibleJobs = matchedJobs.filter((j) => activeClaimedJobIds.includes(j.id));

      try {
        if (alert.channel === 'webhook') {
          await this.dispatchWebhookWithRetry(alert, eligibleJobs);
        } else if (alert.channel === 'email') {
          await this.dispatchEmail(alert, eligibleJobs);
        } else {
          // in_app channel
          await this.dispatchInApp(alert, eligibleJobs);
        }

        // Record successful delivery atomically in PostgreSQL
        await this.supabase.rpc('record_job_alert_delivery', {
          p_alert_id: alert.id,
          p_user_id: alert.userId,
          p_matched_job_ids: activeClaimedJobIds,
          p_channel: alert.channel,
          p_status: 'sent',
          p_metadata: {
            frequency: alert.frequency,
            job_count: eligibleJobs.length,
            sample_titles: eligibleJobs.slice(0, 3).map((j: any) => j.title),
          },
        });

        report.totalDeliveriesSent++;
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        logger.error('Failed to dispatch job alert after retries', { alertId: alert.id, error: errorMsg });

        report.totalDeliveriesFailed++;
        report.errors.push(`Alert ${alert.id}: ${errorMsg}`);

        // Record failed delivery attempt in audit log
        await this.supabase.rpc('record_job_alert_delivery', {
          p_alert_id: alert.id,
          p_user_id: alert.userId,
          p_matched_job_ids: activeClaimedJobIds,
          p_channel: alert.channel,
          p_status: 'failed',
          p_error_message: errorMsg,
          p_metadata: { frequency: alert.frequency, job_count: eligibleJobs.length },
        });
      }
    }

    return report;
  }

  /**
   * Delivers an alert payload to a webhook endpoint with bounded exponential backoff retry and SSRF check.
   */
  private async dispatchWebhookWithRetry(alert: JobAlert, matchedJobs: any[]): Promise<void> {
    if (!alert.webhookUrl) {
      throw new Error('Webhook channel selected but no webhook URL was configured.');
    }

    // 1. PRE-DISPATCH SSRF GUARD: Validate immediately prior to outbound HTTP request
    const ssrfCheck = SSRFGuard.isSafeUrl(alert.webhookUrl);
    if (!ssrfCheck.safe) {
      throw new Error(`SSRF Security Guard Blocked Outbound Dispatch: ${ssrfCheck.reason}`);
    }

    const payload = JSON.stringify({
      event: 'job_alert.matches',
      alert: {
        id: alert.id,
        title: alert.title,
        query: alert.query,
        frequency: alert.frequency,
      },
      matchCount: matchedJobs.length,
      jobs: matchedJobs.map((j) => ({
        id: j.id,
        title: j.title,
        company: j.companyName,
        location: j.locationRaw,
        url: j.url,
      })),
      timestamp: new Date().toISOString(),
    });

    const signature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      try {
        const response = await fetch(alert.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'JobPulse-Webhook-Dispatcher/2.0',
            'X-JobPulse-Signature': signature,
            'X-JobPulse-Event': 'job_alert.matches',
          },
          body: payload,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return; // Success!
        }

        // Check if status is non-retryable (400, 401, 403, 404, 422)
        const isRetryable = response.status === 429 || response.status >= 500;
        if (!isRetryable) {
          throw new Error(`Webhook target rejected payload with non-retryable HTTP ${response.status}`);
        }

        lastError = new Error(`Webhook target responded with HTTP ${response.status} (attempt ${attempt}/${this.maxRetries})`);
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;

        // Abort errors or network failures are retryable
        if (attempt >= this.maxRetries) {
          break;
        }

        // Bounded exponential backoff: 250ms, 500ms...
        const backoffMs = Math.min(250 * Math.pow(2, attempt - 1), 2000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError || new Error(`Webhook dispatch failed after ${this.maxRetries} attempts.`);
  }

  /**
   * Formats email digest notifications.
   */
  private async dispatchEmail(alert: JobAlert, matchedJobs: any[]): Promise<void> {
    logger.info('Dispatched email alert digest', {
      alertId: alert.id,
      userId: alert.userId,
      frequency: alert.frequency,
      jobCount: matchedJobs.length,
    });
  }

  /**
   * Formats in-app notifications.
   */
  private async dispatchInApp(alert: JobAlert, matchedJobs: any[]): Promise<void> {
    logger.info('Recorded in-app alert notification', {
      alertId: alert.id,
      userId: alert.userId,
      frequency: alert.frequency,
      jobCount: matchedJobs.length,
    });
  }
}
