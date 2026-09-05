'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Search,
  RefreshCw,
  Eye,
  AlertTriangle,
  Building2,
  User,
  MessageSquare,
  ZoomIn,
  X,
  FileImage,
} from 'lucide-react';

export interface AdminVerificationItem {
  id: string;
  applicationId: string;
  organizationId: string | null;
  workerId: string;
  status: 'pending' | 'verified' | 'rejected';
  signedUrl: string | null;
  hasScreenshot: boolean;
  reviewerId: string | null;
  reviewerNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  application: {
    id: string;
    companyName: string;
    jobTitle: string;
    status: string;
    appliedAt: string;
    notes?: string | null;
    userId: string;
    workerId?: string | null;
    verificationStatus: string;
  } | null;
  worker: {
    id: string;
    email: string | null;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
  reviewer: {
    id: string;
    email: string | null;
    fullName: string | null;
  } | null;
}

interface VerificationReviewQueueProps {
  organizationId: string | null;
  organizationName?: string;
}

export const VerificationReviewQueue: React.FC<VerificationReviewQueueProps> = ({
  organizationId,
  organizationName,
}) => {
  const [verifications, setVerifications] = useState<AdminVerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  // Status tab filter
  const [activeTab, setActiveTab] = useState<'pending' | 'verified' | 'rejected' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Screenshot Lightbox Modal
  const [activeScreenshot, setActiveScreenshot] = useState<{
    url: string;
    jobTitle: string;
    companyName: string;
    workerName: string;
  } | null>(null);

  // Reject Feedback Modal
  const [rejectingItem, setRejectingItem] = useState<AdminVerificationItem | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Fetch verifications from API
  const fetchVerifications = useCallback(async () => {
    if (!organizationId) {
      setVerifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = new URL('/api/admin/verifications', window.location.origin);
      url.searchParams.set('organizationId', organizationId);
      url.searchParams.set('status', activeTab);
      url.searchParams.set('limit', '50');

      const res = await fetch(url.toString());
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError({
          status: res.status,
          message: json.error || `Server returned HTTP ${res.status}`,
        });
        setVerifications([]);
        return;
      }

      const json = await res.json();
      setVerifications(json.data?.verifications || []);
    } catch (err: any) {
      setError({
        status: 0,
        message: err.message || 'Failed to fetch verification review queue.',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, activeTab]);

  useEffect(() => {
    fetchVerifications();
  }, [fetchVerifications]);

  // Approve action
  const handleApprove = async (item: AdminVerificationItem) => {
    setIsSubmittingReview(true);
    setReviewError(null);

    try {
      const res = await fetch(`/api/applications/${item.applicationId}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'verified',
          verificationId: item.id,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || `Failed to approve verification (HTTP ${res.status})`);
      }

      await fetchVerifications();
    } catch (err: any) {
      setReviewError(err.message || 'Error approving verification.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Reject action
  const handleReject = async () => {
    if (!rejectingItem) return;

    setIsSubmittingReview(true);
    setReviewError(null);

    try {
      const res = await fetch(`/api/applications/${rejectingItem.applicationId}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          reviewerNotes: rejectionNotes.trim() || undefined,
          verificationId: rejectingItem.id,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || `Failed to reject verification (HTTP ${res.status})`);
      }

      setRejectingItem(null);
      setRejectionNotes('');
      await fetchVerifications();
    } catch (err: any) {
      setReviewError(err.message || 'Error rejecting verification.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // KPI Calculations
  const pendingCount = verifications.filter((v) => v.status === 'pending').length;
  const verifiedCount = verifications.filter((v) => v.status === 'verified').length;
  const rejectedCount = verifications.filter((v) => v.status === 'rejected').length;

  // Filtered List
  const filteredItems = verifications.filter((item) => {
    const jobTitle = item.application?.jobTitle || '';
    const companyName = item.application?.companyName || '';
    const workerName = item.worker?.fullName || item.worker?.email || '';

    const matchesSearch =
      jobTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workerName.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  if (!organizationId) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <ShieldCheck size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px' }}>
          Select an Organization
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Please select an organization in the header switcher to view the verification review queue.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Review Queue KPI Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Pending Review</span>
            <Clock size={20} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b' }}>{pendingCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Awaiting verification decision</div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Verified</span>
            <CheckCircle2 size={20} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>{verifiedCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Approved proof submissions</div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Rejected</span>
            <XCircle size={20} color="#ef4444" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444' }}>{rejectedCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Requires worker re-submission</div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Evidence Records</span>
            <FileImage size={20} color="#6366f1" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{verifications.length}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Across active queue slice</div>
        </div>
      </div>

      {/* Main Review Card */}
      <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Header Tabs & Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          {/* Status Filter Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('pending')}
              className={`btn ${activeTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            >
              Pending Review
            </button>
            <button
              onClick={() => setActiveTab('verified')}
              className={`btn ${activeTab === 'verified' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            >
              Verified
            </button>
            <button
              onClick={() => setActiveTab('rejected')}
              className={`btn ${activeTab === 'rejected' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            >
              Rejected
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            >
              All
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', width: '240px' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                placeholder="Search queue…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 32px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                }}
              />
            </div>

            <button
              onClick={fetchVerifications}
              disabled={loading}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Global Review Error Alert */}
        {reviewError && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {reviewError}
          </div>
        )}

        {/* Error Banner */}
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
              onClick={fetchVerifications}
              className="btn btn-secondary"
              style={{ padding: '4px 12px', fontSize: '0.75rem' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Review Queue Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Application & Job</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Submitted By</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Evidence</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Submitted</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && verifications.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading verification items…
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No verifications found in this review state.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const jobTitle = item.application?.jobTitle || 'Job Application';
                  const companyName = item.application?.companyName || 'Company';
                  const workerName = item.worker?.fullName || item.worker?.email || 'Worker';

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Application Info */}
                      <td style={{ padding: '12px 16px', maxWidth: '300px' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {jobTitle}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            <Building2 size={12} /> {companyName}
                          </div>
                          {item.application?.notes && (
                            <div
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                fontStyle: 'italic',
                                marginTop: '4px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Note: {item.application.notes}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Submitted By */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: 'var(--accent-gradient)',
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              flexShrink: 0,
                            }}
                          >
                            {workerName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {workerName}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {item.worker?.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <div>
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
                                item.status === 'verified'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : item.status === 'rejected'
                                ? 'rgba(239, 68, 68, 0.15)'
                                : 'rgba(245, 158, 11, 0.15)',
                              color:
                                item.status === 'verified'
                                ? '#34d399'
                                : item.status === 'rejected'
                                ? '#f87171'
                                : '#fbbf24',
                            }}
                          >
                            {item.status === 'verified' ? (
                              <CheckCircle2 size={12} />
                            ) : item.status === 'rejected' ? (
                              <XCircle size={12} />
                            ) : (
                              <Clock size={12} />
                            )}
                            {item.status}
                          </span>

                          {item.reviewerNotes && (
                            <div
                              style={{
                                fontSize: '0.7rem',
                                color: 'var(--text-muted)',
                                marginTop: '4px',
                                maxWidth: '180px',
                              }}
                            >
                              Notes: {item.reviewerNotes}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Evidence Screenshot */}
                      <td style={{ padding: '12px 16px' }}>
                        {item.signedUrl ? (
                          <button
                            onClick={() =>
                              setActiveScreenshot({
                                url: item.signedUrl!,
                                jobTitle,
                                companyName,
                                workerName,
                              })
                            }
                            className="btn btn-secondary"
                            style={{
                              padding: '4px 10px',
                              fontSize: '0.75rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <Eye size={13} />
                            <span>Inspect Evidence</span>
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            No Screenshot Available
                          </span>
                        )}
                      </td>

                      {/* Submitted Date */}
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {item.status === 'pending' ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              onClick={() => handleApprove(item)}
                              disabled={isSubmittingReview}
                              className="btn btn-secondary"
                              style={{
                                padding: '4px 10px',
                                fontSize: '0.75rem',
                                color: '#10b981',
                                borderColor: 'rgba(16, 185, 129, 0.3)',
                              }}
                              title="Approve Evidence"
                            >
                              <CheckCircle2 size={13} />
                              <span>Approve</span>
                            </button>

                            <button
                              onClick={() => {
                                setRejectingItem(item);
                                setRejectionNotes('');
                                setReviewError(null);
                              }}
                              disabled={isSubmittingReview}
                              className="btn btn-secondary"
                              style={{
                                padding: '4px 10px',
                                fontSize: '0.75rem',
                                color: '#ef4444',
                                borderColor: 'rgba(239, 68, 68, 0.3)',
                              }}
                              title="Reject Evidence"
                            >
                              <XCircle size={13} />
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Decision Recorded
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Screenshot Lightbox Modal */}
      {activeScreenshot && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '24px',
          }}
          onClick={() => setActiveScreenshot(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: '900px',
              width: '100%',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: '92vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                  Evidence Inspection: {activeScreenshot.jobTitle}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {activeScreenshot.companyName} • Submitted by {activeScreenshot.workerName}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <a
                  href={activeScreenshot.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <ExternalLink size={13} />
                  <span>Open Full Size</span>
                </a>

                <button
                  onClick={() => setActiveScreenshot(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Screenshot Viewer Box */}
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#000000',
                borderRadius: '8px',
                padding: '12px',
                minHeight: '360px',
              }}
            >
              <img
                src={activeScreenshot.url}
                alt="Application verification evidence"
                style={{
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  borderRadius: '4px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Reject Feedback Dialog */}
      {rejectingItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
          onClick={() => setRejectingItem(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444',
                }}
              >
                <XCircle size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Reject Verification Evidence</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Provide feedback so the worker can re-submit valid evidence.
                </p>
              </div>
            </div>

            {reviewError && (
              <div
                style={{
                  padding: '8px 12px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                }}
              >
                {reviewError}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                Reviewer Feedback Notes (Optional)
              </label>
              <textarea
                placeholder="e.g. Screenshot is cropped or does not show applicant name / confirmation ID…"
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setRejectingItem(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 14px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isSubmittingReview}
                className="btn btn-secondary"
                style={{
                  padding: '8px 16px',
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                }}
              >
                {isSubmittingReview ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
