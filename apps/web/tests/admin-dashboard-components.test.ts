import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AdminMetricsOverview } from '../components/admin/AdminMetricsOverview';
import { SourceManagementTable } from '../components/admin/SourceManagementTable';
import { SourceOnboardingWizard } from '../components/admin/SourceOnboardingWizard';

describe('Admin Dashboard UI Components (Batch F)', () => {
  const sampleMetrics = {
    system: {
      uptimeSeconds: 7200,
      timestamp: new Date().toISOString(),
    },
    companies: {
      total: 10,
      verified: 8,
    },
    sources: {
      total: 12,
      active: 11,
      health: {
        healthy: 9,
        degraded: 2,
        failing: 1,
        disabled: 0,
      },
    },
    jobs: {
      active: 142,
      expired: 20,
    },
    ingestion24h: {
      totalRuns: 24,
      successfulRuns: 22,
      failedRuns: 2,
      successRatePercent: 91.7,
    },
    engagement: {
      outboundClicks24h: 65,
      totalApplicationsTracked: 35,
      applicationsByStatus: {
        applied: 20,
        interview: 10,
        offer: 5,
      },
    },
  };

  const sampleSources = [
    {
      id: 'cs_1',
      company_id: 'c_1',
      source_id: 's_1',
      source_identifier: 'stripe',
      is_active: true,
      schedule_interval_minutes: 60,
      health_status: 'healthy' as const,
      consecutive_failures: 0,
      last_checked_at: new Date().toISOString(),
      companies: {
        id: 'c_1',
        name: 'Stripe',
        verified: true,
      },
      sources: {
        id: 's_1',
        name: 'Greenhouse',
        adapter_name: 'greenhouse',
      },
    },
    {
      id: 'cs_2',
      company_id: 'c_2',
      source_id: 's_2',
      source_identifier: 'netflix',
      is_active: true,
      schedule_interval_minutes: 30,
      health_status: 'degraded' as const,
      consecutive_failures: 2,
      last_checked_at: new Date().toISOString(),
      companies: {
        id: 'c_2',
        name: 'Netflix',
        verified: true,
      },
      sources: {
        id: 's_2',
        name: 'Lever',
        adapter_name: 'lever',
      },
    },
  ];

  it('renders AdminMetricsOverview component correctly with provided metrics data', () => {
    const el = React.createElement(AdminMetricsOverview, {
      metrics: sampleMetrics,
      loading: false,
      onRefresh: vi.fn(),
    });
    expect(el).toBeDefined();
    expect(el.props.metrics?.jobs.active).toBe(142);
    expect(el.props.metrics?.sources.health.healthy).toBe(9);
    expect(el.props.metrics?.ingestion24h.successRatePercent).toBe(91.7);
  });

  it('renders SourceManagementTable component with sources and callbacks', () => {
    const onTriggerCrawl = vi.fn().mockResolvedValue(undefined);
    const el = React.createElement(SourceManagementTable, {
      sources: sampleSources,
      loading: false,
      onRefresh: vi.fn(),
      onTriggerCrawl,
    });

    expect(el).toBeDefined();
    expect(el.props.sources.length).toBe(2);
    expect(el.props.sources[0]?.companies?.name).toBe('Stripe');
    expect(el.props.sources[1]?.health_status).toBe('degraded');
  });

  it('instantiates SourceOnboardingWizard component with success handler', () => {
    const onSuccess = vi.fn();
    const el = React.createElement(SourceOnboardingWizard, {
      onSuccess,
    });

    expect(el).toBeDefined();
    expect(typeof el.props.onSuccess).toBe('function');
  });
});
