import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertDispatcher } from '../src/alerts/dispatcher';
import { AlertMatchResult, JobAlert } from '@jobpulse/domain';

describe('AlertDispatcher — Idempotency, Retries, Frequency & SSRF (Batch G Remediation)', () => {
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

  describe('Durable Database Idempotency (P0)', () => {
    it('claims undelivered jobs atomically and dispatches new matches', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockImplementation((fnName: string, params: any) => {
          if (fnName === 'claim_undelivered_alert_jobs') {
            return Promise.resolve({ data: ['job-1001'], error: null }); // Successfully claimed
          }
          if (fnName === 'record_job_alert_delivery') {
            return Promise.resolve({ data: 'delivery-uuid-1', error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const dispatcher = new AlertDispatcher(mockSupabase as any);
      const report = await dispatcher.dispatchMatches([sampleMatch]);

      expect(report.totalDeliveriesSent).toBe(1);
      expect(report.totalDuplicatesSkipped).toBe(0);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('claim_undelivered_alert_jobs', {
        p_alert_id: sampleAlert.id,
        p_job_ids: ['job-1001'],
      });
      expect(mockSupabase.rpc).toHaveBeenCalledWith('record_job_alert_delivery', expect.objectContaining({
        p_alert_id: sampleAlert.id,
        p_status: 'sent',
      }));
    });

    it('skips delivery when claim RPC returns empty array (duplicate / concurrent execution)', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockImplementation((fnName: string) => {
          if (fnName === 'claim_undelivered_alert_jobs') {
            return Promise.resolve({ data: [], error: null }); // 0 new claims (already delivered)
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const dispatcher = new AlertDispatcher(mockSupabase as any);
      const report = await dispatcher.dispatchMatches([sampleMatch]);

      expect(report.totalDeliveriesSent).toBe(0);
      expect(report.totalDuplicatesSkipped).toBe(1);
      // Delivery recording should NOT be called since delivery was skipped
      expect(mockSupabase.rpc).not.toHaveBeenCalledWith('record_job_alert_delivery', expect.anything());
    });
  });

  describe('Pre-Dispatch SSRF Protection (P0)', () => {
    it('blocks outbound HTTP dispatch if webhook URL fails SSRF validation immediately before fetch', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockImplementation((fnName: string) => {
          if (fnName === 'claim_undelivered_alert_jobs') {
            return Promise.resolve({ data: ['job-1001'], error: null });
          }
          if (fnName === 'record_job_alert_delivery') {
            return Promise.resolve({ data: 'delivery-uuid-2', error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const ssrfAlert: JobAlert = {
        ...sampleAlert,
        channel: 'webhook',
        webhookUrl: 'http://169.254.169.254/latest/meta-data', // AWS metadata endpoint
      };

      const ssrfMatch: AlertMatchResult = {
        ...sampleMatch,
        alert: ssrfAlert,
      };

      const dispatcher = new AlertDispatcher(mockSupabase as any);
      const report = await dispatcher.dispatchMatches([ssrfMatch]);

      expect(report.totalDeliveriesFailed).toBe(1);
      expect(report.errors[0]).toContain('SSRF Security Guard Blocked Outbound Dispatch');
      expect(mockSupabase.rpc).toHaveBeenCalledWith('record_job_alert_delivery', expect.objectContaining({
        p_alert_id: ssrfAlert.id,
        p_status: 'failed',
        p_channel: 'webhook',
      }));
    });
  });

  describe('Frequency Semantics (P0)', () => {
    it('defers daily alert delivery if 24h window has not elapsed and not a force scheduled digest', async () => {
      const mockSupabase = {
        rpc: vi.fn(),
      };

      const dailyAlert: JobAlert = {
        ...sampleAlert,
        frequency: 'daily',
        lastDispatchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      };

      const match: AlertMatchResult = {
        ...sampleMatch,
        alert: dailyAlert,
      };

      const dispatcher = new AlertDispatcher(mockSupabase as any);
      const report = await dispatcher.dispatchMatches([match], false); // Regular crawl

      expect(report.totalDeliveriesSent).toBe(0);
      expect(report.totalDeliveriesFailed).toBe(0);
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('processes daily alert delivery when forceScheduledDigest is true', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockImplementation((fnName: string) => {
          if (fnName === 'claim_undelivered_alert_jobs') {
            return Promise.resolve({ data: ['job-1001'], error: null });
          }
          if (fnName === 'record_job_alert_delivery') {
            return Promise.resolve({ data: 'delivery-uuid-3', error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const dailyAlert: JobAlert = {
        ...sampleAlert,
        frequency: 'daily',
        lastDispatchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      };

      const match: AlertMatchResult = {
        ...sampleMatch,
        alert: dailyAlert,
      };

      const dispatcher = new AlertDispatcher(mockSupabase as any);
      const report = await dispatcher.dispatchMatches([match], true); // Force scheduled daily digest

      expect(report.totalDeliveriesSent).toBe(1);
    });
  });
});
