'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, Loader2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

type SyncStatus = 'polling' | 'synced' | 'pending' | 'failed' | 'no_integration' | 'dismissed';

interface SyncStatusToastProps {
  applicationId: string;
  onDismiss: () => void;
}

/**
 * A floating toast that polls the sync status API after an application is saved.
 * Shows the progression: polling → synced/pending/failed.
 */
export const SyncStatusToast: React.FC<SyncStatusToastProps> = ({
  applicationId,
  onDismiss,
}) => {
  const [status, setStatus] = useState<SyncStatus>('polling');
  const [message, setMessage] = useState('Checking Google Sheets sync…');
  const pollCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const pollSyncStatus = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const res = await fetch(`/api/sync/status`);
      if (!res.ok) {
        // If sync status endpoint fails, user might not have integration
        setStatus('no_integration');
        setMessage('Google Sheets not configured');
        return;
      }

      const json = await res.json();
      const events = json.data?.recentEvents || [];

      // Find sync event for this specific application
      const matchingEvent = events.find(
        (e: any) => e.applicationId === applicationId
      );

      if (!matchingEvent) {
        // No sync event yet — either no integration or trigger hasn't fired
        if (pollCountRef.current >= 3) {
          setStatus('no_integration');
          setMessage('Google Sheets sync not configured');
          return;
        }
        // Keep polling — event might not have been created yet
        pollCountRef.current++;
        timerRef.current = setTimeout(pollSyncStatus, 2000);
        return;
      }

      switch (matchingEvent.status) {
        case 'synced':
          setStatus('synced');
          setMessage('Synced to Google Sheets');
          break;
        case 'pending':
        case 'processing':
          if (pollCountRef.current >= 15) {
            // After 30s of polling, show pending state
            setStatus('pending');
            setMessage('Sync queued — will process shortly');
            return;
          }
          pollCountRef.current++;
          setMessage('Syncing to Google Sheets…');
          timerRef.current = setTimeout(pollSyncStatus, 2000);
          break;
        case 'failed':
          setStatus('failed');
          setMessage('Sync failed — will retry automatically');
          break;
        case 'dead_letter':
          setStatus('failed');
          setMessage('Sync failed after retries');
          break;
        default:
          pollCountRef.current++;
          if (pollCountRef.current < 15) {
            timerRef.current = setTimeout(pollSyncStatus, 2000);
          }
      }
    } catch {
      if (pollCountRef.current >= 3) {
        setStatus('no_integration');
        setMessage('Unable to check sync status');
        return;
      }
      pollCountRef.current++;
      timerRef.current = setTimeout(pollSyncStatus, 3000);
    }
  }, [applicationId]);

  useEffect(() => {
    mountedRef.current = true;
    // Start polling after a short delay to let the trigger fire
    timerRef.current = setTimeout(pollSyncStatus, 1500);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [pollSyncStatus]);

  // Auto-dismiss after showing final status
  useEffect(() => {
    if (status === 'synced' || status === 'no_integration') {
      const dismissTimer = setTimeout(onDismiss, 4000);
      return () => clearTimeout(dismissTimer);
    }
    if (status === 'pending' || status === 'failed') {
      const dismissTimer = setTimeout(onDismiss, 6000);
      return () => clearTimeout(dismissTimer);
    }
  }, [status, onDismiss]);

  if (status === 'dismissed') return null;

  const getIcon = () => {
    switch (status) {
      case 'polling':
        return <Loader2 size={16} className="animate-spin" style={{ color: '#60a5fa' }} />;
      case 'synced':
        return <CheckCircle2 size={16} style={{ color: '#34d399' }} />;
      case 'pending':
        return <Info size={16} style={{ color: '#fbbf24' }} />;
      case 'failed':
        return <AlertTriangle size={16} style={{ color: '#f87171' }} />;
      case 'no_integration':
        return <Info size={16} style={{ color: 'var(--text-muted)' }} />;
      default:
        return null;
    }
  };

  const getBorderColor = () => {
    switch (status) {
      case 'synced': return 'rgba(52, 211, 153, 0.3)';
      case 'failed': return 'rgba(248, 113, 113, 0.3)';
      case 'pending': return 'rgba(251, 191, 36, 0.3)';
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
        alignItems: 'center',
        gap: '10px',
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--bg-surface-elevated)',
        border: `1px solid ${getBorderColor()}`,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        fontSize: '0.8125rem',
        color: 'var(--text-primary)',
        backdropFilter: 'blur(12px)',
        animation: 'slideInUp 0.3s ease-out',
        maxWidth: '340px',
      }}
    >
      {/* Google Sheets icon */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#0F9D58"/>
        <path d="M14 2V8H20" fill="#87CEAC"/>
        <path d="M8 13H16V14H8V13ZM8 15H16V16H8V15ZM8 17H13V18H8V17ZM8 11H16V12H8V11Z" fill="white"/>
      </svg>

      {getIcon()}

      <span style={{ flex: 1, lineHeight: 1.4 }}>{message}</span>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss sync notification"
        style={{
          background: 'none',
          border: 'none',
          padding: '2px',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <X size={14} />
      </button>

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
