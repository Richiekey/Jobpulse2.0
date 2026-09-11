'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Unplug,
  Loader2,
} from 'lucide-react';

interface SpreadsheetItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface IntegrationConfig {
  spreadsheetId?: string;
  spreadsheetName?: string;
  sheetName?: string;
  autoHeaderInitialized?: boolean;
}

interface IntegrationRecord {
  id: string;
  provider: string;
  is_active: boolean;
  config?: IntegrationConfig;
  created_at?: string;
}

interface GoogleSheetsIntegrationProps {
  organizationId: string;
}

export const GoogleSheetsIntegration: React.FC<GoogleSheetsIntegrationProps> = ({
  organizationId,
}) => {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [integration, setIntegration] = useState<IntegrationRecord | null>(null);
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetItem[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState('');
  const [selectedSheetName, setSelectedSheetName] = useState('Sheet1');
  const [autoSync, setAutoSync] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  // Check integration status
  const checkStatus = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/integrations/google/status?organizationId=${organizationId}`
      );
      const json = await res.json();

      if (res.ok && json.data) {
        setConnected(json.data.connected);
        setIntegration(json.data.integration || null);

        const config = json.data.integration?.config as IntegrationConfig | undefined;
        if (config?.spreadsheetId) {
          setSelectedSpreadsheetId(config.spreadsheetId);
        }
        if (config?.sheetName) {
          setSelectedSheetName(config.sheetName);
        }
      } else {
        setConnected(false);
        setIntegration(null);
      }
    } catch {
      setConnected(false);
      setIntegration(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Load spreadsheets when connected
  const fetchSpreadsheets = useCallback(async () => {
    if (!organizationId) return;
    setLoadingSheets(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/integrations/google/sheets?organizationId=${organizationId}`
      );
      const json = await res.json();

      if (res.ok && json.data?.spreadsheets) {
        setSpreadsheets(json.data.spreadsheets);
      } else {
        setError(json.error || 'Failed to load spreadsheets.');
      }
    } catch {
      setError('Failed to load spreadsheets.');
    } finally {
      setLoadingSheets(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (connected) {
      fetchSpreadsheets();
    }
  }, [connected, fetchSpreadsheets]);

  // Connect Google
  const handleConnect = () => {
    const redirectTarget = encodeURIComponent('/worker/profile');
    window.location.href = `/api/integrations/google/connect?organizationId=${organizationId}&redirectTarget=${redirectTarget}`;
  };

  // Disconnect Google
  const handleDisconnect = async () => {
    if (!organizationId) return;
    setDisconnecting(true);
    setError(null);

    try {
      const res = await fetch('/api/integrations/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google_sheets',
          organizationId,
        }),
      });

      if (res.ok) {
        setConnected(false);
        setIntegration(null);
        setSpreadsheets([]);
        setSelectedSpreadsheetId('');
        setSelectedSheetName('Sheet1');
        setTestResult(null);
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Failed to disconnect.');
      }
    } catch {
      setError('Failed to disconnect Google account.');
    } finally {
      setDisconnecting(false);
    }
  };

  // Select spreadsheet
  const handleSelectSpreadsheet = async (spreadsheetId: string) => {
    setSelectedSpreadsheetId(spreadsheetId);
    if (!spreadsheetId || !organizationId) return;

    const sheet = spreadsheets.find((s) => s.id === spreadsheetId);
    setSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const res = await fetch('/api/integrations/google/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId,
          spreadsheetName: sheet?.name || 'Untitled',
          sheetName: selectedSheetName,
          organizationId,
          initializeHeaders: true,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        // Refresh status to get updated config
        await checkStatus();
      } else {
        setError(json.error || 'Failed to select spreadsheet.');
      }
    } catch {
      setError('Failed to save spreadsheet selection.');
    } finally {
      setSaving(false);
    }
  };

  // Update sheet name
  const handleUpdateSheetName = async (newName: string) => {
    setSelectedSheetName(newName);
    if (!selectedSpreadsheetId || !organizationId) return;

    const sheet = spreadsheets.find((s) => s.id === selectedSpreadsheetId);
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/integrations/google/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: selectedSpreadsheetId,
          spreadsheetName: sheet?.name || 'Untitled',
          sheetName: newName,
          organizationId,
          initializeHeaders: true,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Failed to update sheet name.');
      }
    } catch {
      setError('Failed to update sheet name.');
    } finally {
      setSaving(false);
    }
  };

  // Test connection
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch(
        `/api/integrations/google/sheets?organizationId=${organizationId}`
      );
      if (res.ok) {
        setTestResult('success');
      } else {
        setTestResult('error');
        setError('Connection test failed. Google credentials may need to be refreshed.');
      }
    } catch {
      setTestResult('error');
      setError('Connection test failed.');
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  // Google Sheets SVG icon
  const SheetsIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#0F9D58"/>
      <path d="M14 2V8H20" fill="#87CEAC"/>
      <path d="M8 13H16V14H8V13ZM8 15H16V16H8V15ZM8 17H13V18H8V17ZM8 11H16V12H8V11Z" fill="white"/>
    </svg>
  );

  if (loading) {
    return (
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)' }}>
          <Loader2 size={18} className="animate-spin" />
          <span style={{ fontSize: '0.875rem' }}>Loading Google Sheets integration…</span>
        </div>
      </div>
    );
  }

  // Disconnected state
  if (!connected) {
    return (
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '24px',
        }}
      >
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SheetsIcon />
          <span>Google Sheets</span>
        </h2>

        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
          Connect your Google account to automatically sync your JobPulse applications directly to a Google Sheet.
        </p>

        {error && (
          <div style={{ fontSize: '0.8125rem', color: 'var(--danger-text)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleConnect}
          className="btn btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            fontSize: '0.875rem',
          }}
        >
          <SheetsIcon />
          <span>Connect Google</span>
        </button>
      </div>
    );
  }

  // Connected state
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SheetsIcon />
          <span>Google Sheets</span>
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: '#34a853' }}>
          <CheckCircle2 size={16} />
          <span style={{ fontWeight: 600 }}>Connected</span>
        </div>
      </div>

      {error && (
        <div style={{
          fontSize: '0.8125rem',
          color: 'var(--danger-text)',
          marginBottom: '12px',
          padding: '8px 12px',
          backgroundColor: 'var(--danger-surface)',
          border: '1px solid var(--danger-border)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {saveSuccess && (
        <div style={{
          fontSize: '0.8125rem',
          color: 'var(--success-text)',
          marginBottom: '12px',
          padding: '8px 12px',
          backgroundColor: 'var(--success-surface)',
          border: '1px solid var(--success-border)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <CheckCircle2 size={14} />
          <span>Spreadsheet configuration saved!</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Spreadsheet Selector */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Spreadsheet
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={selectedSpreadsheetId}
              onChange={(e) => handleSelectSpreadsheet(e.target.value)}
              disabled={loadingSheets || saving}
              className="input"
              style={{ flex: 1 }}
            >
              <option value="">
                {loadingSheets ? 'Loading spreadsheets…' : 'Select a spreadsheet…'}
              </option>
              {spreadsheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={fetchSpreadsheets}
              disabled={loadingSheets}
              className="btn btn-secondary"
              title="Refresh spreadsheet list"
              style={{ padding: '0 10px', display: 'flex', alignItems: 'center' }}
            >
              <RefreshCw size={14} className={loadingSheets ? 'animate-spin' : ''} />
            </button>
          </div>
          {selectedSpreadsheetId && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Applications will be synced to this spreadsheet.
            </span>
          )}
        </div>

        {/* Sheet/Tab Name */}
        {selectedSpreadsheetId && (
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Sheet / Tab Name
            </label>
            <input
              type="text"
              value={selectedSheetName}
              onChange={(e) => setSelectedSheetName(e.target.value)}
              onBlur={(e) => handleUpdateSheetName(e.target.value)}
              placeholder="Sheet1"
              className="input"
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              The tab within the spreadsheet where application rows will be written.
            </span>
          </div>
        )}

        {/* Auto-sync Toggle */}
        {selectedSpreadsheetId && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8125rem' }}>
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              style={{ accentColor: '#34a853', width: '16px', height: '16px' }}
            />
            <span>Automatically sync new applications</span>
          </label>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          {selectedSpreadsheetId && (
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem' }}
            >
              {testing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : testResult === 'success' ? (
                <CheckCircle2 size={14} style={{ color: '#34a853' }} />
              ) : testResult === 'error' ? (
                <AlertCircle size={14} style={{ color: 'var(--danger-text)' }} />
              ) : (
                <ExternalLink size={14} />
              )}
              <span>{testing ? 'Testing…' : testResult === 'success' ? 'Connection OK' : 'Test Connection'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8125rem',
              color: 'var(--danger-text)',
              borderColor: 'var(--danger-border)',
            }}
          >
            {disconnecting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Unplug size={14} />
            )}
            <span>{disconnecting ? 'Disconnecting…' : 'Disconnect Google'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
