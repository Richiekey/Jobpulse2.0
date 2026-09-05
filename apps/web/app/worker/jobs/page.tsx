'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Briefcase,
  Clock,
  CheckCircle2,
  ExternalLink,
  Play,
  SkipForward,
  AlertCircle,
  Search,
  Building2,
  MapPin,
  Calendar,
  AlertTriangle,
  RefreshCw,
  PlusCircle,
  X,
  FileText,
} from 'lucide-react';
import { useWorker } from '@/components/worker/WorkerContext';

type AssignmentStatusTab = 'all' | 'assigned' | 'in_progress' | 'completed' | 'skipped';

interface AssignmentItem {
  id: string;
  organizationId: string;
  jobId: string;
  workerId: string;
  assignedBy: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'skipped';
  deadlineAt: string | null;
  notes: string | null;
  assignedAt: string;
  updatedAt: string;
  job: {
    id: string;
    canonicalTitle: string;
    displayTitle: string;
    locations: string[];
    workplaceType: string;
    employmentType: string;
    applyUrl: string | null;
    canonicalUrl: string | null;
    postedAt: string | null;
    company: {
      id: string;
      name: string;
      logoUrl: string | null;
    } | null;
  } | null;
}

export default function WorkerJobsPage() {
  const { activeOrgId, activeOrg } = useWorker();

  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AssignmentStatusTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Skip Modal state
  const [skipModalAssignment, setSkipModalAssignment] = useState<AssignmentItem | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [isSubmittingSkip, setIsSubmittingSkip] = useState(false);

  // Apply & Complete Modal state
  const [applyModalAssignment, setApplyModalAssignment] = useState<AssignmentItem | null>(null);
  const [applyNotes, setApplyNotes] = useState('');
  const [isSubmittingApply, setIsSubmittingApply] = useState(false);

  const fetchAssignments = useCallback(async () => {
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

      const res = await fetch(`/api/worker/assignments?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to load assigned jobs.');
      }

      setAssignments(json.data || []);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId, activeTab]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const handleStartAssignment = async (assignment: AssignmentItem) => {
    try {
      const res = await fetch(`/api/worker/assignments/${assignment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to start assignment.');
      }
      // Refresh list
      fetchAssignments();
    } catch (err: any) {
      alert(err.message || 'Failed to start assignment');
    }
  };

  const handleConfirmSkip = async () => {
    if (!skipModalAssignment) return;
    setIsSubmittingSkip(true);
    try {
      const res = await fetch(`/api/worker/assignments/${skipModalAssignment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'skipped',
          notes: skipReason.trim() || 'Skipped by worker',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to skip assignment.');
      }
      setSkipModalAssignment(null);
      setSkipReason('');
      fetchAssignments();
    } catch (err: any) {
      alert(err.message || 'Failed to skip assignment');
    } finally {
      setIsSubmittingSkip(false);
    }
  };

  const handleConfirmApplyAndComplete = async () => {
    if (!applyModalAssignment) return;
    setIsSubmittingApply(true);
    try {
      const job = applyModalAssignment.job;
      const compName = job?.company?.name || 'Company';
      const jobTitle = job?.displayTitle || job?.canonicalTitle || 'Position';

      // Atomic completion & application upsert (P-01)
      const res = await fetch(`/api/worker/assignments/${applyModalAssignment.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: applyNotes.trim() || 'Application submitted via Worker Center',
          companyName: compName,
          jobTitle: jobTitle,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to complete assignment.');
      }

      setApplyModalAssignment(null);
      setApplyNotes('');
      fetchAssignments();
    } catch (err: any) {
      alert(err.message || 'Failed to complete assignment.');
    } finally {
      setIsSubmittingApply(false);
    }
  };

  const handleDirectApplyClick = async (jobId: string, applyUrl: string) => {
    try {
      // Record outbound click
      fetch(`/api/jobs/${jobId}/click`, { method: 'POST' }).catch(() => {});
    } finally {
      window.open(applyUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Filter assignments by search query
  const filteredAssignments = assignments.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const title = (a.job?.displayTitle || a.job?.canonicalTitle || '').toLowerCase();
    const comp = (a.job?.company?.name || '').toLowerCase();
    const notes = (a.notes || '').toLowerCase();
    return title.includes(q) || comp.includes(q) || notes.includes(q);
  });

  // Calculate stats
  const countAssigned = assignments.filter((a) => a.status === 'assigned').length;
  const countInProgress = assignments.filter((a) => a.status === 'in_progress').length;
  const countCompleted = assignments.filter((a) => a.status === 'completed').length;
  const countSkipped = assignments.filter((a) => a.status === 'skipped').length;

  return (
    <div>
      {/* Header & Metrics */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Briefcase size={24} style={{ color: 'var(--brand-text)' }} />
              <span>Assigned Jobs Dispatch</span>
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {activeOrg ? `Review and fulfill job assignments dispatched for ${activeOrg.name}.` : 'Review and execute your dispatched job applications.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchAssignments()}
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
              Total Assignments
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '6px' }}>
              {assignments.length}
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
              Pending Action
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-text)', marginTop: '6px' }}>
              {countAssigned}
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
              In Progress
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--warning-text)', marginTop: '6px' }}>
              {countInProgress}
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
              Completed
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success-text)', marginTop: '6px' }}>
              {countCompleted}
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
            { id: 'all', label: 'All Jobs', count: assignments.length },
            { id: 'assigned', label: 'Assigned', count: countAssigned },
            { id: 'in_progress', label: 'In Progress', count: countInProgress },
            { id: 'completed', label: 'Completed', count: countCompleted },
            { id: 'skipped', label: 'Skipped', count: countSkipped },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as AssignmentStatusTab)}
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

        {/* Search Input */}
        <div style={{ position: 'relative', width: '260px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter assignments..."
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
          <button type="button" onClick={() => fetchAssignments()} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
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
                height: '110px',
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
      {!isLoading && filteredAssignments.length === 0 && (
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
            <CheckCircle2 size={24} />
          </div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            No assignments in this view
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '6px', maxWidth: '420px', margin: '6px auto 0' }}>
            {activeTab === 'all'
              ? 'You currently have no jobs dispatched to you. Check back later or notify your organization administrator.'
              : `No assignments matching the "${activeTab.replace('_', ' ')}" status.`}
          </p>
        </div>
      )}

      {/* Assignments List */}
      {!isLoading && filteredAssignments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredAssignments.map((assignment) => {
            const job = assignment.job;
            const compName = job?.company?.name || 'Company';
            const jobTitle = job?.displayTitle || job?.canonicalTitle || 'Position';
            const applyLink = job?.applyUrl || job?.canonicalUrl;

            // Deadline check
            let isOverdue = false;
            let deadlineLabel: string | null = null;
            if (assignment.deadlineAt) {
              const diffMs = new Date(assignment.deadlineAt).getTime() - Date.now();
              const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
              if (diffMs < 0) {
                isOverdue = true;
                deadlineLabel = `Overdue by ${Math.abs(diffDays)}d`;
              } else if (diffDays === 0) {
                deadlineLabel = 'Due today';
              } else {
                deadlineLabel = `Due in ${diffDays}d`;
              }
            }

            return (
              <div
                key={assignment.id}
                className="job-card-container"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  {/* Job Details */}
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-xs)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          backgroundColor:
                            assignment.status === 'completed'
                              ? 'var(--success-surface)'
                              : assignment.status === 'in_progress'
                              ? 'var(--warning-surface)'
                              : assignment.status === 'skipped'
                              ? 'rgba(100, 116, 139, 0.2)'
                              : 'var(--brand-surface)',
                          color:
                            assignment.status === 'completed'
                              ? 'var(--success-text)'
                              : assignment.status === 'in_progress'
                              ? 'var(--warning-text)'
                              : assignment.status === 'skipped'
                              ? 'var(--text-muted)'
                              : 'var(--brand-text)',
                          border:
                            assignment.status === 'completed'
                              ? '1px solid var(--success-border)'
                              : assignment.status === 'in_progress'
                              ? '1px solid var(--warning-border)'
                              : '1px solid var(--brand-border)',
                        }}
                      >
                        {assignment.status.replace('_', ' ')}
                      </span>

                      {deadlineLabel && (
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-xs)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: isOverdue ? 'var(--danger-surface)' : 'var(--bg-surface-elevated)',
                            color: isOverdue ? 'var(--danger-text)' : 'var(--text-secondary)',
                            border: isOverdue ? '1px solid var(--danger-border)' : '1px solid var(--border-subtle)',
                          }}
                        >
                          <Clock size={11} />
                          <span>{deadlineLabel}</span>
                        </span>
                      )}

                      {job?.workplaceType && (
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            color: 'var(--text-muted)',
                            backgroundColor: 'var(--bg-surface-subtle)',
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-xs)',
                          }}
                        >
                          {job.workplaceType}
                        </span>
                      )}
                    </div>

                    <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0' }}>
                      {jobTitle}
                    </h2>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '6px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        <Building2 size={14} style={{ color: 'var(--text-muted)' }} />
                        {compName}
                      </span>

                      {job?.locations && job.locations.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin size={13} style={{ color: 'var(--text-muted)' }} />
                          {job.locations.join(', ')}
                        </span>
                      )}

                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                        <Calendar size={13} />
                        Dispatched {new Date(assignment.assignedAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Assigner Notes */}
                    {assignment.notes && (
                      <div
                        style={{
                          marginTop: '10px',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '0.8125rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Dispatch Note: </span>
                        {assignment.notes}
                      </div>
                    )}
                  </div>

                  {/* Actions Column */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* Direct Apply Button */}
                    {applyLink && (
                      <button
                        type="button"
                        onClick={() => handleDirectApplyClick(assignment.jobId, applyLink)}
                        className="btn btn-primary"
                        style={{ fontSize: '0.8125rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <span>Open Application</span>
                        <ExternalLink size={14} />
                      </button>
                    )}

                    {/* Start Action */}
                    {assignment.status === 'assigned' && (
                      <button
                        type="button"
                        onClick={() => handleStartAssignment(assignment)}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8125rem', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Play size={14} style={{ color: 'var(--brand-text)' }} />
                        <span>Start</span>
                      </button>
                    )}

                    {/* Complete & Mark Applied Action */}
                    {(assignment.status === 'assigned' || assignment.status === 'in_progress') && (
                      <button
                        type="button"
                        onClick={() => setApplyModalAssignment(assignment)}
                        className="btn btn-secondary"
                        style={{
                          fontSize: '0.8125rem',
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: 'var(--success-text)',
                          borderColor: 'var(--success-border)',
                        }}
                      >
                        <CheckCircle2 size={14} />
                        <span>Complete & Log</span>
                      </button>
                    )}

                    {/* Skip Action */}
                    {(assignment.status === 'assigned' || assignment.status === 'in_progress') && (
                      <button
                        type="button"
                        onClick={() => setSkipModalAssignment(assignment)}
                        className="btn btn-ghost"
                        style={{
                          fontSize: '0.8125rem',
                          padding: '8px 10px',
                          color: 'var(--text-muted)',
                        }}
                        title="Skip this job assignment"
                      >
                        <SkipForward size={14} />
                        <span>Skip</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Skip Assignment Modal */}
      {skipModalAssignment && (
        <div
          className="modal-backdrop"
          onClick={() => setSkipModalAssignment(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-surface"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px', padding: '24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} style={{ color: 'var(--warning-text)' }} />
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Skip Job Assignment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSkipModalAssignment(null)}
                className="btn-icon"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Are you sure you want to skip{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {skipModalAssignment.job?.displayTitle || 'this assignment'}
              </strong>{' '}
              at {skipModalAssignment.job?.company?.name || 'Company'}?
            </p>

            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Reason for skipping (optional):
            </label>
            <textarea
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              placeholder="e.g. Incompatible tech stack, expired posting, location restriction..."
              className="input"
              rows={3}
              style={{
                width: '100%',
                fontSize: '0.8125rem',
                padding: '10px',
                marginBottom: '20px',
                resize: 'vertical',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setSkipModalAssignment(null)}
                className="btn btn-ghost"
                disabled={isSubmittingSkip}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSkip}
                className="btn btn-primary"
                style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)' }}
                disabled={isSubmittingSkip}
              >
                {isSubmittingSkip ? 'Skipping...' : 'Confirm Skip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete & Log Application Modal */}
      {applyModalAssignment && (
        <div
          className="modal-backdrop"
          onClick={() => setApplyModalAssignment(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-surface"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '520px', padding: '24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={20} style={{ color: 'var(--success-text)' }} />
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Complete & Log Application
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setApplyModalAssignment(null)}
                className="btn-icon"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              This will record the application in your tracker and mark the assignment as completed.
            </p>

            <div
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {applyModalAssignment.job?.displayTitle || applyModalAssignment.job?.canonicalTitle}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {applyModalAssignment.job?.company?.name}
              </div>
            </div>

            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Application Notes & Confirmation Details:
            </label>
            <textarea
              value={applyNotes}
              onChange={(e) => setApplyNotes(e.target.value)}
              placeholder="e.g. Applied via Workday; confirmation email received #10293..."
              className="input"
              rows={3}
              style={{
                width: '100%',
                fontSize: '0.8125rem',
                padding: '10px',
                marginBottom: '20px',
                resize: 'vertical',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setApplyModalAssignment(null)}
                className="btn btn-ghost"
                disabled={isSubmittingApply}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApplyAndComplete}
                className="btn btn-primary"
                disabled={isSubmittingApply}
              >
                {isSubmittingApply ? 'Saving...' : 'Confirm & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
