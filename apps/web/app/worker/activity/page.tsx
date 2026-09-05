'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Briefcase,
  CheckSquare,
  ShieldCheck,
  RefreshCw,
  Clock,
  AlertCircle,
  FileCheck,
  ExternalLink,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { useWorker } from '@/components/worker/WorkerContext';
import type { WorkerActivityItem } from '@/app/api/worker/activity/route';

type ActivityCategoryTab = 'all' | 'assignment' | 'application' | 'verification' | 'sync';

export default function WorkerActivityPage() {
  const { activeOrgId, activeOrg } = useWorker();

  const [activities, setActivities] = useState<WorkerActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActivityCategoryTab>('all');
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const fetchActivities = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeOrgId) {
        params.set('organizationId', activeOrgId);
      }
      if (activeTab !== 'all') {
        params.set('category', activeTab);
      }
      params.set('limit', '50');

      const res = await fetch(`/api/worker/activity?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to load activity stream.');
      }

      setActivities(json.data?.items || []);
      setTotalCount(json.data?.total || 0);
      setHasMore(Boolean(json.data?.hasMore));
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId, activeTab]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Format relative timestamp
  const formatTimeAgo = (dateStr: string) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'assignment':
        return <Briefcase size={16} style={{ color: 'var(--brand-text)' }} />;
      case 'application':
        return <CheckSquare size={16} style={{ color: 'var(--brand-text)' }} />;
      case 'verification':
        return <ShieldCheck size={16} style={{ color: 'var(--success-text)' }} />;
      case 'sync':
        return <RefreshCw size={16} style={{ color: 'var(--warning-text)' }} />;
      default:
        return <Activity size={16} style={{ color: 'var(--text-secondary)' }} />;
    }
  };

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity size={24} style={{ color: 'var(--brand-text)' }} />
              <span>Real-Time Activity Stream</span>
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Chronological event audit log of assignments, applications, verification reviews, and sync operations.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchActivities()}
            className="btn btn-secondary"
            style={{ fontSize: '0.8125rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'wrap',
          marginBottom: '20px',
          paddingBottom: '14px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {[
          { id: 'all', label: 'All Activity' },
          { id: 'assignment', label: 'Assignments' },
          { id: 'application', label: 'Applications' },
          { id: 'verification', label: 'Verifications' },
          { id: 'sync', label: 'Sheets Sync' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as ActivityCategoryTab)}
            className={`btn ${activeTab === tab.id ? 'btn-secondary' : 'btn-ghost'}`}
            style={{
              fontSize: '0.8125rem',
              padding: '6px 12px',
              fontWeight: activeTab === tab.id ? 700 : 500,
              backgroundColor: activeTab === tab.id ? 'var(--bg-surface-elevated)' : 'transparent',
              borderColor: activeTab === tab.id ? 'var(--border-default)' : 'transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error Alert */}
      {error && (
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: 'var(--danger-surface)',
            border: '1px solid var(--danger-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger-text)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          <AlertCircle size={18} />
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={() => fetchActivities()} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: '74px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                animation: 'pulse 1.5s infinite',
              }}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && activities.length === 0 && (
        <div
          style={{
            padding: '64px 20px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--bg-surface-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: 'var(--text-muted)',
            }}
          >
            <Activity size={24} />
          </div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            No activity recorded yet
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
            Activities from assignments, applications, verifications, and sync will appear here in chronological order.
          </p>
        </div>
      )}

      {/* Timeline List */}
      {!isLoading && activities.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {activities.map((item) => (
            <div
              key={item.id}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                transition: 'border-color 0.15s ease',
              }}
            >
              {/* Category Icon */}
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {getCategoryIcon(item.category)}
              </div>

              {/* Title & Description */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {item.title}
                  </h3>

                  {item.status && (
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-xs)',
                        textTransform: 'uppercase',
                        backgroundColor:
                          item.status === 'verified' || item.status === 'completed' || item.status === 'synced'
                            ? 'var(--success-surface)'
                            : item.status === 'rejected' || item.status === 'failed' || item.status === 'dead_letter'
                            ? 'var(--danger-surface)'
                            : 'var(--bg-surface-elevated)',
                        color:
                          item.status === 'verified' || item.status === 'completed' || item.status === 'synced'
                            ? 'var(--success-text)'
                            : item.status === 'rejected' || item.status === 'failed' || item.status === 'dead_letter'
                            ? 'var(--danger-text)'
                            : 'var(--text-secondary)',
                      }}
                    >
                      {item.status}
                    </span>
                  )}
                </div>

                <p
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--text-secondary)',
                    marginTop: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.description}
                </p>
              </div>

              {/* Timestamp */}
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Clock size={12} />
                <span>{formatTimeAgo(item.occurredAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
