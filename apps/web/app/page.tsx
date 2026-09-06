'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/Header';
import { FiltersSidebar, type FilterOptions, type ActiveFilters } from '@/components/FiltersSidebar';
import { JobFeedCard } from '@/components/JobFeedCard';
import { JobInspectorPane } from '@/components/JobInspectorPane';
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
  SlidersHorizontal,
  ArrowUpDown,
  Briefcase,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'feed' | 'saved' | 'applications' | 'alerts'>('feed');
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [savedJobs, setSavedJobs] = useState<any[]>([]);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [pendingSaveIds, setPendingSaveIds] = useState<Set<string>>(new Set());
  const [applications, setApplications] = useState<any[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());

  // Helper to parse URL params into filter state
  const parseFiltersFromUrl = (): {
    parsedFilters: ActiveFilters;
    parsedSort: 'posted_at_desc' | 'posted_at_asc' | 'salary_desc';
    parsedJobId: string | null;
  } => {
    if (typeof window === 'undefined') {
      return {
        parsedFilters: {
          search: '',
          selectedFunctions: new Set(),
          selectedPlatforms: new Set(),
          selectedWorkplaces: new Set(),
          selectedEmployments: new Set(),
          selectedCountries: new Set(),
          salaryMin: '',
          selectedCurrency: '',
          hasSalaryOnly: false,
          datePreset: 'all',
          isRemoteOnly: false,
        },
        parsedSort: 'posted_at_desc',
        parsedJobId: null,
      };
    }

    const sp = new URLSearchParams(window.location.search);
    const search = sp.get('q') || sp.get('search') || '';
    const fn = sp.get('function') || sp.get('job_function') || '';
    const ats = sp.get('ats') || sp.get('ats_platform') || '';
    const wp = sp.get('workplace') || '';
    const emp = sp.get('employment') || '';
    const ctry = sp.get('country') || sp.get('location_country') || '';
    const salMin = sp.get('salary_min') || '';
    const hasSal = sp.get('has_salary') === 'true';
    const datePre = sp.get('date_preset') || 'all';
    const isRem = sp.get('is_remote') === 'true' || sp.get('workplace') === 'remote';
    const sortVal = sp.get('sort');
    const parsedSort = (sortVal === 'posted_at_asc' || sortVal === 'salary_desc') ? sortVal : 'posted_at_desc';
    const parsedJobId = sp.get('job') || null;

    return {
      parsedFilters: {
        search,
        selectedFunctions: new Set(fn.split(',').map((s) => s.trim()).filter(Boolean)),
        selectedPlatforms: new Set(ats.split(',').map((s) => s.trim()).filter(Boolean)),
        selectedWorkplaces: new Set(wp.split(',').map((s) => s.trim()).filter(Boolean)),
        selectedEmployments: new Set(emp.split(',').map((s) => s.trim()).filter(Boolean)),
        selectedCountries: new Set(ctry.split(',').map((s) => s.trim()).filter(Boolean)),
        salaryMin: salMin,
        selectedCurrency: '',
        hasSalaryOnly: hasSal,
        datePreset: datePre,
        isRemoteOnly: isRem,
      },
      parsedSort,
      parsedJobId,
    };
  };

  // Toast feedback
  const [toast, setToast] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Filter options & Active filters initialized from URL
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [filters, setFilters] = useState<ActiveFilters>(() => parseFiltersFromUrl().parsedFilters);
  const [sortOrder, setSortOrder] = useState<'posted_at_desc' | 'posted_at_asc' | 'salary_desc'>(
    () => parseFiltersFromUrl().parsedSort
  );
  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    () => parseFiltersFromUrl().parsedJobId
  );
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  // Authoritative Active Roster Derivation (UX-02)
  // Applied jobs leave the active jobs roster based on authoritative backend application state
  const activeRosterJobs = useMemo(() => {
    return jobs.filter((job) => !appliedJobIds.has(job.id));
  }, [jobs, appliedJobIds]);

  const selectedJob = useMemo(() => {
    const currentList = activeTab === 'feed' ? activeRosterJobs : activeTab === 'saved' ? savedJobs.map((s) => s.jobs).filter(Boolean) : jobs;
    if (!selectedJobId) return currentList[0] || null;
    return currentList.find((j) => j.id === selectedJobId) || currentList[0] || null;
  }, [selectedJobId, activeTab, activeRosterJobs, savedJobs, jobs]);

  const selectedIndex = useMemo(() => {
    if (!selectedJob) return -1;
    const currentList = activeTab === 'feed' ? activeRosterJobs : jobs;
    return currentList.findIndex((j) => j.id === selectedJob.id);
  }, [selectedJob, activeTab, activeRosterJobs, jobs]);

  // Pagination state
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modals state
  const [modalJob, setModalJob] = useState<any | null>(null);
  const [trackingJob, setTrackingJob] = useState<any | null>(null);

  const showToast = useCallback((type: 'error' | 'success', text: string) => {
    setToast({ type, text });
    setTimeout(() => {
      setToast((current) => (current?.text === text ? null : current));
    }, 4000);
  }, []);

  // Fetch filter metadata on mount
  useEffect(() => {
    const fetchFilterMeta = async () => {
      try {
        const res = await fetch('/api/jobs/filters');
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setFilterOptions(json.data);
          }
        }
      } catch (err) {
        console.debug('Filter metadata fetch notice:', err);
      }
    };
    fetchFilterMeta();
  }, []);

  // Fetch feed jobs with append-only pagination & deduplication (UX-01)
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
        params.set('limit', '25');

        if (filters.search.trim()) params.set('q', filters.search.trim());
        if (filters.selectedFunctions.size > 0) {
          params.set('function', Array.from(filters.selectedFunctions).join(','));
        }
        if (filters.selectedPlatforms.size > 0) {
          params.set('ats', Array.from(filters.selectedPlatforms).join(','));
        }
        if (filters.selectedWorkplaces.size > 0) {
          params.set('workplace', Array.from(filters.selectedWorkplaces).join(','));
        }
        if (filters.selectedEmployments.size > 0) {
          params.set('employment', Array.from(filters.selectedEmployments).join(','));
        }
        if (filters.selectedCountries.size > 0) {
          params.set('country', Array.from(filters.selectedCountries).join(','));
        }
        if (filters.salaryMin) params.set('salary_min', filters.salaryMin);
        if (filters.hasSalaryOnly) params.set('has_salary', 'true');
        if (filters.datePreset && filters.datePreset !== 'all') params.set('date_preset', filters.datePreset);
        if (filters.isRemoteOnly) params.set('is_remote', 'true');
        params.set('sort', sortOrder);

        if (!resetCursor && cursor) params.set('cursor', cursor);

        const res = await fetch(`/api/jobs/feed?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Feed API returned status ${res.status}`);
        }
        const data = await res.json();

        if (data.data) {
          if (resetCursor) {
            setJobs(data.data || []);
            if (data.data.length > 0 && !selectedJobId) {
              setSelectedJobId(data.data[0].id);
            }
          } else {
            // Append-only pagination: preserve existing jobs and append unique new cards (UX-01)
            setJobs((prev) => {
              const existingIds = new Set(prev.map((j) => j.id));
              const incoming = data.data || [];
              const uniqueIncoming = incoming.filter((j: any) => !existingIds.has(j.id));
              return [...prev, ...uniqueIncoming];
            });
          }
          setCursor(data.meta?.pagination?.next_cursor || data.pagination?.next_cursor || null);
          setHasMore(Boolean(data.meta?.pagination?.has_more || data.pagination?.has_more));
        }
      } catch (err: any) {
        console.error('Error fetching jobs feed:', err);
        if (resetCursor) {
          setFetchError(err?.message || 'Failed to load jobs feed. Please try again.');
        } else {
          // Preserve loaded cards on subsequent pagination failure (UX-01)
          showToast('error', 'Failed to load next page of jobs.');
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [filters, sortOrder, cursor, selectedJobId, showToast]
  );

  // Trigger feed reload ONLY on filter/sort change (NOT on selectedJobId change!) (UX-01)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFeedJobs(true);
    }, 200);
    return () => clearTimeout(timer);
  }, [filters, sortOrder]);

  // Sync state to URL without resetting feed pagination
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams();
      if (filters.search.trim()) params.set('q', filters.search.trim());
      if (filters.selectedFunctions.size > 0) params.set('function', Array.from(filters.selectedFunctions).join(','));
      if (filters.selectedPlatforms.size > 0) params.set('ats', Array.from(filters.selectedPlatforms).join(','));
      if (filters.selectedWorkplaces.size > 0) params.set('workplace', Array.from(filters.selectedWorkplaces).join(','));
      if (filters.selectedEmployments.size > 0) params.set('employment', Array.from(filters.selectedEmployments).join(','));
      if (filters.selectedCountries.size > 0) params.set('country', Array.from(filters.selectedCountries).join(','));
      if (filters.salaryMin) params.set('salary_min', filters.salaryMin);
      if (filters.hasSalaryOnly) params.set('has_salary', 'true');
      if (filters.datePreset && filters.datePreset !== 'all') params.set('date_preset', filters.datePreset);
      if (filters.isRemoteOnly) params.set('is_remote', 'true');
      if (sortOrder !== 'posted_at_desc') params.set('sort', sortOrder);
      if (selectedJobId) params.set('job', selectedJobId);

      const qs = params.toString();
      const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(null, '', nextUrl);
    }
  }, [filters, sortOrder, selectedJobId]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const { parsedFilters, parsedSort, parsedJobId } = parseFiltersFromUrl();
      setFilters(parsedFilters);
      setSortOrder(parsedSort);
      if (parsedJobId) setSelectedJobId(parsedJobId);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
            setAppliedJobIds(new Set(appsData.data.map((a: any) => a.job_id)));
          }
        }
      } catch (err) {
        console.debug('User data fetch notice:', err);
      }
    };

    loadUserData();
  }, []);

  // Keyboard navigation across job feed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea', 'select'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) {
        return; // Don't intercept when typing in form controls
      }

      const list = activeTab === 'feed' ? activeRosterJobs : jobs;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < list.length - 1) {
          setSelectedJobId(list[selectedIndex + 1].id);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectedIndex > 0) {
          setSelectedJobId(list[selectedIndex - 1].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, activeTab, activeRosterJobs, jobs]);

  // Handle Optimistic Save / Unsave
  const handleToggleSave = async (jobId: string) => {
    if (pendingSaveIds.has(jobId)) return;

    const isCurrentlySaved = savedJobIds.has(jobId);
    const previousSavedIds = new Set(savedJobIds);
    const previousSavedJobs = [...savedJobs];

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
      setSavedJobIds(previousSavedIds);
      setSavedJobs(previousSavedJobs);
      showToast('error', isCurrentlySaved ? 'Failed to remove saved job.' : 'Failed to save job. Try signing in.');
    } finally {
      setPendingSaveIds((prev) => {
        const copy = new Set(prev);
        copy.delete(jobId);
        return copy;
      });
    }
  };

  const handleTrackApplication = (job: any) => {
    setTrackingJob(job);
  };

  const handleApplicationSuccess = (createdApp: any) => {
    setApplications((prev) => [createdApp, ...prev]);
    setAppliedJobIds((prev) => new Set(prev).add(createdApp.job_id));
    setTrackingJob(null);
    showToast('success', 'Application recorded in your tracker!');
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      selectedFunctions: new Set<string>(),
      selectedPlatforms: new Set<string>(),
      selectedWorkplaces: new Set<string>(),
      selectedEmployments: new Set<string>(),
      selectedCountries: new Set<string>(),
      salaryMin: '',
      selectedCurrency: '',
      hasSalaryOnly: false,
      datePreset: 'all',
      isRemoteOnly: false,
    });
  };

  const handleNextJob = () => {
    const list = activeTab === 'feed' ? activeRosterJobs : jobs;
    if (selectedIndex >= 0 && selectedIndex < list.length - 1) {
      setSelectedJobId(list[selectedIndex + 1].id);
    }
  };

  const handlePrevJob = () => {
    const list = activeTab === 'feed' ? activeRosterJobs : jobs;
    if (selectedIndex > 0) {
      setSelectedJobId(list[selectedIndex - 1].id);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-app)' }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: toast.type === 'error' ? 'var(--danger-surface)' : 'var(--success-surface)',
            border: `1px solid ${toast.type === 'error' ? 'var(--danger-border)' : 'var(--success-border)'}`,
            color: toast.type === 'error' ? 'var(--danger-text)' : 'var(--success-text)',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: '8px' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Header */}
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as any)}
        savedCount={savedJobs.length}
        applicationCount={applications.length}
      />

      {/* Primary 3-Pane Container */}
      <div style={{ flex: 1, display: 'flex', maxWidth: '1800px', margin: '0 auto', width: '100%' }}>
        {activeTab === 'feed' && (
          <>
            {/* Left Pane: Filters & Taxonomy */}
            <FiltersSidebar
              options={filterOptions}
              filters={filters}
              onFilterChange={setFilters}
              onReset={handleResetFilters}
              totalActiveCount={filterOptions?.total_active_jobs || 1095}
              filteredCount={jobs.length}
              isOpenMobile={isMobileFiltersOpen}
              onCloseMobile={() => setIsMobileFiltersOpen(false)}
            />

            {/* Center Pane: Rapid Job Stream */}
            <main
              style={{
                flex: '1',
                minWidth: '380px',
                maxWidth: '650px',
                height: 'calc(100vh - 120px)',
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {/* Stream Sub-Header: Controls & Status */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {isLoading ? 'Scanning Feed...' : `${activeRosterJobs.length} Active Opportunities`}
                  </span>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Direct ATS & Aggregated Sources • Deduplicated • Continuously Synced
                    {appliedJobIds.size > 0 && ` • (${appliedJobIds.size} applied excluded)`}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as any)}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="posted_at_desc">Newest First</option>
                    <option value="posted_at_asc">Oldest First</option>
                    <option value="salary_desc">Highest Salary</option>
                  </select>
                </div>
              </div>

              {/* Feed Content */}
              {isLoading && jobs.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Skeleton variant="card" count={4} />
                </div>
              ) : fetchError ? (
                <ErrorState
                  title="Unable to load jobs feed"
                  userMessage="We couldn't load the jobs feed right now. Please check your connection and try again."
                  diagnostic={fetchError}
                  onRetry={() => fetchFeedJobs(true)}
                />
              ) : jobs.length === 0 ? (
                <EmptyState
                  title="No matching jobs found"
                  description="Try expanding your filters or clearing search criteria to see more direct ATS postings."
                  actionLabel="Reset All Filters"
                  onAction={handleResetFilters}
                />
              ) : activeRosterJobs.length === 0 ? (
                <EmptyState
                  icon={<CheckSquare size={32} color="var(--status-success-text)" />}
                  title="All Current Opportunities Applied"
                  description="You have applied to all loaded jobs in this view. Review them in your Applications tracker or load additional opportunities."
                  actionLabel="View Applications"
                  onAction={() => setActiveTab('applications')}
                  actionSlot={
                    hasMore ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => fetchFeedJobs(false)}
                        isLoading={isLoadingMore}
                        style={{ marginTop: 'var(--space-3)' }}
                      >
                        {isLoadingMore ? 'Loading More...' : 'Load More Jobs'}
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {activeRosterJobs.map((job) => (
                      <JobFeedCard
                        key={job.id}
                        job={job}
                        isSelected={selectedJob?.id === job.id}
                        onSelect={() => setSelectedJobId(job.id)}
                        isSaved={savedJobIds.has(job.id)}
                        onToggleSave={(e, id) => handleToggleSave(id)}
                        isApplied={appliedJobIds.has(job.id)}
                        onTrackApplication={(e, j) => handleTrackApplication(j)}
                      />
                    ))}
                  </div>

                  {hasMore && (
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => fetchFeedJobs(false)}
                      isLoading={isLoadingMore}
                      style={{
                        margin: 'var(--space-3) 0 var(--space-6)',
                        width: '100%',
                      }}
                    >
                      {isLoadingMore ? 'Loading More...' : 'Load More Jobs'}
                    </Button>
                  )}
                </>
              )}
            </main>

            {/* Right Pane: Deep Job Inspector */}
            <JobInspectorPane
              job={selectedJob}
              isSaved={selectedJob ? savedJobIds.has(selectedJob.id) : false}
              onToggleSave={handleToggleSave}
              isApplied={selectedJob ? appliedJobIds.has(selectedJob.id) : false}
              onTrackApplication={handleTrackApplication}
              onNextJob={handleNextJob}
              onPrevJob={handlePrevJob}
              hasNext={selectedIndex >= 0 && selectedIndex < (activeTab === 'feed' ? activeRosterJobs.length : jobs.length) - 1}
              hasPrev={selectedIndex > 0}
            />
          </>
        )}

        {/* Saved Jobs Tab */}
        {activeTab === 'saved' && (
          <div style={{ flex: 1, padding: '32px 40px', maxWidth: '1000px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Saved Jobs ({savedJobs.length})</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Your bookmarked opportunities across all integrated ATS platforms.
            </p>

            {savedJobs.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)' }}>
                <Bookmark size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>No saved jobs yet</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Click the bookmark icon on any job in the feed to save it here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {savedJobs.map((item) => {
                  const job = item.jobs || item;
                  return (
                    <JobFeedCard
                      key={job.id}
                      job={job}
                      isSelected={false}
                      onSelect={() => setModalJob(job)}
                      isSaved={true}
                      onToggleSave={(e, id) => handleToggleSave(id)}
                      isApplied={appliedJobIds.has(job.id)}
                      onTrackApplication={(e, j) => handleTrackApplication(j)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Application Tracker Tab */}
        {activeTab === 'applications' && (
          <div style={{ flex: 1, padding: '32px 40px', maxWidth: '1000px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>My Applications ({applications.length})</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Track the status of your direct applications and pipeline stages.
            </p>

            {applications.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)' }}>
                <CheckSquare size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>No applications tracked yet</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Click &quot;Mark Applied&quot; on any job to add it to your tracker.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {applications.map((app) => (
                  <div
                    key={app.id}
                    style={{
                      padding: '16px 20px',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
                        {app.jobs?.display_title || app.jobs?.canonical_title || 'Applied Position'}
                      </h4>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '12px' }}>
                        <span>{app.jobs?.companies?.name || 'Verified Employer'}</span>
                        <span>•</span>
                        <span>Applied on {new Date(app.created_at || Date.now()).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--success-surface)',
                        color: 'var(--success-text)',
                        border: '1px solid var(--success-border)',
                      }}
                    >
                      {app.status || 'Applied'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div style={{ flex: 1, padding: '32px 40px', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '4px' }}>Job Alerts</h2>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Get notified instantly when new roles match your criteria.</p>
              </div>
              <button
                onClick={() => setIsAlertModalOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 16px',
                  backgroundColor: 'var(--brand-primary)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Plus size={16} />
                Create Alert
              </button>
            </div>
            <JobAlertManager />
          </div>
        )}
      </div>

      {/* Application Tracker Modal */}
      {trackingJob && (
        <ApplicationTrackerModal
          job={trackingJob}
          onClose={() => setTrackingJob(null)}
          onSubmit={async (data) => {
            const res = await fetch('/api/applications', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            });
            if (!res.ok) {
              const json = await res.json().catch(() => ({}));
              throw new Error(json.error || 'Failed to record application');
            }
            const json = await res.json();
            if (json.data) {
              handleApplicationSuccess(json.data);
            }
          }}
        />
      )}

      {/* Modal Job Details (Fallback for Saved Jobs view) */}
      {modalJob && (
        <JobDetailsModal
          job={modalJob}
          onClose={() => setModalJob(null)}
          isSaved={savedJobIds.has(modalJob.id)}
          onToggleSave={handleToggleSave}
          onTrackApplication={handleTrackApplication}
        />
      )}

      {/* Alert Modal */}
      {isAlertModalOpen && (
        <JobAlertModal
          isOpen={isAlertModalOpen}
          onClose={() => setIsAlertModalOpen(false)}
          onAlertCreated={() => {
            setIsAlertModalOpen(false);
            showToast('success', 'Job alert created successfully!');
          }}
        />
      )}
    </div>
  );
}
