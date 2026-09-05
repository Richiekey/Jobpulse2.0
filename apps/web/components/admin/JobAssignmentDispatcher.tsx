'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Briefcase,
  Send,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  User,
  Building2,
  ExternalLink,
  Trash2,
  Plus,
  X,
} from 'lucide-react';

export interface AdminAssignmentItem {
  id: string;
  organizationId: string;
  jobId: string;
  workerId: string;
  assignedBy: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'skipped' | 'cancelled';
  deadlineAt: string | null;
  notes: string | null;
  assignedAt: string;
  updatedAt: string;
  job: {
    id: string;
    canonicalTitle: string;
    displayTitle?: string;
    locations?: string[];
    workplaceType?: string;
    applyUrl?: string;
    canonicalUrl?: string;
    company?: {
      id: string;
      name: string;
      logoUrl?: string;
    } | null;
  } | null;
  worker: {
    id: string;
    email: string | null;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
}

interface WorkerOption {
  userId: string;
  fullName: string | null;
  email: string | null;
  availability?: string | null;
}

interface JobOption {
  id: string;
  title: string;
  companyName: string;
  location?: string;
  workplaceType?: string;
}

interface JobAssignmentDispatcherProps {
  organizationId: string | null;
  organizationName?: string;
}

export const JobAssignmentDispatcher: React.FC<JobAssignmentDispatcherProps> = ({
  organizationId,
  organizationName,
}) => {
  const [assignments, setAssignments] = useState<AdminAssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [workerFilter, setWorkerFilter] = useState<string>('all');

  // Dispatch Modal State
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [workersList, setWorkersList] = useState<WorkerOption[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [jobIdInput, setJobIdInput] = useState('');
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<JobOption[]>([]);
  const [searchingJobs, setSearchingJobs] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [operationalNotes, setOperationalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // Cancel Assignment State
  const [cancellingAssignment, setCancellingAssignment] = useState<AdminAssignmentItem | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Fetch Assignments
  const fetchAssignments = useCallback(async () => {
    if (!organizationId) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = new URL('/api/admin/assignments', window.location.origin);
      url.searchParams.set('organizationId', organizationId);
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
      if (workerFilter !== 'all') url.searchParams.set('workerId', workerFilter);

      const res = await fetch(url.toString());
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError({
          status: res.status,
          message: json.error || `Server returned HTTP ${res.status}`,
        });
        setAssignments([]);
        return;
      }

      const json = await res.json();
      setAssignments(json.data || []);
    } catch (err: any) {
      setError({
        status: 0,
        message: err.message || 'Failed to fetch assignments.',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, statusFilter, workerFilter]);

  // Fetch Workers for the Dispatch Modal
  const fetchWorkersList = useCallback(async () => {
    if (!organizationId) return;
    try {
      const res = await fetch(`/api/admin/workers?organizationId=${organizationId}`);
      if (res.ok) {
        const json = await res.json();
        const list: WorkerOption[] = (json.data || []).map((w: any) => ({
          userId: w.userId,
          fullName: w.fullName,
          email: w.email,
          availability: w.profile?.availability || 'immediate',
        }));
        setWorkersList(list);
      }
    } catch {
      // Handled silently
    }
  }, [organizationId]);

  useEffect(() => {
    fetchAssignments();
    fetchWorkersList();
  }, [fetchAssignments, fetchWorkersList]);

  // Search catalog jobs for assignment modal
  const handleSearchJobs = async (q: string) => {
    setJobSearchQuery(q);
    if (!q || q.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchingJobs(true);
    try {
      const res = await fetch(`/api/jobs?limit=8&search=${encodeURIComponent(q)}`);
      if (res.ok) {
        const json = await res.json();
        const results: JobOption[] = (json.data?.jobs || []).map((j: any) => ({
          id: j.id,
          title: j.canonical_title || j.display_title,
          companyName: j.company?.name || 'Company',
          location: Array.isArray(j.locations) ? j.locations[0] : j.locations,
          workplaceType: j.workplace_type,
        }));
        setSearchResults(results);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearchingJobs(false);
    }
  };

  // Submit new assignment dispatch
  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;

    const targetJobId = selectedJob ? selectedJob.id : jobIdInput.trim();
    if (!targetJobId) {
      setDispatchError('Please select or specify a target job ID.');
      return;
    }

    if (!selectedWorkerId) {
      setDispatchError('Please select a worker to receive this assignment.');
      return;
    }

    setIsSubmitting(true);
    setDispatchError(null);

    try {
      const payload: Record<string, any> = {
        organizationId,
        jobId: targetJobId,
        workerId: selectedWorkerId,
      };

      if (deadlineDate) {
        payload.deadlineAt = new Date(deadlineDate).toISOString();
      }
      if (operationalNotes.trim()) {
        payload.notes = operationalNotes.trim();
      }

      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || `Failed to dispatch assignment (HTTP ${res.status})`);
      }

      // Close and reset modal
      setIsDispatchModalOpen(false);
      setSelectedJob(null);
      setJobIdInput('');
      setJobSearchQuery('');
      setOperationalNotes('');
      setDeadlineDate('');
      setSelectedWorkerId('');

      // Refresh list
      await fetchAssignments();
    } catch (err: any) {
      setDispatchError(err.message || 'Error dispatching assignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel Assignment
  const handleCancelAssignment = async () => {
    if (!cancellingAssignment || !organizationId) return;

    setIsCancelling(true);
    setCancelError(null);

    try {
      const res = await fetch(
        `/api/admin/assignments?assignmentId=${cancellingAssignment.id}&organizationId=${organizationId}`,
        { method: 'DELETE' }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Failed to cancel assignment (HTTP ${res.status})`);
      }

      setCancellingAssignment(null);
      await fetchAssignments();
    } catch (err: any) {
      setCancelError(err.message || 'Error cancelling assignment.');
    } finally {
      setIsCancelling(false);
    }
  };

  // KPI Calculations
  const totalCount = assignments.length;
  const assignedCount = assignments.filter((a) => a.status === 'assigned').length;
  const inProgressCount = assignments.filter((a) => a.status === 'in_progress').length;
  const completedCount = assignments.filter((a) => a.status === 'completed').length;

  // Filter list
  const filteredAssignments = assignments.filter((a) => {
    const jobTitle = a.job?.canonicalTitle || a.job?.displayTitle || '';
    const companyName = a.job?.company?.name || '';
    const workerName = a.worker?.fullName || a.worker?.email || '';

    const matchesSearch =
      jobTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workerName.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  if (!organizationId) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <Briefcase size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px' }}>
          Select an Organization
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Please select an organization in the header to access the assignment dispatcher.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Dispatch KPI Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Queue</span>
            <Briefcase size={20} color="#6366f1" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{totalCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>All tracked assignments</div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Assigned / Pending</span>
            <Clock size={20} color="#818cf8" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#818cf8' }}>{assignedCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Awaiting worker pickup</div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>In Progress</span>
            <Clock size={20} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b' }}>{inProgressCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Currently being applied</div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Completed</span>
            <CheckCircle2 size={20} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>{completedCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Successfully applied & verified</div>
        </div>
      </div>

      {/* Main Dispatcher Queue Card */}
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
                placeholder="Search assignments by job, company, or worker..."
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
              <option value="all">All Statuses</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="skipped">Skipped</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Worker Filter */}
            <select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                maxWidth: '180px',
              }}
            >
              <option value="all">All Workers</option>
              {workersList.map((w) => (
                <option key={w.userId} value={w.userId}>
                  {w.fullName || w.email}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={fetchAssignments}
              disabled={loading}
              className="btn btn-secondary"
              style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => {
                setIsDispatchModalOpen(true);
                setDispatchError(null);
              }}
              className="btn btn-primary"
              style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} />
              <span>Dispatch Job</span>
            </button>
          </div>
        </div>

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
              onClick={fetchAssignments}
              className="btn btn-secondary"
              style={{ padding: '4px 12px', fontSize: '0.75rem' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Assignments Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Job Opportunity</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Assigned Worker</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Deadline</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Dispatched</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && assignments.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading assignment queue…
                  </td>
                </tr>
              ) : filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No assignments found for the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((a) => {
                  const jobTitle = a.job?.canonicalTitle || a.job?.displayTitle || 'Unknown Job';
                  const companyName = a.job?.company?.name || 'Company';
                  const isOverdue =
                    a.deadlineAt &&
                    new Date(a.deadlineAt).getTime() < Date.now() &&
                    a.status !== 'completed' &&
                    a.status !== 'skipped';

                  return (
                    <tr
                      key={a.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Job Details */}
                      <td style={{ padding: '12px 16px', maxWidth: '320px' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {jobTitle}
                            </span>
                            {a.job?.applyUrl && (
                              <a
                                href={a.job.applyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--text-muted)' }}
                                title="Open Job Posting"
                              >
                                <ExternalLink size={13} />
                              </a>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Building2 size={12} /> {companyName}
                            </span>
                            {a.job?.workplaceType && (
                              <span
                                style={{
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  textTransform: 'capitalize',
                                }}
                              >
                                {a.job.workplaceType}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Worker */}
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
                            {(a.worker?.fullName || a.worker?.email || 'W').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {a.worker?.fullName || 'Worker'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {a.worker?.email}
                            </div>
                          </div>
                        </div>
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
                              a.status === 'completed'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : a.status === 'in_progress'
                                ? 'rgba(245, 158, 11, 0.15)'
                                : a.status === 'assigned'
                                ? 'rgba(99, 102, 241, 0.15)'
                                : a.status === 'cancelled'
                                ? 'rgba(239, 68, 68, 0.15)'
                                : 'rgba(156, 163, 175, 0.15)',
                            color:
                              a.status === 'completed'
                                ? '#34d399'
                                : a.status === 'in_progress'
                                ? '#fbbf24'
                                : a.status === 'assigned'
                                ? '#818cf8'
                                : a.status === 'cancelled'
                                ? '#f87171'
                                : '#9ca3af',
                          }}
                        >
                          {a.status === 'completed' ? (
                            <CheckCircle2 size={12} />
                          ) : a.status === 'in_progress' ? (
                            <Clock size={12} />
                          ) : a.status === 'cancelled' ? (
                            <XCircle size={12} />
                          ) : (
                            <Briefcase size={12} />
                          )}
                          {a.status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Deadline */}
                      <td style={{ padding: '12px 16px' }}>
                        {a.deadlineAt ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: isOverdue ? '#ef4444' : 'var(--text-primary)',
                              fontWeight: isOverdue ? 700 : 500,
                              fontSize: '0.8rem',
                            }}
                          >
                            <Calendar size={13} color={isOverdue ? '#ef4444' : 'var(--text-muted)'} />
                            <span>{new Date(a.deadlineAt).toLocaleDateString()}</span>
                            {isOverdue && (
                              <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#ef4444' }}>
                                (Overdue)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>None</span>
                        )}
                      </td>

                      {/* Dispatched At */}
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(a.assignedAt).toLocaleDateString()}
                      </td>

                      {/* Cancel Action */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {a.status !== 'completed' && a.status !== 'skipped' && a.status !== 'cancelled' ? (
                          <button
                            onClick={() => {
                              setCancellingAssignment(a);
                              setCancelError(null);
                            }}
                            className="btn btn-secondary"
                            style={{
                              padding: '4px 8px',
                              fontSize: '0.75rem',
                              color: '#ef4444',
                              borderColor: 'rgba(239, 68, 68, 0.3)',
                            }}
                            title="Cancel Assignment"
                          >
                            <Trash2 size={13} />
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
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

      {/* Dispatch Modal */}
      {isDispatchModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setIsDispatchModalOpen(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: '540px',
              width: '100%',
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
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
                  <Send size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Dispatch Job Assignment</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Assign a catalog role to a member of {organizationName || 'your organization'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {dispatchError && (
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                {dispatchError}
              </div>
            )}

            <form onSubmit={handleDispatch} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Select Worker */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Assignee Worker <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="">Select a worker…</option>
                  {workersList.map((w) => (
                    <option key={w.userId} value={w.userId}>
                      {w.fullName || w.email} ({w.availability?.replace('_', ' ') || 'immediate'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Job */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Target Catalog Job <span style={{ color: '#ef4444' }}>*</span>
                </label>
                {selectedJob ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: 'rgba(99, 102, 241, 0.1)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#818cf8' }}>
                        {selectedJob.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {selectedJob.companyName} • {selectedJob.location || 'Remote'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedJob(null)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ position: 'relative' }}>
                      <Search
                        size={15}
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
                        placeholder="Search active catalog jobs (e.g. Software Engineer)…"
                        value={jobSearchQuery}
                        onChange={(e) => handleSearchJobs(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px 10px 36px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>

                    {/* Job Search Dropdown Results */}
                    {searchResults.length > 0 && (
                      <div
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          background: 'var(--bg-secondary)',
                          maxHeight: '180px',
                          overflowY: 'auto',
                        }}
                      >
                        {searchResults.map((job) => (
                          <button
                            key={job.id}
                            type="button"
                            onClick={() => {
                              setSelectedJob(job);
                              setSearchResults([]);
                              setJobSearchQuery('');
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              textAlign: 'left',
                              border: 'none',
                              borderBottom: '1px solid var(--border-color)',
                              background: 'transparent',
                              color: 'var(--text-primary)',
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>{job.title}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {job.companyName} • {job.location || 'Remote'}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                      — OR enter Job UUID directly —
                    </div>

                    <input
                      type="text"
                      placeholder="e.g. 11111111-2222-3333-4444-555555555555"
                      value={jobIdInput}
                      onChange={(e) => setJobIdInput(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Deadline */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Target Deadline (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              {/* Operational Instructions / Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Instructions / Notes (Optional)
                </label>
                <textarea
                  placeholder="e.g. Use Candidate CV v2, highlight backend Node.js experience in answers…"
                  value={operationalNotes}
                  onChange={(e) => setOperationalNotes(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsDispatchModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary"
                  style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Send size={15} />
                  <span>{isSubmitting ? 'Dispatching…' : 'Dispatch Assignment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancellingAssignment && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setCancellingAssignment(null)}
        >
          <div
            className="card"
            style={{ maxWidth: '420px', width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444' }}>Cancel Assignment</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Are you sure you want to cancel the assignment for{' '}
              <strong>{cancellingAssignment.job?.canonicalTitle || 'this job'}</strong> assigned to{' '}
              <strong>{cancellingAssignment.worker?.fullName || cancellingAssignment.worker?.email}</strong>?
            </p>

            {cancelError && (
              <div
                style={{
                  padding: '8px 12px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                }}
              >
                {cancelError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={() => setCancellingAssignment(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 14px' }}
              >
                Keep Assignment
              </button>
              <button
                onClick={handleCancelAssignment}
                disabled={isCancelling}
                className="btn btn-secondary"
                style={{
                  padding: '8px 16px',
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                }}
              >
                {isCancelling ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
