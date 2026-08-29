import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertDispatcher } from '../src/alerts/dispatcher';
import { AlertMatchResult, JobAlert } from '@jobpulse/domain';

describe('AlertDispatcher Integration (Batch G)', () => {
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

  it('dispatches email alerts and records delivery via PostgreSQL RPC', async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: 'delivery-uuid-1', error: null }),
    };

    const dispatcher = new AlertDispatcher(mockSupabase as any);
    const report = await dispatcher.dispatchMatches([sampleMatch]);

    expect(report.totalDeliveriesSent).toBe(1);
    expect(report.totalDeliveriesFailed).toBe(0);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('record_job_alert_delivery', {
      p_alert_id: sampleAlert.id,
      p_user_id: sampleAlert.userId,
      p_matched_job_ids: ['job-1001'],
      p_channel: 'email',
      p_status: 'sent',
      p_metadata: {
        job_count: 1,
        sample_titles: ['Staff Frontend Engineer'],
      },
    });
  });

  it('rejects webhook delivery if URL fails SSRF security check', async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: 'delivery-uuid-2', error: null }),
    };

    const ssrfAlert: JobAlert = {
      ...sampleAlert,
      channel: 'webhook',
      webhookUrl: 'http://169.254.169.254/latest/meta-data', // Forbidden AWS metadata endpoint
    };

    const ssrfMatch: AlertMatchResult = {
      ...sampleMatch,
      alert: ssrfAlert,
    };

    const dispatcher = new AlertDispatcher(mockSupabase as any);
    const report = await dispatcher.dispatchMatches([ssrfMatch]);

    expect(report.totalDeliveriesFailed).toBe(1);
    expect(report.errors[0]).toContain('SSRF Security Guard Rejected');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('record_job_alert_delivery', expect.objectContaining({
      p_alert_id: ssrfAlert.id,
      p_status: 'failed',
      p_channel: 'webhook',
    }));
  });
});
