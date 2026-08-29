'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { MetricBar } from '@/components/MetricBar';
import { SearchFilters } from '@/components/SearchFilters';
import { JobCard } from '@/components/JobCard';
import { JobDetailsModal } from '@/components/JobDetailsModal';
import { ApplicationTrackerModal } from '@/components/ApplicationTrackerModal';
import { Sparkles, Bookmark, CheckSquare, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'feed' | 'saved' | 'applications'>('feed');
  const [jobs, setJobs] = useState<any[]>([]);
  const [savedJobs, setSavedJobs] = useState<any[]>([]);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [applications, setApplications] = useState<any[]>([]);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [workplace, setWorkplace] = useState('all');
  const [employment, setEmployment] = useState('all');
  const [salaryMin, setSalaryMin] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('');

  // Pagination state
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Modals state
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [trackingJob, setTrackingJob] = useState<any | null>(null);

  // Scraper status
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeNotification, setScrapeNotification] = useState<string | null>(null);

  // Fetch feed jobs
  const fetchFeedJobs = useCallback(
    async (resetCursor = true) => {
      if (resetCursor) {
        setIsLoading(true);
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
        if (selectedSkill) params.set('skill', selectedSkill);
        if (!resetCursor && cursor) params.set('cursor', cursor);

        const res = await fetch(`/api/jobs/feed?${params.toString()}`);
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
      } catch (err) {
        console.error('Error fetching jobs feed:', err);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [searchQuery, workplace, employment, salaryMin, selectedSkill, cursor]
  );

  // Initial load and filter change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFeedJobs(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, workplace, employment, salaryMin, selectedSkill]);

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

  // Handle Save / Unsave
  const handleToggleSave = async (jobId: string) => {
    const isCurrentlySaved = savedJobIds.has(jobId);
    const newSet = new Set(savedJobIds);

    if (isCurrentlySaved) {
      newSet.delete(jobId);
      setSavedJobIds(newSet);
      setSavedJobs((prev) => prev.filter((item) => (item.jobs?.id || item.job_id) !== jobId));

      try {
        await fetch(`/api/saved?jobId=${jobId}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Error deleting saved job:', err);
      }
    } else {
      newSet.add(jobId);
      setSavedJobIds(newSet);
      const targetJob = jobs.find((j) => j.id === jobId);
      if (targetJob) {
        setSavedJobs((prev) => [{ id: `local-${Date.now()}`, job_id: jobId, jobs: targetJob }, ...prev]);
      }

      try {
        await fetch('/api/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId }),
        });
      } catch (err) {
        console.error('Error saving job:', err);
      }
    }
  };

  // Handle Record Application
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
      if (res.ok) {
        const result = await res.json();
        setApplications((prev) => [result.data, ...prev.filter((a) => a.id !== result.data.id)]);
      }
    } catch (err) {
      console.error('Error saving application:', err);
    }
  };

  // Handle Scraper Trigger
  const handleTriggerScrape = async () => {
    setIsScraping(true);
    setScrapeNotification('Triggering live ATS pipeline sync...');
    try {
      const res = await fetch('/api/admin/scrape/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIdentifier: 'stripe' }),
      });
      const data = await res.json();
      setScrapeNotification('ATS sync run dispatched successfully!');
      setTimeout(() => setScrapeNotification(null), 4000);
      fetchFeedJobs(true);
    } catch (err) {
      setScrapeNotification('Sync failed to dispatch');
      setTimeout(() => setScrapeNotification(null), 3000);
    } finally {
      setIsScraping(false);
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setWorkplace('all');
    setEmployment('all');
    setSalaryMin('');
    setSelectedSkill('');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        savedCount={savedJobs.length}
        applicationCount={applications.length}
        onTriggerScrape={handleTriggerScrape}
        isScraping={isScraping}
      />

      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 80px', width: '100%', flex: 1 }}>
        {/* Notification Toast */}
        {scrapeNotification && (
          <div
            style={{
              margin: '16px 0',
              padding: '12px 20px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(99, 102, 241, 0.2)',
              border: '1px solid var(--accent-primary)',
              color: '#c7d2fe',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <Sparkles size={16} />
            <span>{scrapeNotification}</span>
          </div>
        )}

        {/* Hero & Metrics */}
        {activeTab === 'feed' && (
          <>
            <div style={{ textAlign: 'center', margin: '32px 0 24px' }}>
              <h1
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  marginBottom: '12px',
                }}
              >
                Production-Grade{' '}
                <span
                  style={{
                    background: 'var(--accent-gradient)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  Tech Job Engine
                </span>
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '640px', margin: '0 auto' }}>
                Normalized directly from Greenhouse, Lever, Ashby, and Workday employer ATS endpoints. 100% verified application URLs.
              </p>
            </div>

            <MetricBar totalJobs={jobs.length || 5} totalCompanies={5} />

            <SearchFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              workplace={workplace}
              onWorkplaceChange={setWorkplace}
              employment={employment}
              onEmploymentChange={setEmployment}
              salaryMin={salaryMin}
              onSalaryMinChange={setSalaryMin}
              selectedSkill={selectedSkill}
              onSkillChange={setSelectedSkill}
              onClearFilters={handleClearFilters}
            />
          </>
        )}

        {/* TAB 1: LIVE FEED */}
        {activeTab === 'feed' && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {searchQuery ? `Search results for "${searchQuery}"` : 'Fresh Job Openings'}
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Showing {jobs.length} postings
              </span>
            </div>

            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                <Loader2 size={36} color="var(--accent-primary)" className="animate-spin" />
              </div>
            ) : jobs.length === 0 ? (
              <div
                className="glass-card"
                style={{
                  padding: '60px 24px',
                  textAlign: 'center',
                }}
              >
                <AlertCircle size={40} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>No matching postings found</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto 20px' }}>
                  Try resetting your search query, location, or salary filters to explore available roles.
                </p>
                <button onClick={handleClearFilters} className="btn btn-primary">
                  Clear Filters
                </button>
              </div>
            ) : (
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

                {hasMore && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
                    <button
                      onClick={() => fetchFeedJobs(false)}
                      disabled={isLoadingMore}
                      className="btn btn-secondary"
                      style={{ padding: '12px 32px', fontSize: '0.95rem' }}
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          <span>Loading more jobs...</span>
                        </>
                      ) : (
                        <span>Load More Jobs</span>
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
          <div style={{ marginTop: '24px' }}>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '6px' }}>Saved Jobs</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Your personal bookmarked opportunities.
              </p>
            </div>

            {savedJobs.length === 0 ? (
              <div className="glass-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
                <Bookmark size={40} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>No saved jobs yet</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
                  Click the bookmark icon on any job card in the live feed to save it for later.
                </p>
                <button onClick={() => setActiveTab('feed')} className="btn btn-primary">
                  Browse Live Feed
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
          <div style={{ marginTop: '24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '24px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '6px' }}>
                  Application Tracker
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Track interviews, offers, and statuses across your job applications.
                </p>
              </div>

              <button
                onClick={() => setTrackingJob({ company_name: '', job_title: '', status: 'applied' })}
                className="btn btn-primary"
              >
                <CheckSquare size={16} />
                <span>+ Add Application</span>
              </button>
            </div>

            {applications.length === 0 ? (
              <div className="glass-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
                <CheckSquare size={40} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>No tracked applications yet</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
                  Start tracking your applications directly from job cards or add one manually.
                </p>
                <button onClick={() => setActiveTab('feed')} className="btn btn-primary">
                  Find Jobs to Apply
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '14px' }}>
                {applications.map((app) => (
                  <div
                    key={app.id}
                    className="glass-card"
                    style={{
                      padding: '20px 24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '16px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {app.company_name}
                      </span>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
                        {app.job_title}
                      </h4>
                      {app.notes && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          📝 {app.notes}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span
                        className="badge"
                        style={{
                          background:
                            app.status === 'offer'
                              ? 'rgba(16, 185, 129, 0.2)'
                              : app.status === 'interview'
                              ? 'rgba(99, 102, 241, 0.2)'
                              : app.status === 'rejected'
                              ? 'rgba(239, 68, 68, 0.2)'
                              : 'rgba(245, 158, 11, 0.2)',
                          color:
                            app.status === 'offer'
                              ? '#34d399'
                              : app.status === 'interview'
                              ? '#a5b4fc'
                              : app.status === 'rejected'
                              ? '#f87171'
                              : '#fbbf24',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          padding: '6px 14px',
                          fontSize: '0.8rem',
                          textTransform: 'capitalize',
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
    </div>
  );
}
