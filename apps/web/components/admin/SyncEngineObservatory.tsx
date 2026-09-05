'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  RotateCw,
  AlertTriangle,
  XCircle,
  Skull,
  Search,
  RefreshCw,
  Eye,
  RotateCcw,
  FileCode,
  Check,
  X,
  Database,
  Layers,
} from 'lucide-react';

export interface SyncEventItem {
  id: string;
  userId: string;
  organizationId?: string | null;
  applicationId: string;
  provider: 'google_sheets' | string;
  status: 'pending' | 'processing' | 'synced' | 'failed' | 'dead_letter';
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  payload?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncStatusCounts {
  pending: number;
  processing: number;
  synced: number;
  failed: number;
  dead_letter: number;
}

interface SyncEngineObservatoryProps {
  organizationId: string | null;
  organizationName?: string;
}

export const SyncEngineObservatory: React.FC<SyncEngineObservatoryProps> = ({
  organizationId,
  organizationName,
}) => {
  const [counts, setCounts] = useState<SyncStatusCounts>({
    pending: 0,
    processing: 0,
    synced: 0,
    failed: 0,
    dead_letter: 0,
  });
  const [events, setEvents] = useState<SyncEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  // Filters & State
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Retry operation states
  const [retryingEventId, setRetryingEventId] = useState<string | null>(null);
  const [isRetryingBulk, setIsRetryingBulk] = useState(false);
  const [retrySuccessMsg, setRetrySuccessMsg] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  // Failure Diagnostics Modal
  const [inspectedEvent, setInspectedEvent] = useState<SyncEventItem | null>(null);

  const fetchSyncStatus = useCallback(async () => {
    if (!organizationId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = new URL('/api/sync/status', window.location.origin);
      url.searchParams.set('organizationId', organizationId);

      const res = await fetch(url.toString());
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError({
          status: res.status,
          message: json.error || `Server returned HTTP ${res.status}`,
        });
        return;
      }

      const json = await res.json();
      if (json.data) {
        setCounts(
          json.data.counts || {
            pending: 0,
            processing: 0,
            synced: 0,
            failed: 0,
            dead_letter: 0,
          }
        );
        setEvents(json.data.recentEvents || []);
      }
    } catch (err: any) {
      setError({
        status: 0,
        message: err.message || 'Failed to fetch sync engine status.',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  // Single event retry
  const handleRetrySingle = async (eventId: string) => {
    setRetryingEventId(eventId);
    setRetryError(null);
    setRetrySuccessMsg(null);

    try {
      const res = await fetch('/api/sync/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || `Failed to retry sync event (HTTP ${res.status})`);
      }

      setRetrySuccessMsg(`Sync event ${eventId.slice(0, 8)} re-queued successfully!`);
      setTimeout(() => setRetrySuccessMsg(null), 4000);
      await fetchSyncStatus();
    } catch (err: any) {
      setRetryError(err.message || 'Error retrying sync event.');
    } finally {
      setRetryingEventId(null);
    }
  };

  // Bulk retry all failed / dead letter events
  const handleRetryBulk = async () => {
    if (!organizationId) return;

    setIsRetryingBulk(true);
    setRetryError(null);
    setRetrySuccessMsg(null);

    try {
      const res = await fetch('/api/sync/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || `Failed to bulk retry sync events (HTTP ${res.status})`);
      }

      const retriedCount = json.data?.retriedCount ?? 0;
      setRetrySuccessMsg(`Re-queued ${retriedCount} failed sync event(s) for immediate processing!`);
      setTimeout(() => setRetrySuccessMsg(null), 5000);
      await fetchSyncStatus();
    } catch (err: any) {
      setRetryError(err.message || 'Error executing bulk retry.');
    } finally {
      setIsRetryingBulk(false);
    }
  };

  // Filtered Events
  const filteredEvents = events.filter((e) => {
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    const matchesSearch =
      e.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.applicationId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.lastError || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.provider.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const totalFailed = counts.failed + counts.dead_letter;

  if (!organizationId) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <RotateCw size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px' }}>
          Select an Organization
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Please select an organization in the header switcher to view sync telemetry.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Level KPI Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Synced */}
        <div className="card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Synced</span>
            <CheckCircle2 size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981' }}>{counts.synced}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Delivered to providers</div>
        </div>

        {/* Pending */}
        <div className="card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Pending</span>
            <Clock size={18} color="#818cf8" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#818cf8' }}>{counts.pending}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Enqueued in line</div>
        </div>

        {/* Processing */}
        <div className="card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Processing</span>
            <RotateCw size={18} color="#38bdf8" className={counts.processing > 0 ? 'animate-spin' : ''} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#38bdf8' }}>{counts.processing}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>In active worker lease</div>
        </div>

        {/* Failed */}
        <div className="card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Failed (Retryable)</span>
            <AlertTriangle size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>{counts.failed}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Awaiting exponential backoff</div>
        </div>

        {/* Dead Letter */}
        <div className="card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Dead Letter</span>
            <Skull size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ef4444' }}>{counts.dead_letter}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Max retries exhausted</div>
        </div>
      </div>

      {/* Main Events Card */}
      <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Controls Bar */}
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
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                placeholder="Search by event ID, app ID, error message, or provider..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="all">All Event States</option>
              <option value="failed">Failed</option>
              <option value="dead_letter">Dead Letter</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="synced">Synced</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={fetchSyncStatus}
              disabled={loading}
              className="btn btn-secondary"
              style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            {totalFailed > 0 && (
              <button
                onClick={handleRetryBulk}
                disabled={isRetryingBulk}
                className="btn btn-primary"
                style={{
                  padding: '8px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                  border: 'none',
                }}
              >
                <RotateCcw size={15} className={isRetryingBulk ? 'animate-spin' : ''} />
                <span>{isRetryingBulk ? 'Retrying Failed…' : `Retry All Failed (${totalFailed})`}</span>
              </button>
            )}
          </div>
        </div>

        {/* Success Banner */}
        {retrySuccessMsg && (
          <div
            style={{
              padding: '10px 14px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              color: '#34d399',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {retrySuccessMsg}
          </div>
        )}

        {/* Retry Error Banner */}
        {retryError && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: '#ef4444',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {retryError}
          </div>
        )}

        {/* Main Fetch Error Banner */}
        {error && (
          <div
            role="alert"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              padding: '12px 16px',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            <span>{error.message}</span>
            <button
              onClick={fetchSyncStatus}
              className="btn btn-secondary"
              style={{ padding: '4px 12px', fontSize: '0.75rem' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Events Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Event ID</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Provider</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Attempts</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Last Error / Diagnostics</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Updated</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && events.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading sync events telemetry…
                  </td>
                </tr>
              ) : filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No sync events found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredEvents.map((evt) => {
                  const isRetryable = evt.status === 'failed' || evt.status === 'dead_letter';

                  return (
                    <tr
                      key={evt.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Event ID */}
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        <span title={evt.id}>{evt.id.slice(0, 8)}…</span>
                      </td>

                      {/* Provider */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: 'rgba(255, 255, 255, 0.06)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            textTransform: 'capitalize',
                          }}
                        >
                          <Layers size={12} /> {evt.provider.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textTransform: 'capitalize',
                            background:
                              evt.status === 'synced'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : evt.status === 'dead_letter'
                                ? 'rgba(239, 68, 68, 0.15)'
                                : evt.status === 'failed'
                                ? 'rgba(245, 158, 11, 0.15)'
                                : evt.status === 'processing'
                                ? 'rgba(56, 189, 248, 0.15)'
                                : 'rgba(99, 102, 241, 0.15)',
                            color:
                              evt.status === 'synced'
                                ? '#34d399'
                                : evt.status === 'dead_letter'
                                ? '#f87171'
                                : evt.status === 'failed'
                                ? '#fbbf24'
                                : evt.status === 'processing'
                                ? '#38bdf8'
                                : '#818cf8',
                          }}
                        >
                          {evt.status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Attempts */}
                      <td style={{ padding: '12px 16px', fontSize: '0.8rem' }}>
                        <span
                          style={{
                            fontWeight: 600,
                            color: evt.attemptCount >= evt.maxAttempts ? '#ef4444' : 'var(--text-primary)',
                          }}
                        >
                          {evt.attemptCount}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}> / {evt.maxAttempts}</span>
                      </td>

                      {/* Error Snippet */}
                      <td style={{ padding: '12px 16px', maxWidth: '300px' }}>
                        {evt.lastError ? (
                          <div
                            style={{
                              color: '#f87171',
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={evt.lastError}
                          >
                            {evt.lastError}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>

                      {/* Updated Date */}
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(evt.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            onClick={() => setInspectedEvent(evt)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            title="Inspect Diagnostics & Payload"
                          >
                            <Eye size={13} />
                            <span>Inspect</span>
                          </button>

                          {isRetryable && (
                            <button
                              onClick={() => handleRetrySingle(evt.id)}
                              disabled={retryingEventId === evt.id}
                              className="btn btn-secondary"
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.75rem',
                                color: '#f59e0b',
                                borderColor: 'rgba(245, 158, 11, 0.3)',
                              }}
                              title="Re-enqueue Event"
                            >
                              <RotateCcw
                                size={13}
                                className={retryingEventId === evt.id ? 'animate-spin' : ''}
                              />
                              <span>Retry</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Diagnostics / Payload Modal */}
      {inspectedEvent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '24px',
          }}
          onClick={() => setInspectedEvent(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: '680px',
              width: '100%',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(99, 102, 241, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#818cf8',
                  }}
                >
                  <FileCode size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Sync Event Diagnostics</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    ID: <code style={{ color: 'var(--text-primary)' }}>{inspectedEvent.id}</code>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectedEvent(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Error Message Box */}
            {inspectedEvent.lastError && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>
                  Execution Error
                </span>
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    color: '#f87171',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {inspectedEvent.lastError}
                </div>
              </div>
            )}

            {/* Metadata Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                background: 'var(--bg-primary)',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '0.8rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Application ID:</span>
                <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                  {inspectedEvent.applicationId}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Provider:</span>
                <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                  {inspectedEvent.provider}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Current Status:</span>
                <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                  {inspectedEvent.status}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Attempts:</span>
                <div style={{ fontWeight: 600 }}>
                  {inspectedEvent.attemptCount} / {inspectedEvent.maxAttempts}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Created At:</span>
                <div>{new Date(inspectedEvent.createdAt).toLocaleString()}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Last Updated:</span>
                <div>{new Date(inspectedEvent.updatedAt).toLocaleString()}</div>
              </div>
            </div>

            {/* Payload JSON */}
            {inspectedEvent.payload && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Sync Payload Data
                </span>
                <pre
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    overflowX: 'auto',
                    maxHeight: '220px',
                    color: 'var(--text-primary)',
                  }}
                >
                  {JSON.stringify(inspectedEvent.payload, null, 2)}
                </pre>
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={() => setInspectedEvent(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 14px' }}
              >
                Close
              </button>
              {(inspectedEvent.status === 'failed' || inspectedEvent.status === 'dead_letter') && (
                <button
                  onClick={() => {
                    handleRetrySingle(inspectedEvent.id);
                    setInspectedEvent(null);
                  }}
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <RotateCcw size={14} />
                  <span>Retry Event Now</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
