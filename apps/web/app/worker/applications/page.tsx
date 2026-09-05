'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckSquare,
  UploadCloud,
  FileCheck,
  RefreshCw,
  Search,
  Building2,
  Calendar,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  RotateCw,
  Clock,
  X,
  Eye,
  Check,
} from 'lucide-react';
import { useWorker } from '@/components/worker/WorkerContext';
import { createClient } from '@/lib/supabase/client';

type ApplicationStatusTab = 'all' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

interface ApplicationItem {
  id: string;
  user_id: string;
  job_id: string | null;
  organization_id: string | null;
  company_name: string;
  job_title: string;
  status: 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn' | 'archived';
  verification_status: 'unverified' | 'pending' | 'verified' | 'rejected';
  sync_status: 'pending' | 'processing' | 'synced' | 'failed' | 'dead_letter';
  notes: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function WorkerApplicationsPage() {
  const { activeOrgId, activeOrg } = useWorker();

  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ApplicationStatusTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Proof Upload Modal state
  const [uploadModalApp, setUploadModalApp] = useState<ApplicationItem | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Proof Viewer Modal state
  const [viewProofApp, setViewProofApp] = useState<ApplicationItem | null>(null);
  const [verificationsData, setVerificationsData] = useState<any[]>([]);
  const [isLoadingProof, setIsLoadingProof] = useState(false);

  // Status Change Modal state
  const [statusModalApp, setStatusModalApp] = useState<ApplicationItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<string>('screening');
  const [statusNotes, setStatusNotes] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Sync Retry state
  const [isRetryingSync, setIsRetryingSync] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeOrgId) {
        params.set('organizationId', activeOrgId);
      }
      if (activeTab !== 'all') {
        params.set('status', activeTab);
      }

      const res = await fetch(`/api/applications?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to load applications.');
      }

      setApplications(json.data || []);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId, activeTab]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // View existing verification proof
  const handleOpenProofViewer = async (app: ApplicationItem) => {
    setViewProofApp(app);
    setIsLoadingProof(true);
    try {
      const res = await fetch(`/api/applications/${app.id}/verify`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch proof evidence.');
      }
      setVerificationsData(json.data?.verifications || []);
    } catch (err: any) {
      alert(err.message || 'Error fetching verification evidence.');
    } finally {
      setIsLoadingProof(false);
    }
  };

  // Upload screenshot proof
  const handleConfirmUpload = async () => {
    if (!uploadModalApp || !uploadFile) return;
    setIsUploading(true);
    setUploadError(null);
    let uploadedStoragePath: string | null = null;
    const supabase = createClient();
    try {
      const orgScope = uploadModalApp.organization_id || 'personal';
      const cleanFileName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${orgScope}/${uploadModalApp.id}/${Date.now()}-${cleanFileName}`;

      // 1. Upload to private Supabase storage bucket
      const { error: storageError } = await supabase.storage
        .from('verification-screenshots')
        .upload(storagePath, uploadFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (storageError) {
        throw new Error(`Storage upload failed: ${storageError.message}`);
      }

      uploadedStoragePath = storagePath;

      // 2. Submit verification record to API
      const fullScreenshotUrl = `verification-screenshots/${storagePath}`;
      const verifyRes = await fetch(`/api/applications/${uploadModalApp.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenshotUrl: fullScreenshotUrl,
        }),
      });

      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyJson.error || 'Failed to record verification submission.');
      }

      setUploadModalApp(null);
      setUploadFile(null);
      fetchApplications();
    } catch (err: any) {
      // P-06: Clean up orphaned uploaded storage object on failure
      if (uploadedStoragePath) {
        await supabase.storage
          .from('verification-screenshots')
          .remove([uploadedStoragePath])
          .catch(() => {});
      }
      setUploadError(err.message || 'Failed to upload verification.');
    } finally {
      setIsUploading(false);
    }
  };

  // Update application lifecycle status
  const handleConfirmStatusChange = async () => {
    if (!statusModalApp) return;
    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/applications/${statusModalApp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          notes: statusNotes.trim() ? statusNotes.trim() : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update application status.');
      }

      setStatusModalApp(null);
      setStatusNotes('');
      fetchApplications();
    } catch (err: any) {
      alert(err.message || 'Failed to update application.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Manual Sync Retry
  const handleRetrySync = async (appId: string) => {
    setIsRetryingSync(appId);
    try {
      // Find sync event for this application or trigger bulk retry
      const res = await fetch('/api/sync/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: appId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to retry sync.');
      }
      fetchApplications();
    } catch (err: any) {
      alert(err.message || 'Retry failed');
    } finally {
      setIsRetryingSync(null);
    }
  };

  const filteredApplications = applications.filter((app) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return app.company_name.toLowerCase().includes(q) || app.job_title.toLowerCase().includes(q);
  });

  // Calculate counts
  const countApplied = applications.filter((a) => a.status === 'applied').length;
  const countScreening = applications.filter((a) => a.status === 'screening').length;
  const countInterview = applications.filter((a) => a.status === 'interview').length;
  const countOffer = applications.filter((a) => a.status === 'offer').length;

  return (
    <div>
      {/* Header & Metrics */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CheckSquare size={24} style={{ color: 'var(--brand-text)' }} />
              <span>Applications & Verification Center</span>
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Track lifecycle stages, upload screenshot proof of application, and monitor Google Sheets synchronization.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchApplications()}
            className="btn btn-secondary"
            style={{ fontSize: '0.8125rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Metric Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginTop: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Total Applications
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '6px' }}>
              {applications.length}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-text)', textTransform: 'uppercase' }}>
              Applied
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-text)', marginTop: '6px' }}>
              {countApplied}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--warning-text)', textTransform: 'uppercase' }}>
              Screening / Interview
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--warning-text)', marginTop: '6px' }}>
              {countScreening + countInterview}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--success-text)', textTransform: 'uppercase' }}>
              Offers Received
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success-text)', marginTop: '6px' }}>
              {countOffer}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All', count: applications.length },
            { id: 'applied', label: 'Applied', count: countApplied },
            { id: 'screening', label: 'Screening', count: countScreening },
            { id: 'interview', label: 'Interview', count: countInterview },
            { id: 'offer', label: 'Offer', count: countOffer },
            { id: 'rejected', label: 'Rejected', count: applications.filter((a) => a.status === 'rejected').length },
            { id: 'withdrawn', label: 'Withdrawn', count: applications.filter((a) => a.status === 'withdrawn').length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as ApplicationStatusTab)}
              className={`btn ${activeTab === tab.id ? 'btn-secondary' : 'btn-ghost'}`}
              style={{
                fontSize: '0.8125rem',
                padding: '6px 12px',
                fontWeight: activeTab === tab.id ? 700 : 500,
                backgroundColor: activeTab === tab.id ? 'var(--bg-surface-elevated)' : 'transparent',
                borderColor: activeTab === tab.id ? 'var(--border-default)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.6875rem',
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: activeTab === tab.id ? 'var(--brand-surface)' : 'var(--bg-surface-subtle)',
                  color: activeTab === tab.id ? 'var(--brand-text)' : 'var(--text-muted)',
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: '260px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search company or title..."
            className="input"
            style={{
              paddingLeft: '32px',
              fontSize: '0.8125rem',
              height: '36px',
              width: '100%',
              backgroundColor: 'var(--bg-surface)',
            }}
          />
        </div>
      </div>

      {/* Error Banner */}
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
          <button type="button" onClick={() => fetchApplications()} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: '100px',
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
      {!isLoading && filteredApplications.length === 0 && (
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
            <CheckSquare size={24} />
          </div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            No applications in this view
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
            Applications you log from your assigned jobs or manual tracking will appear here.
          </p>
        </div>
      )}

      {/* Applications List */}
      {!isLoading && filteredApplications.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredApplications.map((app) => {
            const isVerified = app.verification_status === 'verified';
            const isVerifPending = app.verification_status === 'pending';
            const isVerifRejected = app.verification_status === 'rejected';

            const isSyncSuccess = app.sync_status === 'synced';
            const isSyncFailed = app.sync_status === 'failed' || app.sync_status === 'dead_letter';

            return (
              <div
                key={app.id}
                className="job-card-container"
                style={{
                  padding: '18px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '16px',
                }}
              >
                {/* Left: Job Info & Stage */}
                <div style={{ minWidth: '260px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    {/* Stage Badge */}
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-xs)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        backgroundColor:
                          app.status === 'offer'
                            ? 'var(--success-surface)'
                            : app.status === 'interview'
                            ? 'rgba(37, 99, 235, 0.15)'
                            : app.status === 'screening'
                            ? 'var(--warning-surface)'
                            : app.status === 'rejected'
                            ? 'var(--danger-surface)'
                            : 'var(--bg-surface-elevated)',
                        color:
                          app.status === 'offer'
                            ? 'var(--success-text)'
                            : app.status === 'interview'
                            ? 'var(--brand-text)'
                            : app.status === 'screening'
                            ? 'var(--warning-text)'
                            : app.status === 'rejected'
                            ? 'var(--danger-text)'
                            : 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {app.status}
                    </span>

                    {/* Verification Status Badge */}
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-xs)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: isVerified
                          ? 'var(--success-surface)'
                          : isVerifPending
                          ? 'var(--warning-surface)'
                          : isVerifRejected
                          ? 'var(--danger-surface)'
                          : 'var(--bg-surface-subtle)',
                        color: isVerified
                          ? 'var(--success-text)'
                          : isVerifPending
                          ? 'var(--warning-text)'
                          : isVerifRejected
                          ? 'var(--danger-text)'
                          : 'var(--text-muted)',
                        border: isVerified
                          ? '1px solid var(--success-border)'
                          : isVerifPending
                          ? '1px solid var(--warning-border)'
                          : isVerifRejected
                          ? '1px solid var(--danger-border)'
                          : '1px solid var(--border-subtle)',
                      }}
                    >
                      {isVerified ? <ShieldCheck size={12} /> : <FileCheck size={12} />}
                      <span>
                        {isVerified
                          ? 'Proof Verified'
                          : isVerifPending
                          ? 'Proof Under Review'
                          : isVerifRejected
                          ? 'Proof Rejected'
                          : 'No Proof'}
                      </span>
                    </span>

                    {/* Sheets Sync Status Badge */}
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-xs)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: isSyncSuccess
                          ? 'rgba(16, 185, 129, 0.1)'
                          : isSyncFailed
                          ? 'rgba(239, 68, 68, 0.1)'
                          : 'var(--bg-surface-subtle)',
                        color: isSyncSuccess
                          ? 'var(--success-text)'
                          : isSyncFailed
                          ? 'var(--danger-text)'
                          : 'var(--text-muted)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span>
                        {isSyncSuccess
                          ? 'Sheets Synced'
                          : isSyncFailed
                          ? 'Sync Failed'
                          : 'Sync Pending'}
                      </span>
                    </span>
                  </div>

                  <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0' }}>
                    {app.job_title}
                  </h2>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{app.company_name}</span>
                    <span>•</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
                      {new Date(app.applied_at || app.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {app.notes && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                      {app.notes}
                    </div>
                  )}
                </div>

                {/* Right: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {/* Status update button */}
                  <button
                    type="button"
                    onClick={() => {
                      setStatusModalApp(app);
                      setTargetStatus(app.status);
                    }}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8125rem', padding: '6px 12px' }}
                  >
                    <span>Update Stage</span>
                  </button>

                  {/* Verification action */}
                  {isVerified || isVerifPending ? (
                    <button
                      type="button"
                      onClick={() => handleOpenProofViewer(app)}
                      className="btn btn-ghost"
                      style={{ fontSize: '0.8125rem', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      <Eye size={14} />
                      <span>View Proof</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadModalApp(app);
                        setUploadFile(null);
                        setUploadError(null);
                      }}
                      className="btn btn-secondary"
                      style={{
                        fontSize: '0.8125rem',
                        padding: '6px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        borderColor: isVerifRejected ? 'var(--danger-border)' : 'var(--border-default)',
                        color: isVerifRejected ? 'var(--danger-text)' : 'var(--brand-text)',
                      }}
                    >
                      <UploadCloud size={14} />
                      <span>{isVerifRejected ? 'Re-upload Proof' : 'Upload Proof'}</span>
                    </button>
                  )}

                  {/* Retry Sync button if failed */}
                  {isSyncFailed && (
                    <button
                      type="button"
                      onClick={() => handleRetrySync(app.id)}
                      className="btn btn-ghost"
                      style={{ fontSize: '0.8125rem', padding: '6px 10px', color: 'var(--danger-text)' }}
                      title="Retry Google Sheets Synchronization"
                      disabled={isRetryingSync === app.id}
                    >
                      <RotateCw size={14} className={isRetryingSync === app.id ? 'spin' : ''} />
                      <span>Retry Sync</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Screenshot Proof Modal */}
      {uploadModalApp && (
        <div
          className="modal-backdrop"
          onClick={() => setUploadModalApp(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-surface"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '500px', padding: '24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UploadCloud size={20} style={{ color: 'var(--brand-text)' }} />
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Upload Application Proof
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalApp(null)}
                className="btn-icon"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Upload a screenshot confirming your submitted application for{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{uploadModalApp.company_name}</strong>.
            </p>

            {uploadError && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--danger-surface)',
                  border: '1px solid var(--danger-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--danger-text)',
                  fontSize: '0.8125rem',
                  marginBottom: '14px',
                }}
              >
                {uploadError}
              </div>
            )}

            <div
              style={{
                border: '2px dashed var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '28px 20px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-surface-elevated)',
                cursor: 'pointer',
                marginBottom: '20px',
              }}
              onClick={() => document.getElementById('screenshot-file-input')?.click()}
            >
              <input
                id="screenshot-file-input"
                type="file"
                accept="image/png, image/jpeg, image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setUploadFile(e.target.files[0]);
                  }
                }}
              />
              <UploadCloud size={32} style={{ color: 'var(--brand-text)', margin: '0 auto 8px' }} />
              {uploadFile ? (
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                    {uploadFile.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {(uploadFile.size / 1024).toFixed(1)} KB — Click to change
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                    Click to select screenshot
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Supports PNG, JPG, or WEBP (Max 10MB)
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setUploadModalApp(null)}
                className="btn btn-ghost"
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUpload}
                className="btn btn-primary"
                disabled={!uploadFile || isUploading}
              >
                {isUploading ? 'Uploading...' : 'Submit Verification'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Proof Evidence Modal */}
      {viewProofApp && (
        <div
          className="modal-backdrop"
          onClick={() => setViewProofApp(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-surface"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '640px', padding: '24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} style={{ color: 'var(--success-text)' }} />
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Verification Proof — {viewProofApp.company_name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewProofApp(null)}
                className="btn-icon"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {isLoadingProof && (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading verified evidence...
              </div>
            )}

            {!isLoadingProof && verificationsData.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No verification records found.
              </div>
            )}

            {!isLoadingProof && verificationsData.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {verificationsData.map((v: any) => (
                  <div
                    key={v.id}
                    style={{
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      padding: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-xs)',
                          textTransform: 'uppercase',
                          backgroundColor:
                            v.status === 'verified'
                              ? 'var(--success-surface)'
                              : v.status === 'rejected'
                              ? 'var(--danger-surface)'
                              : 'var(--warning-surface)',
                          color:
                            v.status === 'verified'
                              ? 'var(--success-text)'
                              : v.status === 'rejected'
                              ? 'var(--danger-text)'
                              : 'var(--warning-text)',
                        }}
                      >
                        {v.status}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Submitted {new Date(v.created_at).toLocaleString()}
                      </span>
                    </div>

                    {v.signed_url ? (
                      <div style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-subtle)', marginBottom: '10px' }}>
                        <img
                          src={v.signed_url}
                          alt="Verification Screenshot"
                          style={{ width: '100%', maxHeight: '360px', objectFit: 'contain', backgroundColor: '#000' }}
                        />
                      </div>
                    ) : (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                        Screenshot stored privately
                      </div>
                    )}

                    {v.notes && (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                        <strong>Notes: </strong>
                        {v.notes}
                      </div>
                    )}

                    {v.rejection_reason && (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--danger-text)', marginTop: '4px' }}>
                        <strong>Rejection Reason: </strong>
                        {v.rejection_reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Update Stage Modal */}
      {statusModalApp && (
        <div
          className="modal-backdrop"
          onClick={() => setStatusModalApp(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-surface"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '440px', padding: '24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Update Application Stage
              </h3>
              <button
                type="button"
                onClick={() => setStatusModalApp(null)}
                className="btn-icon"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Update progress for <strong style={{ color: 'var(--text-primary)' }}>{statusModalApp.company_name}</strong>:
            </p>

            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              New Stage:
            </label>
            <select
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value)}
              className="input"
              style={{ width: '100%', marginBottom: '16px', fontSize: '0.875rem' }}
            >
              <option value="applied">Applied</option>
              <option value="screening">Screening</option>
              <option value="interview">Interview</option>
              <option value="offer">Offer Received</option>
              <option value="rejected">Rejected</option>
              <option value="withdrawn">Withdrawn</option>
            </select>

            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Notes (optional):
            </label>
            <textarea
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              placeholder="e.g. Completed recruiter screen, scheduled technical interview..."
              className="input"
              rows={3}
              style={{ width: '100%', marginBottom: '20px', resize: 'vertical', fontSize: '0.8125rem' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setStatusModalApp(null)}
                className="btn btn-ghost"
                disabled={isUpdatingStatus}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStatusChange}
                className="btn btn-primary"
                disabled={isUpdatingStatus}
              >
                {isUpdatingStatus ? 'Saving...' : 'Save Stage'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
