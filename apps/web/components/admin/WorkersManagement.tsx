'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  ExternalLink,
  Shield,
  FileText,
  CheckCircle2,
  Clock,
  Briefcase,
  AlertCircle,
  X,
  UserX,
  MoreVertical,
} from 'lucide-react';

export interface WorkerAssignmentStats {
  total: number;
  assigned: number;
  in_progress: number;
  completed: number;
  skipped: number;
  cancelled?: number;
}

export interface WorkerProfileData {
  cvUrl?: string | null;
  skills?: string[] | null;
  experienceYears?: number | null;
  education?: string | null;
  preferredRoles?: string[] | null;
  preferredLocations?: string[] | null;
  availability?: 'immediate' | 'part_time' | 'unavailable' | string | null;
  notes?: string | null;
  updatedAt?: string | null;
}

export interface AdminWorkerItem {
  memberId: string;
  userId: string;
  role: 'owner' | 'admin' | 'worker';
  joinedAt: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  profile: WorkerProfileData | null;
  assignmentStats: WorkerAssignmentStats;
}

interface WorkersManagementProps {
  organizationId: string | null;
  organizationName?: string;
  isPlatformAdmin?: boolean;
}

export const WorkersManagement: React.FC<WorkersManagementProps> = ({
  organizationId,
  organizationName,
}) => {
  const [workers, setWorkers] = useState<AdminWorkerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('all');

  // Drawer / Modal inspection state
  const [selectedWorker, setSelectedWorker] = useState<AdminWorkerItem | null>(null);

  // Role edit modal state
  const [editingMember, setEditingMember] = useState<AdminWorkerItem | null>(null);
  const [newRole, setNewRole] = useState<'owner' | 'admin' | 'worker'>('worker');
  const [updatingRole, setUpdatingRole] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  // Remove confirmation modal state
  const [removingMember, setRemovingMember] = useState<AdminWorkerItem | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const fetchWorkers = useCallback(async () => {
    if (!organizationId) {
      setWorkers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/workers?organizationId=${organizationId}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError({
          status: res.status,
          message: json.error || `Server returned HTTP ${res.status}`,
        });
        setWorkers([]);
        return;
      }

      const json = await res.json();
      setWorkers(json.data || []);
    } catch (err: any) {
      setError({
        status: 0,
        message: err.message || 'Network error fetching organization workers.',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  // Handle role modification
  const handleUpdateRole = async () => {
    if (!editingMember || !organizationId) return;
    setUpdatingRole(true);
    setRoleError(null);

    try {
      const res = await fetch(`/api/organizations/${organizationId}/members/${editingMember.memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Failed to update role (HTTP ${res.status})`);
      }

      // Refresh list and close
      setEditingMember(null);
      await fetchWorkers();
    } catch (err: any) {
      setRoleError(err.message || 'Error updating member role.');
    } finally {
      setUpdatingRole(false);
    }
  };

  // Handle member removal
  const handleRemoveMember = async () => {
    if (!removingMember || !organizationId) return;
    setIsRemoving(true);
    setRemoveError(null);

    try {
      const res = await fetch(`/api/organizations/${organizationId}/members/${removingMember.memberId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Failed to remove member (HTTP ${res.status})`);
      }

      setRemovingMember(null);
      await fetchWorkers();
    } catch (err: any) {
      setRemoveError(err.message || 'Error removing member.');
    } finally {
      setIsRemoving(false);
    }
  };

  // Workload summary calculations
  const totalWorkers = workers.length;
  const activeWorkersCount = workers.filter(
    (w) => w.assignmentStats.assigned > 0 || w.assignmentStats.in_progress > 0
  ).length;
  const totalCompletedTasks = workers.reduce((acc, w) => acc + w.assignmentStats.completed, 0);
  const immediateAvailableCount = workers.filter(
    (w) => w.profile?.availability === 'immediate'
  ).length;

  // Filtering
  const filteredWorkers = workers.filter((w) => {
    const nameMatch = (w.fullName || '').toLowerCase().includes(searchQuery.toLowerCase());
    const emailMatch = (w.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    const skillsMatch = (w.profile?.skills || []).some((s) =>
      s.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const matchesSearch = nameMatch || emailMatch || skillsMatch;
    const matchesRole = roleFilter === 'all' || w.role === roleFilter;
    const matchesAvail =
      availabilityFilter === 'all' || w.profile?.availability === availabilityFilter;

    return matchesSearch && matchesRole && matchesAvail;
  });

  if (!organizationId) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <Users size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px' }}>
          Select an Organization
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Please select an organization in the header switcher to manage its workforce.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Workload KPI Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Workforce</span>
            <Users size={20} color="#6366f1" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{totalWorkers}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Registered members</div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Active Dispatched</span>
            <Clock size={20} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{activeWorkersCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Workers with active tasks</div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Completed Applications</span>
            <CheckCircle2 size={20} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{totalCompletedTasks}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Across all members</div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Immediate Availability</span>
            <Briefcase size={20} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{immediateAvailableCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ready for dispatch</div>
        </div>
      </div>

      {/* Main Roster Card */}
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
                placeholder="Search workers by name, email, or skill..."
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

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="all">All Roles</option>
              <option value="owner">Owners</option>
              <option value="admin">Admins</option>
              <option value="worker">Workers</option>
            </select>

            {/* Availability Filter */}
            <select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="all">All Availability</option>
              <option value="immediate">Immediate</option>
              <option value="part_time">Part-Time</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>

          <button
            onClick={fetchWorkers}
            disabled={loading}
            className="btn btn-secondary"
            style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
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
            <button onClick={fetchWorkers} className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem' }}>
              Retry
            </button>
          </div>
        )}

        {/* Roster Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Worker</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Role</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Availability</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Active Tasks</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Completed</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Joined</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && workers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading workforce roster…
                  </td>
                </tr>
              ) : filteredWorkers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No workers matching the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredWorkers.map((w) => {
                  const initial = (w.fullName || w.email || 'W').charAt(0).toUpperCase();
                  const availability = w.profile?.availability || 'immediate';

                  return (
                    <tr
                      key={w.memberId}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Worker Profile Info */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: 'var(--accent-gradient)',
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.9rem',
                              flexShrink: 0,
                            }}
                          >
                            {initial}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                              {w.fullName || 'Unnamed Worker'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {w.email || 'No email'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
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
                              w.role === 'owner'
                                ? 'rgba(245, 158, 11, 0.15)'
                                : w.role === 'admin'
                                ? 'rgba(99, 102, 241, 0.15)'
                                : 'rgba(255, 255, 255, 0.06)',
                            color:
                              w.role === 'owner'
                                ? '#f59e0b'
                                : w.role === 'admin'
                                ? '#818cf8'
                                : 'var(--text-muted)',
                          }}
                        >
                          <Shield size={12} /> {w.role}
                        </span>
                      </td>

                      {/* Availability */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            textTransform: 'capitalize',
                            background:
                              availability === 'immediate'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : availability === 'part_time'
                                ? 'rgba(245, 158, 11, 0.15)'
                                : 'rgba(156, 163, 175, 0.15)',
                            color:
                              availability === 'immediate'
                                ? '#34d399'
                                : availability === 'part_time'
                                ? '#fbbf24'
                                : '#9ca3af',
                          }}
                        >
                          {availability.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Active Tasks */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {w.assignmentStats.assigned + w.assignmentStats.in_progress}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
                          ({w.assignmentStats.in_progress} in progress)
                        </span>
                      </td>

                      {/* Completed */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontWeight: 700, color: '#10b981' }}>
                          {w.assignmentStats.completed}
                        </span>
                      </td>

                      {/* Joined Date */}
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(w.joinedAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            onClick={() => setSelectedWorker(w)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            title="Inspect Profile & CV"
                          >
                            <FileText size={13} />
                            <span>Profile</span>
                          </button>

                          <button
                            onClick={() => {
                              setEditingMember(w);
                              setNewRole(w.role);
                              setRoleError(null);
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            title="Edit Role"
                          >
                            Role
                          </button>

                          {w.role !== 'owner' && (
                            <button
                              onClick={() => {
                                setRemovingMember(w);
                                setRemoveError(null);
                              }}
                              className="btn btn-secondary"
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.75rem',
                                color: '#ef4444',
                                borderColor: 'rgba(239, 68, 68, 0.3)',
                              }}
                              title="Remove Member"
                            >
                              <UserX size={13} />
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

      {/* Worker Details Drawer / Modal */}
      {selectedWorker && (
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
          onClick={() => setSelectedWorker(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: '560px',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: 'var(--accent-gradient)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    color: '#ffffff',
                    fontSize: '1.1rem',
                  }}
                >
                  {(selectedWorker.fullName || selectedWorker.email || 'W').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                    {selectedWorker.fullName || 'Unnamed Worker'}
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {selectedWorker.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedWorker(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Workload Stats Bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                padding: '12px',
                background: 'var(--bg-primary)',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Assigned</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{selectedWorker.assignmentStats.assigned}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>In Progress</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f59e0b' }}>
                  {selectedWorker.assignmentStats.in_progress}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Completed</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>
                  {selectedWorker.assignmentStats.completed}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Skipped</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#9ca3af' }}>
                  {selectedWorker.assignmentStats.skipped}
                </div>
              </div>
            </div>

            {/* Skills & Attributes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Skills
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {selectedWorker.profile?.skills && selectedWorker.profile.skills.length > 0 ? (
                    selectedWorker.profile.skills.map((skill, i) => (
                      <span
                        key={i}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'rgba(99, 102, 241, 0.12)',
                          color: '#818cf8',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No skills listed.</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Experience</span>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {selectedWorker.profile?.experienceYears ? `${selectedWorker.profile.experienceYears} Years` : 'Not specified'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Availability</span>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', textTransform: 'capitalize' }}>
                    {selectedWorker.profile?.availability?.replace('_', ' ') || 'Immediate'}
                  </div>
                </div>
              </div>

              {selectedWorker.profile?.education && (
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Education</span>
                  <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>{selectedWorker.profile.education}</div>
                </div>
              )}

              {selectedWorker.profile?.notes && (
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Internal Notes</span>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      background: 'var(--bg-primary)',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      marginTop: '4px',
                      border: '1px solid var(--border-color)',
                      lineHeight: 1.5,
                    }}
                  >
                    {selectedWorker.profile.notes}
                  </div>
                </div>
              )}

              {selectedWorker.profile?.cvUrl && (
                <div>
                  <a
                    href={selectedWorker.profile.cvUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
                  >
                    <FileText size={15} />
                    <span>View CV / Resume</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Role Modifier Modal */}
      {editingMember && (
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
          onClick={() => setEditingMember(null)}
        >
          <div
            className="card"
            style={{ maxWidth: '420px', width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Update Member Role</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Change permissions for <strong>{editingMember.fullName || editingMember.email}</strong>
            </p>

            {roleError && (
              <div
                style={{
                  padding: '8px 12px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                }}
              >
                {roleError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(['worker', 'admin', 'owner'] as const).map((roleOption) => (
                <label
                  key={roleOption}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: newRole === roleOption ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-primary)',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  <input
                    type="radio"
                    name="roleOption"
                    value={roleOption}
                    checked={newRole === roleOption}
                    onChange={() => setNewRole(roleOption)}
                  />
                  <span>{roleOption}</span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={() => setEditingMember(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 14px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRole}
                disabled={updatingRole}
                className="btn btn-primary"
                style={{ padding: '8px 16px' }}
              >
                {updatingRole ? 'Updating…' : 'Save Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {removingMember && (
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
          onClick={() => setRemovingMember(null)}
        >
          <div
            className="card"
            style={{ maxWidth: '420px', width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444' }}>Remove Member</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Are you sure you want to remove <strong>{removingMember.fullName || removingMember.email}</strong> from{' '}
              <strong>{organizationName || 'this organization'}</strong>? They will lose access to all dispatched assignments.
            </p>

            {removeError && (
              <div
                style={{
                  padding: '8px 12px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                }}
              >
                {removeError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={() => setRemovingMember(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 14px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveMember}
                disabled={isRemoving}
                className="btn btn-secondary"
                style={{
                  padding: '8px 16px',
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                }}
              >
                {isRemoving ? 'Removing…' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
