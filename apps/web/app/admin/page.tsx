'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  LayoutDashboard,
  Building2,
  PlusCircle,
  ArrowLeft,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Lock,
  ShieldAlert,
  ServerCrash,
  LogIn,
} from 'lucide-react';
import { AdminMetricsOverview, AdminMetricsData } from '@/components/admin/AdminMetricsOverview';
import { SourceManagementTable, AdminCompanySource } from '@/components/admin/SourceManagementTable';
import { SourceOnboardingWizard } from '@/components/admin/SourceOnboardingWizard';
import { createClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Error types for explicit API error state rendering
// ---------------------------------------------------------------------------
type ApiErrorState = {
  status: number;
  message: string;
} | null;

// ---------------------------------------------------------------------------
// Auth states
// ---------------------------------------------------------------------------
type AuthState =
  | { state: 'loading' }
  | { state: 'unauthenticated' }
  | { state: 'forbidden'; email: string }
  | { state: 'authorized'; email: string };

// ---------------------------------------------------------------------------
// Admin Auth Gate
// ---------------------------------------------------------------------------
function useAdminAuth(): AuthState {
  const [authState, setAuthState] = useState<AuthState>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function checkAdmin() {
      try {
        const supabase = createClient();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (cancelled) return;

        if (authError || !user) {
          setAuthState({ state: 'unauthenticated' });
          return;
        }

        // Check admin role via profiles table
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, role, email')
          .eq('id', user.id)
          .single();

        if (cancelled) return;

        if (profileError || !profile || (profile as any).role !== 'admin') {
          setAuthState({ state: 'forbidden', email: user.email || 'unknown' });
          return;
        }

        setAuthState({ state: 'authorized', email: user.email || (profile as any).email });
      } catch {
        if (!cancelled) {
          setAuthState({ state: 'unauthenticated' });
        }
      }
    }

    checkAdmin();
    return () => {
      cancelled = true;
    };
  }, []);

  return authState;
}

// ---------------------------------------------------------------------------
// Error Banner Component
// ---------------------------------------------------------------------------
function ErrorBanner({
  error,
  context,
  onRetry,
}: {
  error: ApiErrorState;
  context: string;
  onRetry?: () => void;
}) {
  if (!error) return null;

  const config: Record<number, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
    401: {
      icon: <Lock size={18} />,
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.3)',
    },
    403: {
      icon: <ShieldAlert size={18} />,
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.3)',
    },
    409: {
      icon: <AlertTriangle size={18} />,
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.3)',
    },
    500: {
      icon: <ServerCrash size={18} />,
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.3)',
    },
  };

  const style = config[error.status] || config[500]!;

  return (
    <div
      role="alert"
      data-error-status={error.status}
      data-error-context={context}
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: '8px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        color: style.color,
        fontSize: '0.85rem',
        fontWeight: 600,
      }}
    >
      {style.icon}
      <span style={{ flex: 1 }}>
        {context}: {error.message} (HTTP {error.status})
      </span>
      {onRetry && error.status !== 409 && (
        <button
          onClick={onRetry}
          className="btn btn-secondary"
          style={{ padding: '4px 12px', fontSize: '0.75rem' }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading Gate Screen
// ---------------------------------------------------------------------------
function AdminLoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'var(--accent-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            animation: 'pulse 1.5s infinite',
          }}
        >
          <ShieldCheck size={24} color="#ffffff" />
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Verifying administrator access…
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unauthenticated Gate Screen
// ---------------------------------------------------------------------------
function AdminUnauthenticatedScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '420px',
          width: '100%',
          padding: '40px 32px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            background: 'rgba(245, 158, 11, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <Lock size={28} color="#f59e0b" />
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>
          Authentication Required
        </h1>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
            marginBottom: '24px',
            lineHeight: 1.5,
          }}
        >
          You must sign in with an administrator account to access the Admin Control Plane.
        </p>
        <Link
          href="/"
          className="btn btn-primary"
          style={{ display: 'inline-flex', padding: '10px 24px' }}
        >
          <LogIn size={16} />
          <span>Sign In</span>
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forbidden Gate Screen
// ---------------------------------------------------------------------------
function AdminForbiddenScreen({ email }: { email: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '40px 32px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            background: 'rgba(239, 68, 68, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <ShieldAlert size={28} color="#ef4444" />
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>
          Access Forbidden
        </h1>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
            marginBottom: '8px',
            lineHeight: 1.5,
          }}
        >
          Signed in as <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>
        </p>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
            marginBottom: '24px',
            lineHeight: 1.5,
          }}
        >
          Your account does not have administrator privileges (
          <code style={{ fontSize: '0.8rem' }}>profiles.role = &apos;admin&apos;</code> required).
          Contact a platform administrator for access.
        </p>
        <Link
          href="/"
          className="btn btn-secondary"
          style={{ display: 'inline-flex', padding: '10px 24px' }}
        >
          <ArrowLeft size={16} />
          <span>Back to Feed</span>
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard (only rendered when auth state is 'authorized')
// ---------------------------------------------------------------------------
function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'metrics' | 'sources' | 'onboard'>('metrics');
  const [metrics, setMetrics] = useState<AdminMetricsData | null>(null);
  const [sources, setSources] = useState<AdminCompanySource[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingSources, setLoadingSources] = useState(true);
  const [isGlobalScraping, setIsGlobalScraping] = useState(false);
  const [globalScrapeSuccess, setGlobalScrapeSuccess] = useState<string | null>(null);

  // Explicit error states — NEVER silently swallowed
  const [metricsError, setMetricsError] = useState<ApiErrorState>(null);
  const [sourcesError, setSourcesError] = useState<ApiErrorState>(null);
  const [scrapeError, setScrapeError] = useState<ApiErrorState>(null);

  // ---------------------------------------------------------------------------
  // Fetch metrics with explicit error handling
  // ---------------------------------------------------------------------------
  const fetchMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    setMetricsError(null);
    try {
      const res = await fetch('/api/admin/metrics');

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Unknown server error' }));
        setMetricsError({
          status: res.status,
          message: json.error || `Server returned ${res.status}`,
        });
        setMetrics(null);
        return;
      }

      const json = await res.json();
      if (json.data) {
        setMetrics(json.data);
      }
    } catch (err) {
      setMetricsError({
        status: 0,
        message: 'Network error — could not reach the server.',
      });
      console.error('Failed to fetch admin metrics:', err);
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch company sources with explicit error handling + correct unwrapping
  // ---------------------------------------------------------------------------
  const fetchSources = useCallback(async () => {
    setLoadingSources(true);
    setSourcesError(null);
    try {
      const res = await fetch('/api/admin/sources?limit=100');

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Unknown server error' }));
        setSourcesError({
          status: res.status,
          message: json.error || `Server returned ${res.status}`,
        });
        setSources([]);
        return;
      }

      const json = await res.json();
      if (json.data) {
        // FIX: API returns { data: { count, limit, offset, sources: [...] } }
        // Previously incorrectly assigned json.data (an object) instead of json.data.sources (the array)
        setSources(json.data.sources || []);
      }
    } catch (err) {
      setSourcesError({
        status: 0,
        message: 'Network error — could not reach the server.',
      });
      console.error('Failed to fetch admin sources:', err);
    } finally {
      setLoadingSources(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    fetchSources();
  }, [fetchMetrics, fetchSources]);

  // ---------------------------------------------------------------------------
  // Trigger manual scrape crawl with explicit error handling
  // ---------------------------------------------------------------------------
  const handleTriggerScrape = async (sourceId?: string) => {
    setIsGlobalScraping(true);
    setGlobalScrapeSuccess(null);
    setScrapeError(null);

    try {
      const body = sourceId ? { sourceId } : {};
      const res = await fetch('/api/admin/scrape/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({ error: 'Unknown server error' }));

      if (!res.ok) {
        setScrapeError({
          status: res.status,
          message: json.error || `Server returned ${res.status}`,
        });
        return;
      }

      if (json.data) {
        setGlobalScrapeSuccess(
          `Crawl initiated! Run ID: ${json.data.runId || json.data.id || 'Active'}`
        );
        setTimeout(() => setGlobalScrapeSuccess(null), 5000);
        // Refresh metrics and sources after trigger
        setTimeout(() => {
          fetchMetrics();
          fetchSources();
        }, 1500);
      }
    } catch (err) {
      setScrapeError({
        status: 0,
        message: 'Network error — could not reach the server.',
      });
      console.error('Failed to trigger scrape:', err);
    } finally {
      setIsGlobalScraping(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Admin Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(10, 13, 20, 0.9)',
          backdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: '16px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          {/* Logo & Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link
              href="/"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--text-muted)',
                textDecoration: 'none',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              <ArrowLeft size={16} />
              <span>Back to Feed</span>
            </Link>

            <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'var(--accent-gradient)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheck size={20} color="#ffffff" />
              </div>
              <div>
                <h1 style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                  Admin Control Plane
                </h1>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  JobPulse 2.0 Ingestion & Platform Intelligence
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => handleTriggerScrape()}
              disabled={isGlobalScraping}
              className="btn btn-primary"
              style={{ padding: '8px 16px' }}
            >
              <RefreshCw size={15} className={isGlobalScraping ? 'animate-spin' : ''} />
              <span>{isGlobalScraping ? 'Triggering Crawl...' : 'Trigger Global Crawl'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Success banner */}
        {globalScrapeSuccess && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              padding: '12px 16px',
              color: '#34d399',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {globalScrapeSuccess}
          </div>
        )}

        {/* Error banners — explicit, never swallowed */}
        <ErrorBanner error={metricsError} context="Metrics" onRetry={fetchMetrics} />
        <ErrorBanner error={sourcesError} context="Sources" onRetry={fetchSources} />
        <ErrorBanner error={scrapeError} context="Crawl Trigger" onRetry={() => handleTriggerScrape()} />

        {/* Tab Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <button
            onClick={() => setActiveTab('metrics')}
            className={`btn ${activeTab === 'metrics' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 18px' }}
          >
            <LayoutDashboard size={16} />
            <span>System Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('sources')}
            className={`btn ${activeTab === 'sources' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 18px' }}
          >
            <Building2 size={16} />
            <span>Company Sources ({sources.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('onboard')}
            className={`btn ${activeTab === 'onboard' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 18px' }}
          >
            <PlusCircle size={16} />
            <span>Onboard ATS Source</span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'metrics' && (
          <AdminMetricsOverview
            metrics={metrics}
            loading={loadingMetrics}
            onRefresh={fetchMetrics}
          />
        )}

        {activeTab === 'sources' && (
          <SourceManagementTable
            sources={sources}
            loading={loadingSources}
            onRefresh={fetchSources}
            onTriggerCrawl={handleTriggerScrape}
          />
        )}

        {activeTab === 'onboard' && (
          <SourceOnboardingWizard
            onSuccess={() => {
              fetchSources();
              fetchMetrics();
            }}
          />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export — auth gate wraps the dashboard
// ---------------------------------------------------------------------------
export default function AdminDashboardPage() {
  const authState = useAdminAuth();

  switch (authState.state) {
    case 'loading':
      return <AdminLoadingScreen />;
    case 'unauthenticated':
      return <AdminUnauthenticatedScreen />;
    case 'forbidden':
      return <AdminForbiddenScreen email={authState.email} />;
    case 'authorized':
      return <AdminDashboard />;
  }
}
