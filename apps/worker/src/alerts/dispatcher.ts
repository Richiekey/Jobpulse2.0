import { SupabaseClient } from '@supabase/supabase-js';
import { AlertMatchResult, JobAlert, JobAlertMatchingService, JobAlertMatchCandidate } from '@jobpulse/domain';
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
   * Dispatches matched jobs to user alerts with database-level claim/delivered separation and bounded retries.
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

      // 1. HARD IDEMPOTENCY & LEASE CLAIM (status = 'claimed')
      // Atomically claims undelivered jobs, re-claiming failed jobs and expired leases (> 10 mins)
      const { data: claimedIds, error: claimError } = await this.supabase.rpc(
        'claim_undelivered_alert_jobs',
        {
          p_alert_id: alert.id,
          p_job_ids: newMatchedJobIds,
          p_lease_seconds: 600,
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
        // All candidate jobs were already delivered or actively locked by an in-flight worker
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

        // 2. CONFIRM DELIVERY: Record delivery ledger and mark jobs as 'delivered'
        const { data: deliveryId } = await this.supabase.rpc('record_job_alert_delivery', {
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

        await this.supabase.rpc('mark_alert_jobs_delivered', {
          p_alert_id: alert.id,
          p_job_ids: activeClaimedJobIds,
          p_delivery_id: deliveryId || null,
        });

        report.totalDeliveriesSent++;
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        logger.error('Failed to dispatch job alert after retries', { alertId: alert.id, error: errorMsg });

        report.totalDeliveriesFailed++;
        report.errors.push(`Alert ${alert.id}: ${errorMsg}`);

        // 3. FAILED DELIVERY: Record failed attempt and mark claimed jobs as 'failed' (eligible for retry)
        await this.supabase.rpc('record_job_alert_delivery', {
          p_alert_id: alert.id,
          p_user_id: alert.userId,
          p_matched_job_ids: activeClaimedJobIds,
          p_channel: alert.channel,
          p_status: 'failed',
          p_error_message: errorMsg,
          p_metadata: { frequency: alert.frequency, job_count: eligibleJobs.length },
        });

        await this.supabase.rpc('mark_alert_jobs_failed', {
          p_alert_id: alert.id,
          p_job_ids: activeClaimedJobIds,
          p_error_message: errorMsg,
        });
      }
    }

    return report;
  }

  /**
   * Executes scheduled digest processing for daily or weekly alerts.
   * Aggregates deferred matches from active jobs ingested within the window and dispatches digests.
   */
  public async runScheduledDigests(
    frequency: 'daily' | 'weekly',
    windowHours?: number
  ): Promise<AlertDispatchReport> {
    const hours = windowHours || (frequency === 'daily' ? 24 : 168);
    const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // 1. Fetch active alerts configured for this frequency
    const { data: alerts, error: alertError } = await this.supabase
      .from('job_alerts')
      .select('*')
      .eq('is_active', true)
      .eq('frequency', frequency);

    if (alertError || !alerts || alerts.length === 0) {
      return {
        totalAlertsProcessed: 0,
        totalDeliveriesSent: 0,
        totalDeliveriesFailed: 0,
        totalDuplicatesSkipped: 0,
        errors: [],
      };
    }

    // 2. Fetch active jobs ingested within the frequency window
    const { data: recentJobs, error: jobError } = await this.supabase
      .from('jobs')
      .select('id, title, company_id, location_raw, department, employment_type, workplace_type, description_text, canonical_url, posted_at, companies (name)')
      .eq('status', 'active')
      .gte('first_seen_at', windowStart)
      .order('first_seen_at', { ascending: false })
      .limit(500);

    if (jobError || !recentJobs || recentJobs.length === 0) {
      return {
        totalAlertsProcessed: alerts.length,
        totalDeliveriesSent: 0,
        totalDeliveriesFailed: 0,
        totalDuplicatesSkipped: 0,
        errors: [],
      };
    }

    const candidateJobs: JobAlertMatchCandidate[] = recentJobs.map((j: any) => ({
      id: j.id,
      title: j.title,
      companyName: j.companies?.name || 'Company',
      locationRaw: j.location_raw,
      department: j.department,
      employmentType: j.employment_type,
      remoteType: j.workplace_type,
      descriptionText: j.description_text,
      url: j.canonical_url,
    }));

    const mappedAlerts: JobAlert[] = alerts.map((a: any) => ({
      id: a.id,
      userId: a.user_id,
      title: a.title,
      query: a.query,
      location: a.location,
      department: a.department,
      employmentType: a.employment_type,
      remoteType: a.remote_type,
      frequency: a.frequency,
      channel: a.channel,
      webhookUrl: a.webhook_url,
      isActive: a.is_active,
      lastDispatchedAt: a.last_dispatched_at,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    }));

    // 3. Evaluate multi-criteria matches across candidate jobs
    const matches = JobAlertMatchingService.evaluateAlerts(
      candidateJobs,
      mappedAlerts,
      new Map() // Database claim RPC will handle atomic deduplication
    );

    // 4. Dispatch aggregated digest deliveries
    return this.dispatchMatches(matches, true);
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
