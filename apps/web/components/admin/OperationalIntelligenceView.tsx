'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Users,
  Briefcase,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  RefreshCw,
  Database,
  BarChart3,
  Calendar,
  AlertOctagon,
  Layers,
  ArrowUpRight,
  HelpCircle,
  FileCheck2,
  DollarSign,
  MapPin,
  FileText,
  Zap,
} from 'lucide-react';

export interface OperationalIntelligenceData {
  timeRange: '24h' | '7d' | '30d';
  windowStart: string;
  organizationId: string | null;
  scope?: {
    workforce: string;
    jobs: string;
    sourceHealth: string;
    dataQuality: string;
  };
  workforce: {
    roster: {
      totalWorkers: number;
      activeWorkers: number;
    };
    velocity: {
      dispatched: number;
      startedInWindow: number;
      completed: number;
      cancelled: number;
      skipped: number;
    };
    inProgress: number;
    currentActive: number;
    completionRatePercent: number;
    overdueBacklog: number;
    verifications: {
      verifiedInWindow: number;
      rejectedInWindow: number;
      reviewedInWindow: number;
      pendingCurrent: number;
      approvalRatePercent: number;
      total: number;
    };
    avgTurnaroundHours: number;
  };
  jobs: {
    inventory: {
      activeJobs: number;
      expiredJobs: number;
      totalJobs: number;
    };
    ingestionVelocity: {
      new24h: number;
      new7d: number;
      new30d: number;
    };
    freshness: {
      fresh: number;
      aging: number;
      stale: number;
      critical: number;
    };
    quality: {
      salaryTransparencyPercent: number;
      skillCoveragePercent: number;
      locationSpecificityPercent: number;
      directApplyCoveragePercent: number;
    };
  };
  sourceHealth: {
    reliability: {
      totalRuns: number;
      successfulRuns: number;
      failedRuns: number;
      successRatePercent: number;
    };
    distribution: {
      healthy: number;
      degraded: number;
      failing: number;
      disabled: number;
      total: number;
    };
    executionPerformance: {
      avgDurationMs: number;
      minDurationMs: number;
      maxDurationMs: number;
    };
    yield: {
      avgDiscovered: number;
      avgInserted: number;
      avgUpdated: number;
    };
    failureTaxonomy: Array<{
      category: string;
      count: number;
    }>;
  };
  dataQuality: {
    auditedActiveJobs: number;
    missingFields: {
      missingSalary: number;
      missingSkills: number;
      missingLocation: number;
      missingDescription: number;
    };
    atsResolution: {
      resolvedCount: number;
      fallbackCount: number;
      resolutionRatePercent: number;
      methods: Record<string, number>;
    };
    compensation: {
      currencies: Record<string, number>;
      intervals: Record<string, number>;
    };
  };
}

interface OperationalIntelligenceViewProps {
  organizationId: string | null;
  organizationName?: string;
  isPlatformAdmin: boolean;
}

export const OperationalIntelligenceView: React.FC<OperationalIntelligenceViewProps> = ({
  organizationId,
  organizationName,
  isPlatformAdmin,
}) => {
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [metrics, setMetrics] = useState<OperationalIntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('range', range);
      if (organizationId) {
        params.set('organizationId', organizationId);
      }

      const res = await fetch(`/api/admin/intelligence?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error || `HTTP ${res.status}: Failed to fetch operational intelligence`);
      }

      setMetrics(json.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch operational intelligence');
    } finally {
      setLoading(false);
    }
  }, [organizationId, range]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header Bar: Controls & Time Horizon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '16px 20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart3 size={22} color="#6366f1" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Operational Intelligence</h2>
            <span
              style={{
                fontSize: '0.75rem',
                background: 'rgba(99, 102, 241, 0.1)',
                color: '#6366f1',
                padding: '3px 8px',
                borderRadius: '6px',
                fontWeight: 600,
              }}
            >
              Batch R Authoritative
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {organizationId
              ? `Scoped to ${organizationName || 'Selected Organization'} (Workforce) + Platform Catalog`
              : isPlatformAdmin
              ? 'Global System Intelligence (Across all Organizations & Ingestion Sources)'
              : 'Organization Scoped Telemetry'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Time Horizon Selector */}
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '2px',
            }}
          >
            {(['24h', '7d', '30d'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setRange(t)}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.8rem',
                  fontWeight: range === t ? 700 : 500,
                  borderRadius: '6px',
                  border: 'none',
                  background: range === t ? '#6366f1' : 'transparent',
                  color: range === t ? '#ffffff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {t === '24h' ? '24 Hours' : t === '7d' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchMetrics}
            disabled={loading}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              fontSize: '0.8rem',
            }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#ef4444',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          <XCircle size={20} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={fetchMetrics} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !metrics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card" style={{ height: '140px', opacity: 0.5, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      )}

      {metrics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* ---------------------------------------------------------------- */}
          {/* MODULE 1: WORKFORCE INTELLIGENCE                                 */}
          {/* ---------------------------------------------------------------- */}
          <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users size={20} color="#3b82f6" />
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Module 1: Workforce Intelligence</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Authoritative workforce roster, assignment velocity, and review throughput.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Active Turnaround: <strong>{metrics.workforce.avgTurnaroundHours}h</strong> avg
                </span>
              </div>
            </div>

            {/* Workforce Key Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
              {/* Roster: Active Workers */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Active Workers ({metrics.timeRange})</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: '#3b82f6' }}>
                  {metrics.workforce.roster.activeWorkers}
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}> / {metrics.workforce.roster.totalWorkers} enrolled</span>
                </div>
              </div>

              {/* Completion Rate */}
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>Completion Rate</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: '#10b981' }}>
                  {metrics.workforce.completionRatePercent}%
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {metrics.workforce.velocity.completed} completed in {metrics.timeRange}
                </div>
              </div>

              {/* In-Flight Active Assignments */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Current In-Flight</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px' }}>
                  {metrics.workforce.currentActive}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Assigned or in-progress
                </div>
              </div>

              {/* Overdue Backlog */}
              <div
                style={{
                  background: metrics.workforce.overdueBacklog > 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-secondary)',
                  border: metrics.workforce.overdueBacklog > 0 ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '14px',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: metrics.workforce.overdueBacklog > 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: 600 }}>
                  Overdue Backlog
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: metrics.workforce.overdueBacklog > 0 ? '#ef4444' : 'inherit' }}>
                  {metrics.workforce.overdueBacklog}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Active past deadline
                </div>
              </div>

              {/* Verification Approval Rate (R-H04) */}
              <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600 }}>Verification Activity ({metrics.timeRange})</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: '#f59e0b' }}>
                  {metrics.workforce.verifications.approvalRatePercent}%
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {metrics.workforce.verifications.verifiedInWindow} verified, {metrics.workforce.verifications.rejectedInWindow} rejected
                </div>
                <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginTop: '4px', fontWeight: 600 }}>
                  Current Backlog: {metrics.workforce.verifications.pendingCurrent} pending
                </div>
              </div>
            </div>

            {/* Assignment Velocity Ribbon (R-H03) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Activity in Window:</span>
              <span>Dispatched: <strong>{metrics.workforce.velocity.dispatched}</strong></span>
              <span>Started in Window: <strong>{metrics.workforce.velocity.startedInWindow}</strong></span>
              <span>Current In Progress: <strong style={{ color: '#3b82f6' }}>{metrics.workforce.inProgress}</strong></span>
              <span>Completed: <strong style={{ color: '#10b981' }}>{metrics.workforce.velocity.completed}</strong></span>
              <span>Cancelled: <strong style={{ color: '#ef4444' }}>{metrics.workforce.velocity.cancelled}</strong></span>
              <span>Skipped: <strong style={{ color: '#f59e0b' }}>{metrics.workforce.velocity.skipped}</strong></span>
              <span>Backlog Pending: <strong>{metrics.workforce.verifications.pendingCurrent}</strong></span>
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* MODULE 2: JOB INVENTORY & FRESHNESS                              */}
          {/* ---------------------------------------------------------------- */}
          <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Briefcase size={20} color="#6366f1" />
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Module 2: Job Inventory & Freshness</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Inventory volume, ingestion velocity, and crawl freshness classification.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem' }}>
                <span>Active: <strong>{metrics.jobs.inventory.activeJobs.toLocaleString()}</strong></span>
                <span style={{ color: 'var(--text-muted)' }}>Expired/Historical: <strong>{metrics.jobs.inventory.expiredJobs.toLocaleString()}</strong></span>
                <span>Total: <strong>{metrics.jobs.inventory.totalJobs.toLocaleString()}</strong></span>
              </div>
            </div>

            {/* Ingestion Velocity Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>New Added (24h)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '4px', color: '#6366f1' }}>
                  +{metrics.jobs.ingestionVelocity.new24h.toLocaleString()}
                </div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>New Added (7d)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '4px', color: '#6366f1' }}>
                  +{metrics.jobs.ingestionVelocity.new7d.toLocaleString()}
                </div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>New Added (30d)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '4px', color: '#6366f1' }}>
                  +{metrics.jobs.ingestionVelocity.new30d.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Freshness Classification Spectrum */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Inventory Freshness Radar (Active Jobs)</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Based on scraped_at timestamps</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700 }}>Fresh (≤3 days)</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: '2px', color: '#10b981' }}>
                    {metrics.jobs.freshness.fresh.toLocaleString()}
                  </div>
                </div>

                <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#3b82f6', fontWeight: 700 }}>Aging (4–7 days)</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: '2px', color: '#3b82f6' }}>
                    {metrics.jobs.freshness.aging.toLocaleString()}
                  </div>
                </div>

                <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>Stale (&gt;7 days)</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: '2px', color: '#f59e0b' }}>
                    {metrics.jobs.freshness.stale.toLocaleString()}
                  </div>
                </div>

                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }}>Critical (&gt;14 days)</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: '2px', color: '#ef4444' }}>
                    {metrics.jobs.freshness.critical.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Quality Percentages */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>Salary Transparency</span>
                  <strong>{metrics.jobs.quality.salaryTransparencyPercent}%</strong>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--border-color)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${metrics.jobs.quality.salaryTransparencyPercent}%`, height: '100%', background: '#10b981', borderRadius: '3px' }} />
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>Skills Coverage</span>
                  <strong>{metrics.jobs.quality.skillCoveragePercent}%</strong>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--border-color)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${metrics.jobs.quality.skillCoveragePercent}%`, height: '100%', background: '#6366f1', borderRadius: '3px' }} />
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>Location Specificity</span>
                  <strong>{metrics.jobs.quality.locationSpecificityPercent}%</strong>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--border-color)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${metrics.jobs.quality.locationSpecificityPercent}%`, height: '100%', background: '#3b82f6', borderRadius: '3px' }} />
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>Direct Apply Rate</span>
                  <strong>{metrics.jobs.quality.directApplyCoveragePercent}%</strong>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--border-color)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${metrics.jobs.quality.directApplyCoveragePercent}%`, height: '100%', background: '#10b981', borderRadius: '3px' }} />
                </div>
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* MODULE 3: SOURCE HEALTH & INGESTION TELEMETRY                    */}
          {/* ---------------------------------------------------------------- */}
          <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Activity size={20} color="#10b981" />
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Module 3: Source Health & Ingestion</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Crawler execution reliability, latency percentiles, yield, and failure taxonomy.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Runs ({metrics.timeRange}): <strong>{metrics.sourceHealth.reliability.totalRuns}</strong> ({metrics.sourceHealth.reliability.successRatePercent}% success)
                </span>
              </div>
            </div>

            {/* Source Health States Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                  <CheckCircle2 size={16} />
                  <span>Healthy Sources</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '4px', color: '#10b981' }}>
                  {metrics.sourceHealth.distribution.healthy}
                </div>
              </div>

              <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#3b82f6', fontWeight: 600 }}>
                  <Clock size={16} />
                  <span>Degraded</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '4px', color: '#3b82f6' }}>
                  {metrics.sourceHealth.distribution.degraded}
                </div>
              </div>

              <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>
                  <XCircle size={16} />
                  <span>Failing</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '4px', color: '#ef4444' }}>
                  {metrics.sourceHealth.distribution.failing}
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  <AlertOctagon size={16} />
                  <span>Disabled</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '4px' }}>
                  {metrics.sourceHealth.distribution.disabled}
                </div>
              </div>
            </div>

            {/* Performance & Yield */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Execution Latency</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.8rem' }}>
                  <span>Avg Duration: <strong>{metrics.sourceHealth.executionPerformance.avgDurationMs}ms</strong></span>
                  <span>Min: <strong>{metrics.sourceHealth.executionPerformance.minDurationMs}ms</strong></span>
                  <span>Max: <strong>{metrics.sourceHealth.executionPerformance.maxDurationMs}ms</strong></span>
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Per-Run Crawler Yield</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.8rem' }}>
                  <span>Discovered: <strong>{metrics.sourceHealth.yield.avgDiscovered}</strong></span>
                  <span>Inserted (New): <strong style={{ color: '#10b981' }}>{metrics.sourceHealth.yield.avgInserted}</strong></span>
                  <span>Updated: <strong style={{ color: '#3b82f6' }}>{metrics.sourceHealth.yield.avgUpdated}</strong></span>
                </div>
              </div>
            </div>

            {/* Failure Taxonomy */}
            {metrics.sourceHealth.failureTaxonomy.length > 0 && (
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px', color: '#ef4444' }}>
                  Failure Taxonomy ({metrics.timeRange})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {metrics.sourceHealth.failureTaxonomy.map((f, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'rgba(239, 68, 68, 0.05)',
                        border: '1px solid rgba(239, 68, 68, 0.15)',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                      }}
                    >
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{f.category}</span>
                      <span style={{ fontWeight: 700, color: '#ef4444' }}>{f.count} occurrences</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* MODULE 4: DATA QUALITY & RESOLUTION RADAR                        */}
          {/* ---------------------------------------------------------------- */}
          <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Zap size={20} color="#f59e0b" />
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Module 4: Data Quality & Resolution Radar</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Missing field audits, ATS resolution confidence, and compensation distributions.
                  </p>
                </div>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Audited Active Jobs: <strong>{metrics.dataQuality.auditedActiveJobs.toLocaleString()}</strong>
              </span>
            </div>

            {/* Missing Fields Radar */}
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Missing Field Audit (Active Catalog)</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginTop: '8px' }}>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Missing Salary</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '2px' }}>
                    {metrics.dataQuality.missingFields.missingSalary.toLocaleString()}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Missing Skills</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '2px' }}>
                    {metrics.dataQuality.missingFields.missingSkills.toLocaleString()}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Missing Location</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '2px' }}>
                    {metrics.dataQuality.missingFields.missingLocation.toLocaleString()}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Missing Description</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '2px' }}>
                    {metrics.dataQuality.missingFields.missingDescription.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* ATS URL Resolution & Method Breakdown (R-H01: Authoritative Persisted Resolution State) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>ATS Canonical Resolution</span>
                  <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 700 }}>
                    {metrics.dataQuality.atsResolution.resolutionRatePercent}% Resolved
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '12px' }}>
                  <span>Direct/Resolved: <strong>{metrics.dataQuality.atsResolution.resolvedCount.toLocaleString()}</strong></span>
                  <span>Fallbacks: <strong>{metrics.dataQuality.atsResolution.fallbackCount.toLocaleString()}</strong></span>
                </div>

                {/* Adapter Method Breakdown */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                  {Object.entries(metrics.dataQuality.atsResolution.methods).map(([adapter, cnt]) => (
                    <span
                      key={adapter}
                      style={{
                        fontSize: '0.75rem',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      {adapter}: <strong>{cnt.toLocaleString()}</strong>
                    </span>
                  ))}
                </div>
              </div>

              {/* Compensation Quality */}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Compensation Breakdown</span>
                
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Currencies:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.entries(metrics.dataQuality.compensation.currencies).map(([curr, cnt]) => (
                      <span
                        key={curr}
                        style={{
                          fontSize: '0.75rem',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        {curr}: <strong>{cnt.toLocaleString()}</strong>
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Pay Periods:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.entries(metrics.dataQuality.compensation.intervals).map(([interval, cnt]) => (
                      <span
                        key={interval}
                        style={{
                          fontSize: '0.75rem',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        {interval}: <strong>{cnt.toLocaleString()}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
