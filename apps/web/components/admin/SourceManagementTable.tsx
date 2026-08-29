'use client';

import React, { useState } from 'react';
import {
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Play,
  Check,
  Building,
} from 'lucide-react';

export interface AdminCompanySource {
  id: string;
  company_id: string;
  source_id: string;
  source_identifier: string;
  is_active: boolean;
  schedule_interval_minutes: number;
  health_status: 'healthy' | 'degraded' | 'failing' | 'unreachable';
  consecutive_failures: number;
  last_checked_at: string | null;
  companies?: {
    id: string;
    name: string;
    verified: boolean;
    domain?: string;
  };
  sources?: {
    id: string;
    name: string;
    adapter_name: string;
  };
}

interface SourceManagementTableProps {
  sources: AdminCompanySource[];
  loading: boolean;
  onRefresh: () => void;
  onTriggerCrawl: (sourceId?: string) => Promise<void>;
}

export const SourceManagementTable: React.FC<SourceManagementTableProps> = ({
  sources,
  loading,
  onRefresh,
  onTriggerCrawl,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [healthFilter, setHealthFilter] = useState<string>('all');
  const [crawlingSourceId, setCrawlingSourceId] = useState<string | null>(null);
  const [crawlSuccessId, setCrawlSuccessId] = useState<string | null>(null);

  const filteredSources = sources.filter((s) => {
    const companyName = s.companies?.name || s.source_identifier || '';
    const adapterName = s.sources?.adapter_name || '';
    const matchesSearch =
      companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.source_identifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      adapterName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesHealth = healthFilter === 'all' || s.health_status === healthFilter;

    return matchesSearch && matchesHealth;
  });

  const handleCrawlClick = async (sourceId: string) => {
    setCrawlingSourceId(sourceId);
    try {
      await onTriggerCrawl(sourceId);
      setCrawlSuccessId(sourceId);
      setTimeout(() => setCrawlSuccessId(null), 3000);
    } catch (err) {
      console.error('Failed to trigger crawl:', err);
    } finally {
      setCrawlingSourceId(null);
    }
  };

  const renderHealthBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={12} /> Healthy
          </span>
        );
      case 'degraded':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={12} /> Degraded
          </span>
        );
      case 'failing':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#f87171',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            <XCircle size={12} /> Failing
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
              borderRadius: '999px',
              background: 'rgba(156, 163, 175, 0.15)',
              color: '#9ca3af',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            <HelpCircle size={12} /> Unreachable
          </span>
        );
    }
  };

  return (
    <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Table Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder="Search companies, sources, or ATS platforms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input"
              style={{ paddingLeft: '36px', width: '100%' }}
            />
          </div>

          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value)}
            className="input"
            style={{ width: '140px' }}
          >
            <option value="all">All Health</option>
            <option value="healthy">Healthy</option>
            <option value="degraded">Degraded</option>
            <option value="failing">Failing</option>
            <option value="unreachable">Unreachable</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={onRefresh} className="btn btn-secondary" title="Refresh source list">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Company</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>ATS Platform</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Identifier</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Health</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Failures</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Last Checked</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSources.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {loading ? 'Loading company sources...' : 'No company sources match the current filter.'}
                </td>
              </tr>
            ) : (
              filteredSources.map((source) => (
                <tr
                  key={source.id}
                  style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building size={16} color="var(--text-muted)" />
                      <span style={{ fontWeight: 600 }}>{source.companies?.name || 'Unknown Company'}</span>
                      {source.companies?.verified && (
                        <span
                          title="Verified Domain"
                          style={{
                            background: 'rgba(99, 102, 241, 0.2)',
                            color: '#a5b4fc',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '4px',
                          }}
                        >
                          VERIFIED
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                    <span
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 600,
                      }}
                    >
                      {source.sources?.adapter_name || 'ats'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                    {source.source_identifier}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{renderHealthBadge(source.health_status)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {source.consecutive_failures > 0 ? (
                      <span style={{ color: '#ef4444', fontWeight: 700 }}>
                        {source.consecutive_failures}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>0</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                    {source.last_checked_at
                      ? new Date(source.last_checked_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Never'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleCrawlClick(source.id)}
                      disabled={crawlingSourceId === source.id}
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      title="Trigger immediate scrape crawl"
                    >
                      {crawlingSourceId === source.id ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : crawlSuccessId === source.id ? (
                        <Check size={12} color="#10b981" />
                      ) : (
                        <Play size={12} />
                      )}
                      <span>
                        {crawlingSourceId === source.id
                          ? 'Crawling...'
                          : crawlSuccessId === source.id
                          ? 'Queued'
                          : 'Crawl'}
                      </span>
                    </button>
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
