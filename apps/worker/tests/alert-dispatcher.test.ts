import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertDispatcher } from '../src/alerts/dispatcher';
import { AlertMatchResult, JobAlert } from '@jobpulse/domain';

describe('AlertDispatcher — Claim vs Delivered Lifecycle & Scheduled Digests (P0/P1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleAlert: JobAlert = {
    id: 'alert-abc-123',
    userId: 'user-xyz-789',
    title: 'Staff Frontend Engineer',
    query: 'Staff Frontend',
    location: 'Remote',
    frequency: 'instant',
    channel: 'email',
    webhookUrl: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleMatch: AlertMatchResult = {
    alert: sampleAlert,
    matchedJobs: [
      {
        id: 'job-1001',
        title: 'Staff Frontend Engineer',
        companyName: 'Linear',
        locationRaw: 'Remote',
        url: 'https://linear.app/careers/1001',
      },
    ],
    newMatchedJobIds: ['job-1001'],
  };

  describe('P0 — Claim vs Delivered Separation', () => {
    it('marks claimed jobs as delivered upon successful dispatch', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockImplementation((fnName: string, params: any) => {
          if (fnName === 'claim_undelivered_alert_jobs') {
            return Promise.resolve({ data: ['job-1001'], error: null }); // Claimed
          }
          if (fnName === 'record_job_alert_delivery') {
            return Promise.resolve({ data: 'delivery-uuid-1', error: null });
          }
          if (fnName === 'mark_alert_jobs_delivered') {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const dispatcher = new AlertDispatcher(mockSupabase as any);
      const report = await dispatcher.dispatchMatches([sampleMatch]);

      expect(report.totalDeliveriesSent).toBe(1);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('claim_undelivered_alert_jobs', expect.objectContaining({
        p_alert_id: sampleAlert.id,
        p_job_ids: ['job-1001'],
        p_lease_seconds: 600,
      }));
      expect(mockSupabase.rpc).toHaveBeenCalledWith('mark_alert_jobs_delivered', {
        p_alert_id: sampleAlert.id,
        p_job_ids: ['job-1001'],
        p_delivery_id: 'delivery-uuid-1',
      });
    });

    it('marks claimed jobs as failed on dispatch failure so they remain eligible for retry', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockImplementation((fnName: string, params: any) => {
          if (fnName === 'claim_undelivered_alert_jobs') {
            return Promise.resolve({ data: ['job-1001'], error: null });
          }
          if (fnName === 'record_job_alert_delivery') {
            return Promise.resolve({ data: 'delivery-uuid-fail', error: null });
          }
          if (fnName === 'mark_alert_jobs_failed') {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const failedWebhookAlert: JobAlert = {
        ...sampleAlert,
        channel: 'webhook',
        webhookUrl: 'https://bad-gateway.example.com/hook',
      };

      // Mock global fetch to simulate 500 server error
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        } as any)
      );

      const dispatcher = new AlertDispatcher(mockSupabase as any, undefined, 2);
      const report = await dispatcher.dispatchMatches([{ ...sampleMatch, alert: failedWebhookAlert }]);

      expect(report.totalDeliveriesFailed).toBe(1);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('mark_alert_jobs_failed', expect.objectContaining({
        p_alert_id: failedWebhookAlert.id,
        p_job_ids: ['job-1001'],
      }));

      fetchSpy.mockRestore();
    });
  });

  describe('P1 — Scheduled Daily & Weekly Digest Execution', () => {
    it('fetches eligible deferred alerts, discovers matching active jobs, and dispatches digest', async () => {
      const dailyAlertData = {
        id: 'daily-alert-1',
        user_id: 'user-daily-1',
        title: 'Senior Backend Engineer',
        query: 'Backend',
        location: 'Remote',
        frequency: 'daily',
        channel: 'email',
        is_active: true,
        last_dispatched_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25h ago
      };

      const matchingJobData = {
        id: 'job-digest-99',
        display_title: 'Senior Backend Engineer (Go)',
        company_id: 'comp-1',
        locations: ['Remote'],
        employment_type: 'full_time',
        workplace_type: 'remote',
        description: 'Building high throughput systems in Go and PostgreSQL',
        canonical_url: 'https://comp.com/jobs/99',
        first_seen_at: new Date().toISOString(),
        companies: { name: 'Acme Corp' },
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'job_alerts') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [dailyAlertData],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'jobs') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  gte: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({
                        data: [matchingJobData],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
        rpc: vi.fn().mockImplementation((fnName: string) => {
          if (fnName === 'claim_undelivered_alert_jobs') {
            return Promise.resolve({ data: ['job-digest-99'], error: null });
          }
          if (fnName === 'record_job_alert_delivery') {
            return Promise.resolve({ data: 'delivery-digest-1', error: null });
          }
          if (fnName === 'mark_alert_jobs_delivered') {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const dispatcher = new AlertDispatcher(mockSupabase as any);
      const report = await dispatcher.runScheduledDigests('daily');

      expect(report.totalAlertsProcessed).toBe(1);
      expect(report.totalDeliveriesSent).toBe(1);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('claim_undelivered_alert_jobs', expect.objectContaining({
        p_alert_id: 'daily-alert-1',
        p_job_ids: ['job-digest-99'],
      }));
      expect(mockSupabase.rpc).toHaveBeenCalledWith('mark_alert_jobs_delivered', expect.objectContaining({
        p_alert_id: 'daily-alert-1',
        p_job_ids: ['job-digest-99'],
      }));
    });
  });
});
