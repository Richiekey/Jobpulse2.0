'use client';

import React from 'react';
import {
  Activity,
  Briefcase,
  Building2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  TrendingUp,
  MousePointerClick,
  FileText,
  Clock,
} from 'lucide-react';

export interface AdminMetricsData {
  system: {
    uptimeSeconds: number;
    timestamp: string;
    nodeVersion?: string;
  };
  companies: {
    total: number;
    verified: number;
  };
  sources: {
    total: number;
    active: number;
    health: {
      healthy: number;
      degraded: number;
      failing: number;
      unreachable: number;
    };
  };
  jobs: {
    active: number;
    expired: number;
  };
  ingestion24h: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    successRatePercent: number;
  };
  engagement: {
    outboundClicks24h: number;
    totalApplicationsTracked: number;
    applicationsByStatus: Record<string, number>;
  };
}

interface AdminMetricsOverviewProps {
  metrics: AdminMetricsData | null;
  loading: boolean;
  onRefresh: () => void;
}

export const AdminMetricsOverview: React.FC<AdminMetricsOverviewProps> = ({
  metrics,
  loading,
  onRefresh,
}) => {
  if (loading && !metrics) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="card" style={{ height: '120px', animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
        <p style={{ color: 'var(--text-muted)' }}>No metrics data available.</p>
        <button onClick={onRefresh} className="btn btn-primary" style={{ marginTop: '12px' }}>
          Retry
        </button>
      </div>
    );
  }

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const verifiedCompanyPercent =
    metrics.companies.total > 0
      ? Math.round((metrics.companies.verified / metrics.companies.total) * 100)
      : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Level KPI Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Active Jobs */}
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Active Roles</span>
            <Briefcase size={20} color="#6366f1" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{metrics.jobs.active.toLocaleString()}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {metrics.jobs.expired.toLocaleString()} expired / historical
          </div>
        </div>

        {/* 24h Scrape Success */}
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>24h Ingestion Reliability</span>
            <TrendingUp size={20} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>
            {metrics.ingestion24h.successRatePercent}%
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {metrics.ingestion24h.successfulRuns} / {metrics.ingestion24h.totalRuns} successful crawls
          </div>
        </div>

        {/* Tracked Companies */}
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Active Companies</span>
            <Building2 size={20} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{metrics.companies.total}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {metrics.companies.verified} verified domains ({verifiedCompanyPercent}%)
          </div>
        </div>

        {/* Applications Tracked */}
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Application Funnel</span>
            <FileText size={20} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>
            {metrics.engagement.totalApplicationsTracked}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {metrics.engagement.outboundClicks24h} clicks in 24h
          </div>
        </div>
      </div>

      {/* Secondary Row: Source Health State Breakdown & Funnel Stages */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* Source Health Breakdown */}
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>ATS Source Health States</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {metrics.sources.active} / {metrics.sources.total} Active
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <CheckCircle2 size={22} color="#10b981" />
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399' }}>
                  {metrics.sources.health.healthy}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Healthy</div>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <AlertTriangle size={22} color="#f59e0b" />
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24' }}>
                  {metrics.sources.health.degraded}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Degraded</div>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <XCircle size={22} color="#ef4444" />
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f87171' }}>
                  {metrics.sources.health.failing}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Failing</div>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(156, 163, 175, 0.1)',
                border: '1px solid rgba(156, 163, 175, 0.2)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <HelpCircle size={22} color="#9ca3af" />
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d1d5db' }}>
                  {metrics.sources.health.unreachable}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Unreachable</div>
              </div>
            </div>
          </div>
        </div>

        {/* Application Status Funnel */}
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Application Pipeline Distribution</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Uptime: {formatUptime(metrics.system.uptimeSeconds)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.entries(metrics.engagement.applicationsByStatus).length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No tracked applications recorded yet.
              </p>
            ) : (
              Object.entries(metrics.engagement.applicationsByStatus).map(([status, count]) => (
                <div
                  key={status}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <span style={{ textTransform: 'capitalize', fontWeight: 600, fontSize: '0.85rem' }}>
                    {status}
                  </span>
                  <span
                    style={{
                      background: 'rgba(99, 102, 241, 0.2)',
                      color: '#a5b4fc',
                      borderRadius: '999px',
                      padding: '2px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    {count}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
