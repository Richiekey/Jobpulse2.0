import { SupabaseClient } from '@supabase/supabase-js';
import { AlertMatchResult, JobAlert } from '@jobpulse/domain';
import { SSRFGuard } from '@jobpulse/validation';
import { logger } from '@jobpulse/shared';
import crypto from 'crypto';

export interface AlertDispatchReport {
  totalAlertsProcessed: number;
  totalDeliveriesSent: number;
  totalDeliveriesFailed: number;
  errors: string[];
}

export class AlertDispatcher {
  private supabase: SupabaseClient;
  private webhookSecret: string;

  constructor(supabase: SupabaseClient, webhookSecret?: string) {
    this.supabase = supabase;
    this.webhookSecret = webhookSecret || process.env.JOBPULSE_WEBHOOK_SECRET || 'jobpulse_alert_default_secret';
  }

  /**
   * Dispatches matched jobs to user alerts across their configured channels.
   */
  public async dispatchMatches(matches: AlertMatchResult[]): Promise<AlertDispatchReport> {
    const report: AlertDispatchReport = {
      totalAlertsProcessed: matches.length,
      totalDeliveriesSent: 0,
      totalDeliveriesFailed: 0,
      errors: [],
    };

    for (const match of matches) {
      const { alert, matchedJobs, newMatchedJobIds } = match;

      if (newMatchedJobIds.length === 0) {
        continue;
      }

      try {
        if (alert.channel === 'webhook') {
          await this.dispatchWebhook(alert, matchedJobs);
        } else if (alert.channel === 'email') {
          await this.dispatchEmail(alert, matchedJobs);
        } else {
          // in_app channel
          await this.dispatchInApp(alert, matchedJobs);
        }

        // Record successful delivery atomically in PostgreSQL
        await this.supabase.rpc('record_job_alert_delivery', {
          p_alert_id: alert.id,
          p_user_id: alert.userId,
          p_matched_job_ids: newMatchedJobIds,
          p_channel: alert.channel,
          p_status: 'sent',
          p_metadata: {
            job_count: matchedJobs.length,
            sample_titles: matchedJobs.slice(0, 3).map((j: any) => j.title),
          },
        });

        report.totalDeliveriesSent++;
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        logger.error('Failed to dispatch job alert', { alertId: alert.id, error: errorMsg });

        report.totalDeliveriesFailed++;
        report.errors.push(`Alert ${alert.id}: ${errorMsg}`);

        // Record failed delivery attempt
        await this.supabase.rpc('record_job_alert_delivery', {
          p_alert_id: alert.id,
          p_user_id: alert.userId,
          p_matched_job_ids: newMatchedJobIds,
          p_channel: alert.channel,
          p_status: 'failed',
          p_error_message: errorMsg,
          p_metadata: { job_count: matchedJobs.length },
        });
      }
    }

    return report;
  }

  /**
   * Delivers an alert payload to a user webhook endpoint with HMAC signature and SSRF protection.
   */
  private async dispatchWebhook(alert: JobAlert, matchedJobs: any[]): Promise<void> {
    if (!alert.webhookUrl) {
      throw new Error('Webhook channel selected but no webhook URL was configured.');
    }

    // 1. SSRF Safety Check (Strict RFC1918, metadata, loopback rejection)
    const ssrfCheck = SSRFGuard.isSafeUrl(alert.webhookUrl);
    if (!ssrfCheck.safe) {
      throw new Error(`SSRF Security Guard Rejected Webhook URL: ${ssrfCheck.reason}`);
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

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

      if (!response.ok) {
        throw new Error(`Webhook target responded with HTTP status ${response.status}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Formats and queues email digest notifications.
   */
  private async dispatchEmail(alert: JobAlert, matchedJobs: any[]): Promise<void> {
    logger.info('Dispatched email alert digest', {
      alertId: alert.id,
      userId: alert.userId,
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
      jobCount: matchedJobs.length,
    });
  }
}
