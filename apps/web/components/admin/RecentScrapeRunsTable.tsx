'use client';

import React from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  Copy,
  ExternalLink,
} from 'lucide-react';
import type { AdminScrapeRunItem } from '@/app/api/admin/scrape/runs/route';

interface RecentScrapeRunsTableProps {
  runs: AdminScrapeRunItem[];
  loading: boolean;
  onRefresh: () => void;
}

export const RecentScrapeRunsTable: React.FC<RecentScrapeRunsTableProps> = ({
  runs,
  loading,
  onRefresh,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const copyToClipboard = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'Running...';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    return `${min}m ${sec % 60}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: 600,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <CheckCircle2 size={12} />
            Completed
          </span>
        );
      case 'running':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: 600,
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}
          >
            <RefreshCw size={12} className="animate-spin" />
            Running
          </span>
        );
      case 'pending':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: 600,
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            <Clock size={12} />
            Queued
          </span>
        );
      default:
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: 600,
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <XCircle size={12} />
            Failed
          </span>
        );
    }
  };

  const getModeBadge = (mode: string) => {
    const labels: Record<string, { label: string; color: string; bg: string }> = {
      manual_global: { label: 'Manual Global', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.15)' },
      manual_company: { label: 'Manual Company', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' },
      manual_source: { label: 'Manual Source', color: '#f472b6', bg: 'rgba(244, 114, 182, 0.15)' },
      scheduled: { label: 'Scheduled', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
    };

    const cfg = labels[mode] || { label: mode, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' };

    return (
      <span
        style={{
          padding: '2px 8px',
          borderRadius: '6px',
          fontSize: '0.7rem',
          fontWeight: 600,
          color: cfg.color,
          background: cfg.bg,
          border: `1px solid ${cfg.color}33`,
        }}
      >
        {cfg.label}
      </span>
    );
  };

  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
            Recent Crawl Runs & Execution Telemetry
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Authoritative execution history, worker status, and ingestion counts across all runs
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="btn btn-secondary"
          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Runs</span>
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>Run ID</th>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>Mode</th>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>Duration</th>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>Sources (Att / S / F)</th>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>Jobs (Disc / Ins / Upd)</th>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>Outcome Summary</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  {loading ? 'Loading execution runs...' : 'No scrape runs recorded yet.'}
                </td>
              </tr>
            ) : (
              runs.map((r) => (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{r.id.slice(0, 8)}</span>
                      <button
                        onClick={() => copyToClipboard(r.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copiedId === r.id ? '#34d399' : 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '2px',
                        }}
                        title="Copy full Run ID"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>{getStatusBadge(r.status)}</td>
                  <td style={{ padding: '10px 12px' }}>{getModeBadge(r.executionMode)}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatDuration(r.startedAt, r.completedAt)}
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 600 }}>{r.sourcesAttempted}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                      {' '}
                      ({r.sourcesSucceeded} ok / {r.sourcesFailed} fail)
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#60a5fa', fontWeight: 600 }}>{r.jobsDiscovered}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                      {' '}
                      / +{r.jobsInserted} / ~{r.jobsUpdated}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                    <span
                      style={{
                        color:
                          r.outcomeText.startsWith('Completed')
                            ? '#34d399'
                            : r.outcomeText.startsWith('Running')
                              ? '#60a5fa'
                              : r.outcomeText.startsWith('Queued')
                                ? '#fbbf24'
                                : '#f87171',
                      }}
                    >
                      {r.outcomeText}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
