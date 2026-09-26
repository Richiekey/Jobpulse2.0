'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, Loader2, AlertTriangle, ExternalLink, RefreshCw, X, Database } from 'lucide-react';

type SyncStatus = 'polling' | 'synced' | 'pending' | 'failed' | 'no_integration' | 'dismissed';

interface SyncStatusToastProps {
  applicationId: string;
  onDismiss: () => void;
}

/**
 * A floating toast that monitors application state across:
 * 1. Database persistence (Saved to tracker)
 * 2. Google Sheets synchronization (Real-time sync state)
 */
export const SyncStatusToast: React.FC<SyncStatusToastProps> = ({
  applicationId,
  onDismiss,
}) => {
  const [status, setStatus] = useState<SyncStatus>('polling');
  const [message, setMessage] = useState('Checking sync status…');
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [spreadsheetName, setSpreadsheetName] = useState<string>('Google Sheet');
  const [sheetName, setSheetName] = useState<string>('Sheet1');
  const [eventId, setEventId] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const pollCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const pollSyncStatus = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const res = await fetch(`/api/sync/status`);
      if (!res.ok) {
        setStatus('no_integration');
        setMessage('Google Sheets not configured');
        return;
      }

      const json = await res.json();
      const events = json.data?.recentEvents || [];
      const integration = json.data?.integration;

      if (integration?.spreadsheetId) {
        setSpreadsheetId(integration.spreadsheetId);
        if (integration.spreadsheetName) setSpreadsheetName(integration.spreadsheetName);
        if (integration.sheetName) setSheetName(integration.sheetName);
      }

      // Find sync event for this specific application
      const matchingEvent = events.find(
        (e: any) => e.applicationId === applicationId
      );

      if (!matchingEvent) {
        if (pollCountRef.current >= 4) {
          if (!integration?.isActive) {
            setStatus('no_integration');
            setMessage('Google Sheets not connected');
          } else {
            setStatus('pending');
            setMessage('Sync queued in background');
          }
          return;
        }
        pollCountRef.current++;
        timerRef.current = setTimeout(pollSyncStatus, 1500);
        return;
      }

      if (matchingEvent.id) setEventId(matchingEvent.id);

      switch (matchingEvent.status) {
        case 'synced':
          setStatus('synced');
          setMessage('Added to Google Sheets');
          break;
        case 'pending':
          setStatus('pending');
          setMessage('Queued for Google Sheets');
          pollCountRef.current++;
          if (pollCountRef.current < 20) {
            timerRef.current = setTimeout(pollSyncStatus, 2000);
          }
          break;
        case 'processing':
          setStatus('polling'); // Keeps the spinner active
          setMessage('Writing to Google Sheets…');
          pollCountRef.current++;
          timerRef.current = setTimeout(pollSyncStatus, 1500);
          break;
        case 'failed':
        case 'dead_letter':
          setStatus('failed');
          setMessage(matchingEvent.lastError ? `Google Sheets sync failed: ${matchingEvent.lastError.substring(0, 60)}…` : 'Google Sheets sync failed');
          break;
        default:
          pollCountRef.current++;
          if (pollCountRef.current < 12) {
            timerRef.current = setTimeout(pollSyncStatus, 1500);
          }
      }
    } catch {
      if (pollCountRef.current >= 3) {
        setStatus('no_integration');
        setMessage('Unable to check sync status');
        return;
      }
      pollCountRef.current++;
      timerRef.current = setTimeout(pollSyncStatus, 2000);
    }
  }, [applicationId]);

  useEffect(() => {
    mountedRef.current = true;
    timerRef.current = setTimeout(pollSyncStatus, 1000);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [pollSyncStatus]);

  // Handle manual retry
  const handleRetry = async () => {
    if (isRetrying || !eventId) return;
    setIsRetrying(true);
    setStatus('polling');
    setMessage('Retrying sync…');
    pollCountRef.current = 0;

    try {
      const res = await fetch('/api/sync/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      if (res.ok) {
        // Also invoke sync processor immediately
        fetch('/api/sync/process', { method: 'POST' }).catch(() => {});
        pollSyncStatus();
      } else {
        setStatus('failed');
        setMessage('Retry request failed');
      }
    } catch {
      setStatus('failed');
      setMessage('Retry request failed');
    } finally {
      setIsRetrying(false);
    }
  };

  // Auto-dismiss after showing success
  useEffect(() => {
    if (status === 'synced') {
      const dismissTimer = setTimeout(onDismiss, 6000);
      return () => clearTimeout(dismissTimer);
    }
    if (status === 'no_integration') {
      const dismissTimer = setTimeout(onDismiss, 5000);
      return () => clearTimeout(dismissTimer);
    }
  }, [status, onDismiss]);

  if (status === 'dismissed') return null;

  const sheetUrl = spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : null;

  const getBorderColor = () => {
    switch (status) {
      case 'synced': return 'rgba(52, 211, 153, 0.4)';
      case 'failed': return 'rgba(248, 113, 113, 0.4)';
      case 'pending': return 'rgba(251, 191, 36, 0.4)';
      default: return 'var(--border-subtle)';
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '14px 18px',
        borderRadius: 'var(--radius-lg, 12px)',
        backgroundColor: 'var(--bg-surface-elevated, #181b20)',
        border: `1px solid ${getBorderColor()}`,
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
        fontSize: '0.8125rem',
        color: 'var(--text-primary, #f3f4f6)',
        backdropFilter: 'blur(16px)',
        animation: 'slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        minWidth: '320px',
        maxWidth: '380px',
      }}
    >
      {/* Header: Database persistence status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={14} style={{ color: '#34d399', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>Saved to Application Tracker</span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          style={{
            background: 'none',
            border: 'none',
            padding: '2px',
            cursor: 'pointer',
            color: 'var(--text-muted, #9ca3af)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Google Sheets Sync Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          {/* Google Sheets Icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
            <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#0F9D58"/>
            <path d="M14 2V8H20" fill="#87CEAC"/>
            <path d="M8 13H16V14H8V13ZM8 15H16V16H8V15ZM8 17H13V18H8V17ZM8 11H16V12H8V11Z" fill="white"/>
          </svg>

          {/* Sync Status Text */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {status === 'polling' && <Loader2 size={13} className="animate-spin" style={{ color: '#60a5fa', flexShrink: 0 }} />}
              {status === 'synced' && <CheckCircle2 size={13} style={{ color: '#34d399', flexShrink: 0 }} />}
              {status === 'pending' && <Loader2 size={13} className="animate-spin" style={{ color: '#fbbf24', flexShrink: 0 }} />}
              {status === 'failed' && <AlertTriangle size={13} style={{ color: '#f87171', flexShrink: 0 }} />}
              <span style={{
                fontSize: '0.75rem',
                color: status === 'synced' ? '#34d399' : status === 'failed' ? '#f87171' : 'var(--text-secondary, #9ca3af)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {message}
              </span>
            </div>
            {status === 'synced' && (
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted, #6b7280)' }}>
                {spreadsheetName} ({sheetName})
              </span>
            )}
          </div>
        </div>

        {/* Action button: Open Sheet or Retry */}
        {status === 'synced' && sheetUrl && (
          <a
            href={sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.6875rem',
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm, 6px)',
              backgroundColor: 'rgba(52, 211, 153, 0.15)',
              color: '#34d399',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <span>Open Sheet</span>
            <ExternalLink size={10} />
          </a>
        )}

        {status === 'failed' && eventId && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.6875rem',
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm, 6px)',
              backgroundColor: 'rgba(248, 113, 113, 0.15)',
              color: '#f87171',
              border: '1px solid rgba(248, 113, 113, 0.3)',
              cursor: isRetrying ? 'default' : 'pointer',
              flexShrink: 0,
            }}
          >
            <RefreshCw size={10} className={isRetrying ? 'animate-spin' : ''} />
            <span>{isRetrying ? 'Retrying…' : 'Retry'}</span>
          </button>
        )}
      </div>

      <style>{`
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
