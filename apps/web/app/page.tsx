'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { SearchFilters } from '@/components/SearchFilters';
import { JobCard } from '@/components/JobCard';
import { JobDetailsModal } from '@/components/JobDetailsModal';
import { ApplicationTrackerModal } from '@/components/ApplicationTrackerModal';
import { JobAlertModal } from '@/components/alerts/JobAlertModal';
import { JobAlertManager } from '@/components/alerts/JobAlertManager';
import {
  Bookmark,
  CheckSquare,
  Loader2,
  AlertCircle,
  Bell,
  Search,
  Plus,
  CheckCircle2,
  X,
} from 'lucide-react';

function JobCardSkeleton() {
  return (
    <div
      className="job-card-container"
      style={{
        padding: '18px 20px',
        marginBottom: '12px',
        opacity: 0.6,
      }}
      aria-hidden="true"
    >
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-surface-elevated)',
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              width: '120px',
              height: '14px',
              backgroundColor: 'var(--bg-surface-elevated)',
              borderRadius: '4px',
              marginBottom: '8px',
            }}
          />
          <div
            style={{
              width: '60%',
              height: '20px',
              backgroundColor: 'var(--bg-surface-elevated)',
              borderRadius: '4px',
              marginBottom: '10px',
            }}
          />
          <div
            style={{
              width: '40%',
              height: '14px',
              backgroundColor: 'var(--bg-surface-elevated)',
              borderRadius: '4px',
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'feed' | 'saved' | 'applications' | 'alerts'>('feed');
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [savedJobs, setSavedJobs] = useState<any[]>([]);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [pendingSaveIds, setPendingSaveIds] = useState<Set<string>>(new Set());
  const [applications, setApplications] = useState<any[]>([]);

  // Toast feedback
  const [toast, setToast] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [workplace, setWorkplace] = useState('all');
  const [employment, setEmployment] = useState('all');
  const [salaryMin, setSalaryMin] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [hasSalaryOnly, setHasSalaryOnly] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState('');

  // Pagination state
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modals state
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [trackingJob, setTrackingJob] = useState<any | null>(null);

  const showToast = useCallback((type: 'error' | 'success', text: string) => {
    setToast({ type, text });
    setTimeout(() => {
      setToast((current) => (current?.text === text ? null : current));
    }, 4000);
  }, []);

  // Fetch feed jobs
  const fetchFeedJobs = useCallback(
    async (resetCursor = true) => {
      if (resetCursor) {
        setIsLoading(true);
        setFetchError(null);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const params = new URLSearchParams();
        params.set('limit', '15');
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        if (workplace !== 'all') params.set('workplace', workplace);
        if (employment !== 'all') params.set('employment', employment);
        if (salaryMin) params.set('salary_min', salaryMin);
        if (selectedCurrency) params.set('currency', selectedCurrency);
        if (hasSalaryOnly) params.set('has_salary', 'true');
        if (selectedSkill) params.set('skill', selectedSkill);
        if (!resetCursor && cursor) params.set('cursor', cursor);

        const res = await fetch(`/api/jobs/feed?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Feed API returned status ${res.status}`);
        }
        const data = await res.json();

        if (data.data) {
          if (resetCursor) {
            setJobs(data.data);
          } else {
            setJobs((prev) => [...prev, ...data.data]);
          }
          setCursor(data.meta?.pagination?.next_cursor || data.pagination?.next_cursor || null);
          setHasMore(data.meta?.pagination?.has_more || data.pagination?.has_more || false);
        }
      } catch (err: any) {
        console.error('Error fetching jobs feed:', err);
        if (resetCursor) {
          setFetchError(err?.message || 'Failed to load jobs feed. Please try again.');
        } else {
          showToast('error', 'Failed to load next page of jobs.');
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [searchQuery, workplace, employment, salaryMin, selectedCurrency, hasSalaryOnly, selectedSkill, cursor, showToast]
  );

  // Initial load and filter change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFeedJobs(true);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, workplace, employment, salaryMin, selectedCurrency, hasSalaryOnly, selectedSkill]);

  // Load Saved Jobs and Applications
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const [savedRes, appsRes] = await Promise.all([
          fetch('/api/saved'),
          fetch('/api/applications'),
        ]);

        if (savedRes.ok) {
          const savedData = await savedRes.json();
          if (Array.isArray(savedData.data)) {
            setSavedJobs(savedData.data);
            setSavedJobIds(new Set(savedData.data.map((item: any) => item.jobs?.id || item.job_id)));
          }
        }

        if (appsRes.ok) {
          const appsData = await appsRes.json();
          if (Array.isArray(appsData.data)) {
            setApplications(appsData.data);
          }
        }
      } catch (err) {
        console.debug('User data fetch notice:', err);
      }
    };

    loadUserData();
  }, []);

  // Handle Optimistic Save / Unsave with Rollback
  const handleToggleSave = async (jobId: string) => {
    if (pendingSaveIds.has(jobId)) return; // Prevent concurrent duplicate clicks

    const isCurrentlySaved = savedJobIds.has(jobId);
    const previousSavedIds = new Set(savedJobIds);
    const previousSavedJobs = [...savedJobs];

    // Optimistic UI state update
    const newSet = new Set(savedJobIds);
    if (isCurrentlySaved) {
      newSet.delete(jobId);
      setSavedJobIds(newSet);
      setSavedJobs((prev) => prev.filter((item) => (item.jobs?.id || item.job_id) !== jobId));
    } else {
      newSet.add(jobId);
      setSavedJobIds(newSet);
      const targetJob = jobs.find((j) => j.id === jobId);
      if (targetJob) {
        setSavedJobs((prev) => [{ id: `local-${Date.now()}`, job_id: jobId, jobs: targetJob }, ...prev]);
      }
    }

    // Set pending guard
    setPendingSaveIds((prev) => new Set(prev).add(jobId));

    try {
      const res = await fetch(isCurrentlySaved ? `/api/saved?jobId=${jobId}` : '/api/saved', {
        method: isCurrentlySaved ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: isCurrentlySaved ? undefined : JSON.stringify({ jobId }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server returned ${res.status}`);
      }
    } catch (err: any) {
      console.error('Save mutation error:', err);
      // Rollback optimistic state
      setSavedJobIds(previousSavedIds);
      setSavedJobs(previousSavedJobs);
      showToast(
        'error',
        isCurrentlySaved
          ? 'Failed to remove job from saved. Restored previous state.'
          : 'Failed to save job to bookmarks. Restored previous state.'
      );
    } finally {
      setPendingSaveIds((prev) => {
        const updated = new Set(prev);
        updated.delete(jobId);
        return updated;
      });
    }
  };

  // Handle Application Tracker Save with Feedback
  const handleSaveApplication = async (data: {
    jobId?: string;
    companyName: string;
    jobTitle: string;
    status: string;
    notes?: string;
  }) => {
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to save application.');
      }
      const result = await res.json();
      setApplications((prev) => [result.data, ...prev.filter((a) => a.id !== result.data.id)]);
      showToast('success', `Saved ${data.jobTitle} at ${data.companyName} to application tracker.`);
    } catch (err: any) {
      console.error('Error saving application:', err);
      showToast('error', err?.message || 'Failed to record application. Please try again.');
      throw err;
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setWorkplace('all');
    setEmployment('all');
    setSalaryMin('');
    setSelectedCurrency('');
    setHasSalaryOnly(false);
    setSelectedSkill('');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-app)' }}>
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        savedCount={savedJobs.length}
        applicationCount={applications.length}
      />

      {/* Global Toast Notification */}
      {toast && (
        <aside
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: toast.type === 'error' ? 'var(--danger-surface)' : 'var(--success-surface)',
            border: `1px solid ${toast.type === 'error' ? 'var(--danger-border)' : 'var(--success-border)'}`,
            color: toast.type === 'error' ? 'var(--danger-text)' : 'var(--success-text)',
            boxShadow: 'var(--shadow-lg)',
            fontSize: '0.875rem',
            fontWeight: 500,
            maxWidth: '420px',
          }}
        >
          {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span style={{ flex: 1 }}>{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px' }}
            aria-label="Dismiss message"
          >
            <X size={16} />
          </button>
        </aside>
      )}

      <main style={{ flex: 1, maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '24px 20px 48px' }}>
        {/* TAB 1: JOBS / DISCOVERY FEED */}
        {activeTab === 'feed' && (
          <div>
            {/* Search & Filter Component */}
            <SearchFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              workplace={workplace}
              onWorkplaceChange={setWorkplace}
              employment={employment}
              onEmploymentChange={setEmployment}
              salaryMin={salaryMin}
              onSalaryMinChange={setSalaryMin}
              currency={selectedCurrency}
              onCurrencyChange={setSelectedCurrency}
              hasSalaryOnly={hasSalaryOnly}
              onHasSalaryOnlyChange={setHasSalaryOnly}
              selectedSkill={selectedSkill}
              onSkillChange={setSelectedSkill}
              onClearFilters={handleClearFilters}
              totalResults={jobs.length}
            />

            {/* Results Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {searchQuery ? `Results for "${searchQuery}"` : 'Verified Job Openings'}
                </h1>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {jobs.length > 0 ? `Showing ${jobs.length} postings from direct ATS endpoints` : 'Live opportunity feed'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAlertModalOpen(true)}
                className="btn btn-secondary"
                style={{ fontSize: '0.8125rem', padding: '7px 12px' }}
                title="Create automated alert for this search"
              >
                <Bell size={14} />
                <span>Create Alert</span>
              </button>
            </div>

            {/* Fetch Error Banner */}
            {fetchError && (
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--danger-surface)',
                  border: '1px solid var(--danger-border)',
                  color: 'var(--danger-text)',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={18} />
                  <span style={{ fontSize: '0.875rem' }}>{fetchError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => fetchFeedJobs(true)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8125rem', padding: '5px 12px' }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading State */}
            {isLoading ? (
              <div>
                <JobCardSkeleton />
                <JobCardSkeleton />
                <JobCardSkeleton />
                <JobCardSkeleton />
                <JobCardSkeleton />
              </div>
            ) : jobs.length === 0 ? (
              /* Empty State */
              <div
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '56px 24px',
                  textAlign: 'center',
                }}
              >
                <Search size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '6px' }}>
                  No matching jobs found
                </h2>
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem',
                    maxWidth: '420px',
                    margin: '0 auto 18px',
                  }}
                >
                  Try adjusting your keywords, removing salary constraints, or selecting &quot;All Modes&quot; to discover available opportunities.
                </p>
                <button type="button" onClick={handleClearFilters} className="btn btn-primary">
                  Reset All Filters
                </button>
              </div>
            ) : (
              /* Postings List */
              <div>
                {jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    isSaved={savedJobIds.has(job.id)}
                    onToggleSave={handleToggleSave}
                    onOpenDetails={() => setSelectedJob(job)}
                    onTrackApplication={() => setTrackingJob(job)}
                  />
                ))}

                {/* Pagination Load More */}
                {hasMore && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '28px' }}>
                    <button
                      type="button"
                      onClick={() => fetchFeedJobs(false)}
                      disabled={isLoadingMore}
                      className="btn btn-secondary"
                      style={{ padding: '10px 28px', fontSize: '0.875rem' }}
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Loading next page...</span>
                        </>
                      ) : (
                        <span>Load More Postings</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SAVED JOBS */}
        {activeTab === 'saved' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-primary)' }}>Saved Jobs</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
                Your personal bookmarked positions for quick review and direct application.
              </p>
            </div>

            {savedJobs.length === 0 ? (
              <div
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '56px 24px',
                  textAlign: 'center',
                }}
              >
                <Bookmark size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '6px' }}>
                  No saved jobs yet
                </h2>
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem',
                    maxWidth: '400px',
                    margin: '0 auto 18px',
                  }}
                >
                  Click the bookmark icon on any job card in the main feed to save it to your personal shortlist.
                </p>
                <button type="button" onClick={() => setActiveTab('feed')} className="btn btn-primary">
                  Browse Jobs Feed
                </button>
              </div>
            ) : (
              <div>
                {savedJobs.map((item) => {
                  const job = item.jobs || item;
                  return (
                    <JobCard
                      key={job.id}
                      job={job}
                      isSaved={true}
                      onToggleSave={handleToggleSave}
                      onOpenDetails={() => setSelectedJob(job)}
                      onTrackApplication={() => setTrackingJob(job)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: APPLICATION TRACKER */}
        {activeTab === 'applications' && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Application Tracker
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
                  Manage interviews, stages, and personal notes across your direct applications.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setTrackingJob({ company_name: '', job_title: '', status: 'applied' })}
                className="btn btn-primary"
              >
                <Plus size={16} />
                <span>Add Application</span>
              </button>
            </div>

            {applications.length === 0 ? (
              <div
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '56px 24px',
                  textAlign: 'center',
                }}
              >
                <CheckSquare size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '6px' }}>
                  No tracked applications yet
                </h2>
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem',
                    maxWidth: '400px',
                    margin: '0 auto 18px',
                  }}
                >
                  Track your job applications directly from job cards or add an external application manually.
                </p>
                <button type="button" onClick={() => setActiveTab('feed')} className="btn btn-primary">
                  Explore Openings
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {applications.map((app) => (
                  <div
                    key={app.id}
                    className="job-card-container"
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '14px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {app.company_name}
                      </span>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {app.job_title}
                      </h3>
                      {app.notes && (
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                          Note: {app.notes}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        className="badge"
                        style={{
                          backgroundColor:
                            app.status === 'offer'
                              ? 'var(--success-surface)'
                              : app.status === 'interview'
                              ? 'var(--brand-surface)'
                              : app.status === 'rejected'
                              ? 'var(--danger-surface)'
                              : 'var(--warning-surface)',
                          color:
                            app.status === 'offer'
                              ? 'var(--success-text)'
                              : app.status === 'interview'
                              ? 'var(--brand-text)'
                              : app.status === 'rejected'
                              ? 'var(--danger-text)'
                              : 'var(--warning-text)',
                          border: `1px solid ${
                            app.status === 'offer'
                              ? 'var(--success-border)'
                              : app.status === 'interview'
                              ? 'var(--brand-border)'
                              : app.status === 'rejected'
                              ? 'var(--danger-border)'
                              : 'var(--warning-border)'
                          }`,
                          padding: '4px 10px',
                          textTransform: 'capitalize',
                          fontSize: '0.75rem',
                        }}
                      >
                        {app.status}
                      </span>

                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(app.applied_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: JOB ALERTS */}
        {activeTab === 'alerts' && (
          <div>
            <JobAlertManager />
          </div>
        )}
      </main>

      {/* MODALS */}
      {selectedJob && (
        <JobDetailsModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          isSaved={savedJobIds.has(selectedJob.id)}
          onToggleSave={handleToggleSave}
          onTrackApplication={() => {
            setTrackingJob(selectedJob);
            setSelectedJob(null);
          }}
        />
      )}

      {trackingJob && (
        <ApplicationTrackerModal
          job={trackingJob}
          onClose={() => setTrackingJob(null)}
          onSubmit={handleSaveApplication}
        />
      )}

      <JobAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        initialCriteria={{
          query: searchQuery,
          remoteType: workplace === 'all' ? undefined : workplace,
          employmentType: employment === 'all' ? undefined : employment,
        }}
      />
    </div>
  );
}
