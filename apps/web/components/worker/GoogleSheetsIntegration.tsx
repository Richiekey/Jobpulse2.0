'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Unplug,
  Loader2,
  FolderOpen,
  User,
} from 'lucide-react';

interface SpreadsheetItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface DriveFolderItem {
  id: string;
  name: string;
  modifiedTime?: string;
}

interface IntegrationConfig {
  spreadsheetId?: string;
  spreadsheetName?: string;
  sheetName?: string;
  autoHeaderInitialized?: boolean;
  resumeFolderId?: string | null;
  resumeFolderName?: string | null;
  applicantName?: string | null;
}

interface IntegrationRecord {
  id: string;
  provider: string;
  is_active: boolean;
  config?: IntegrationConfig;
  created_at?: string;
}

/**
 * User-level Google Sheets integration component.
 * Includes Resume Drive Folder selector and Applicant Name field for resume discovery.
 * Does NOT pass organizationId — uses the authenticated user's own integration.
 */
export const GoogleSheetsIntegration: React.FC = () => {
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

  // Resume discovery state
  const [driveFolders, setDriveFolders] = useState<DriveFolderItem[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [selectedFolderName, setSelectedFolderName] = useState('');
  const [applicantName, setApplicantName] = useState('');

  // Check integration status (user-level, no organizationId)
  const checkStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/integrations/google/status');
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
        if (config?.resumeFolderId) {
          setSelectedFolderId(config.resumeFolderId);
        }
        if (config?.resumeFolderName) {
          setSelectedFolderName(config.resumeFolderName);
        }
        if (config?.applicantName) {
          setApplicantName(config.applicantName);
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
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Load spreadsheets when connected (user-level)
  const fetchSpreadsheets = useCallback(async () => {
    setLoadingSheets(true);
    setError(null);

    try {
      const res = await fetch('/api/integrations/google/sheets');
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
  }, []);

  // Load Drive folders when connected
  const fetchDriveFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const res = await fetch('/api/integrations/google/folders');
      const json = await res.json();

      if (res.ok && json.data?.folders) {
        setDriveFolders(json.data.folders);
      }
    } catch {
      // Non-fatal: folder loading is optional
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  useEffect(() => {
    if (connected) {
      fetchSpreadsheets();
      fetchDriveFolders();
    }
  }, [connected, fetchSpreadsheets, fetchDriveFolders]);

  // Connect Google (user-level, redirect back to /worker/profile)
  const handleConnect = () => {
    const redirectTarget = encodeURIComponent('/worker/profile');
    window.location.href = `/api/integrations/google/connect?redirectTarget=${redirectTarget}`;
  };

  // Disconnect Google (user-level)
  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError(null);

    try {
      const res = await fetch('/api/integrations/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google_sheets' }),
      });

      if (res.ok) {
        setConnected(false);
        setIntegration(null);
        setSpreadsheets([]);
        setDriveFolders([]);
        setSelectedSpreadsheetId('');
        setSelectedSheetName('Sheet1');
        setSelectedFolderId('');
        setSelectedFolderName('');
        setApplicantName('');
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

  // Save all configuration at once
  const saveConfiguration = async (overrides: Partial<{
    spreadsheetId: string;
    sheetName: string;
    resumeFolderId: string | null;
    resumeFolderName: string | null;
    applicantName: string | null;
  }> = {}) => {
    const ssId = overrides.spreadsheetId ?? selectedSpreadsheetId;
    if (!ssId) return;

    const sheet = spreadsheets.find((s) => s.id === ssId);
    setSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const res = await fetch('/api/integrations/google/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: ssId,
          spreadsheetName: sheet?.name || 'Untitled',
          sheetName: overrides.sheetName ?? selectedSheetName,
          initializeHeaders: true,
          resumeFolderId: overrides.resumeFolderId !== undefined
            ? overrides.resumeFolderId
            : (selectedFolderId || null),
          resumeFolderName: overrides.resumeFolderName !== undefined
            ? overrides.resumeFolderName
            : (selectedFolderName || null),
          applicantName: overrides.applicantName !== undefined
            ? overrides.applicantName
            : (applicantName || null),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        await checkStatus();
      } else {
        setError(json.error || 'Failed to save configuration.');
      }
    } catch {
      setError('Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  // Select spreadsheet
  const handleSelectSpreadsheet = async (spreadsheetId: string) => {
    setSelectedSpreadsheetId(spreadsheetId);
    if (!spreadsheetId) return;
    await saveConfiguration({ spreadsheetId });
  };

  // Update sheet name
  const handleUpdateSheetName = async (newName: string) => {
    setSelectedSheetName(newName);
    if (!selectedSpreadsheetId) return;
    await saveConfiguration({ sheetName: newName });
  };

  // Select resume folder
  const handleSelectFolder = async (folderId: string) => {
    setSelectedFolderId(folderId);
    const folder = driveFolders.find((f) => f.id === folderId);
    const folderName = folder?.name || '';
    setSelectedFolderName(folderName);
    if (!selectedSpreadsheetId) return;
    await saveConfiguration({
      resumeFolderId: folderId || null,
      resumeFolderName: folderName || null,
    });
  };

  // Update applicant name
  const handleUpdateApplicantName = async (name: string) => {
    setApplicantName(name);
    if (!selectedSpreadsheetId) return;
    await saveConfiguration({ applicantName: name || null });
  };

  // Test connection
  const handleTestConnection = async () => {
    if (!selectedSpreadsheetId) return;

    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const listRes = await fetch('/api/integrations/google/sheets');
      if (!listRes.ok) {
        setTestResult('error');
        setError('Connection test failed: unable to access Google Drive. Credentials may need to be refreshed.');
        return;
      }

      const sheet = spreadsheets.find((s) => s.id === selectedSpreadsheetId);
      const writeRes = await fetch('/api/integrations/google/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: selectedSpreadsheetId,
          spreadsheetName: sheet?.name || 'Untitled',
          sheetName: selectedSheetName,
          initializeHeaders: true,
        }),
      });

      if (writeRes.ok) {
        setTestResult('success');
      } else {
        setTestResult('error');
        const json = await writeRes.json().catch(() => ({}));
        setError(json.error || 'Write test failed. Check sheet permissions.');
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
          <span>Configuration saved!</span>
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

        {/* ──── Resume Discovery Section ──── */}
        {selectedSpreadsheetId && (
          <div
            style={{
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: '16px',
              marginTop: '4px',
            }}
          >
            <h3 style={{
              fontSize: '0.9375rem',
              fontWeight: 700,
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--text-primary)',
            }}>
              <FolderOpen size={18} />
              <span>Resume Auto-Discovery</span>
              <span style={{
                fontSize: '0.6875rem',
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(52, 168, 83, 0.12)',
                color: '#34a853',
              }}>
                Optional
              </span>
            </h3>

            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.5 }}>
              Configure a Google Drive folder containing your generated resumes. When you mark an application as applied,
              JobPulse will automatically find the matching resume and add its link to your Google Sheet.
            </p>

            {/* Resume Folder Selector */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Resume Drive Folder
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={selectedFolderId}
                  onChange={(e) => handleSelectFolder(e.target.value)}
                  disabled={loadingFolders || saving}
                  className="input"
                  style={{ flex: 1 }}
                >
                  <option value="">
                    {loadingFolders ? 'Loading folders…' : 'Select a Drive folder…'}
                  </option>
                  {driveFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={fetchDriveFolders}
                  disabled={loadingFolders}
                  className="btn btn-secondary"
                  title="Refresh folder list"
                  style={{ padding: '0 10px', display: 'flex', alignItems: 'center' }}
                >
                  <RefreshCw size={14} className={loadingFolders ? 'animate-spin' : ''} />
                </button>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                The Google Drive folder where your browser extension saves generated resumes.
              </span>
            </div>

            {/* Applicant Name */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                <User size={14} />
                <span>Your Name (for resume matching)</span>
              </label>
              <input
                type="text"
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                onBlur={(e) => handleUpdateApplicantName(e.target.value)}
                placeholder="e.g. Matthew Blackmon"
                className="input"
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Used to match resume filenames like &quot;Your Name - Company.pdf&quot;. Cover letters are automatically excluded.
              </span>
            </div>
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
