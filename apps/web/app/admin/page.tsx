'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Activity,
  Briefcase,
  LayoutDashboard,
  Building2,
  PlusCircle,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Lock,
  ShieldAlert,
  ServerCrash,
  LogIn,
  Users,
  ClipboardList,
  CheckSquare,
  RotateCw,
  BarChart3,
} from 'lucide-react';
import { AdminMetricsOverview, AdminMetricsData } from '@/components/admin/AdminMetricsOverview';
import { SourceManagementTable, AdminCompanySource } from '@/components/admin/SourceManagementTable';
import { SourceOnboardingWizard } from '@/components/admin/SourceOnboardingWizard';
import { RecentScrapeRunsTable } from '@/components/admin/RecentScrapeRunsTable';
import { AdminOrgSelector, AdminOrganization } from '@/components/admin/AdminOrgSelector';
import { WorkersManagement } from '@/components/admin/WorkersManagement';
import { JobAssignmentDispatcher } from '@/components/admin/JobAssignmentDispatcher';
import { VerificationReviewQueue } from '@/components/admin/VerificationReviewQueue';
import { SyncEngineObservatory } from '@/components/admin/SyncEngineObservatory';
import type { AdminScrapeRunItem } from '@/app/api/admin/scrape/runs/route';
import { createClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Error types for explicit API error state rendering
// ---------------------------------------------------------------------------
type ApiErrorState = {
  status: number;
  message: string;
} | null;

// ---------------------------------------------------------------------------
// Auth states supporting platform superadmins and organization administrators
// ---------------------------------------------------------------------------
type AuthState =
  | { state: 'loading' }
  | { state: 'unauthenticated' }
  | { state: 'forbidden'; email: string }
  | {
      state: 'authorized';
      email: string;
      isPlatformAdmin: boolean;
      organizations: AdminOrganization[];
    };

// ---------------------------------------------------------------------------
// Multi-Tenant Admin Auth Gate
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

        // 1. Check platform superadmin role via profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role, email')
          .eq('id', user.id)
          .maybeSingle();

        const isPlatformAdmin = Boolean(profile && (profile as any).role === 'admin');

        // 2. Check organization memberships for admin or owner roles
        const { data: memberships } = await supabase
          .from('organization_members')
          .select('role, organizations (id, name, slug, domain, logo_url)')
          .eq('user_id', user.id);

        const manageableOrgs: AdminOrganization[] = (memberships || [])
          .filter((m: any) => m.role === 'owner' || m.role === 'admin' || isPlatformAdmin)
          .map((m: any) => ({
            id: m.organizations.id,
            name: m.organizations.name,
            slug: m.organizations.slug,
            domain: m.organizations.domain,
            logo_url: m.organizations.logo_url,
            membershipRole: m.role,
          }));

        if (cancelled) return;

        // User must be either platform admin OR an admin/owner of at least one organization
        if (!isPlatformAdmin && manageableOrgs.length === 0) {
          setAuthState({ state: 'forbidden', email: user.email || 'unknown' });
          return;
        }

        setAuthState({
          state: 'authorized',
          email: user.email || (profile as any)?.email,
          isPlatformAdmin,
          organizations: manageableOrgs,
        });
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
          Verifying administrator permissions…
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
          You must sign in with an administrator account to access the Admin Command Center.
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
          Your account does not have organization owner/admin privileges or platform administrator permissions.
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
// Main Command Center Dashboard
// ---------------------------------------------------------------------------
function AdminDashboard({
  isPlatformAdmin,
  initialOrganizations,
}: {
  isPlatformAdmin: boolean;
  initialOrganizations: AdminOrganization[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Command Center Navigation Tabs (Batch Q 5 operational pillars)
  type CommandCenterTab = 'workers' | 'assignments' | 'verifications' | 'sync' | 'observatory';
  const tabParam = searchParams.get('tab') as CommandCenterTab | null;
  const [activeTab, setActiveTab] = useState<CommandCenterTab>(
    tabParam && ['workers', 'assignments', 'verifications', 'sync', 'observatory'].includes(tabParam)
      ? tabParam
      : 'workers'
  );

  // Active Organization Selection
  const orgParam = searchParams.get('organizationId');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(
    orgParam || (initialOrganizations.length > 0 ? initialOrganizations[0].id : null)
  );
  const [selectedOrg, setSelectedOrg] = useState<AdminOrganization | null>(
    initialOrganizations.find((o) => o.id === selectedOrgId) || (initialOrganizations.length > 0 ? initialOrganizations[0] : null)
  );

  // Synchronize URL query params
  const handleSelectOrg = (org: AdminOrganization | null) => {
    setSelectedOrg(org);
    const newOrgId = org ? org.id : null;
    setSelectedOrgId(newOrgId);

    const params = new URLSearchParams(window.location.search);
    if (newOrgId) {
      params.set('organizationId', newOrgId);
    } else {
      params.delete('organizationId');
    }
    params.set('tab', activeTab);
    router.replace(`?${params.toString()}`);
  };

  const handleTabChange = (tab: CommandCenterTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab);
    if (selectedOrgId) {
      params.set('organizationId', selectedOrgId);
    }
    router.replace(`?${params.toString()}`);
  };

  // ---------------------------------------------------------------------------
  // Observatory Tab Sub-state (System Metrics, Sources, ATS Onboard, Runs)
  // ---------------------------------------------------------------------------
  const [observatorySubTab, setObservatorySubTab] = useState<'metrics' | 'sources' | 'onboard' | 'runs'>('metrics');
  const [metrics, setMetrics] = useState<AdminMetricsData | null>(null);
  const [sources, setSources] = useState<AdminCompanySource[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingSources, setLoadingSources] = useState(true);
  const [isGlobalScraping, setIsGlobalScraping] = useState(false);
  const [globalScrapeSuccess, setGlobalScrapeSuccess] = useState<string | null>(null);

  // Explicit error states for Observatory
  const [metricsError, setMetricsError] = useState<ApiErrorState>(null);
  const [sourcesError, setSourcesError] = useState<ApiErrorState>(null);
  const [scrapeError, setScrapeError] = useState<ApiErrorState>(null);

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
      if (json.data) setMetrics(json.data);
    } catch (err) {
      setMetricsError({
        status: 0,
        message: 'Network error — could not reach the server.',
      });
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

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
        setSources(json.data.sources || []);
      }
    } catch (err) {
      setSourcesError({
        status: 0,
        message: 'Network error — could not reach the server.',
      });
    } finally {
      setLoadingSources(false);
    }
  }, []);

  const [runs, setRuns] = useState<AdminScrapeRunItem[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [runsError, setRunsError] = useState<ApiErrorState>(null);

  const fetchRuns = useCallback(async () => {
    setLoadingRuns(true);
    setRunsError(null);
    try {
      const res = await fetch('/api/admin/scrape/runs');
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Unknown server error' }));
        setRunsError({
          status: res.status,
          message: json.error || `Server returned ${res.status}`,
        });
        return;
      }
      const json = await res.json();
      if (json.data?.runs) {
        setRuns(json.data.runs);
      }
    } catch (err) {
      setRunsError({
        status: 0,
        message: 'Network error — could not reach the server.',
      });
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'observatory') {
      fetchMetrics();
      fetchSources();
      fetchRuns();
    }
  }, [activeTab, fetchMetrics, fetchSources, fetchRuns]);

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
        setTimeout(() => {
          fetchMetrics();
          fetchSources();
          fetchRuns();
        }, 1500);
      }
    } catch (err) {
      setScrapeError({
        status: 0,
        message: 'Network error — could not reach the server.',
      });
    } finally {
      setIsGlobalScraping(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Command Center Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(10, 13, 20, 0.92)',
          backdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: '14px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1360px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          {/* Logo & Navigation Breadcrumb */}
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
                  Admin Command Center
                </h1>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Workforce Operations, Assignment Dispatch & Observatory
                </p>
              </div>
            </div>
          </div>

          {/* Header Controls: Multi-Tenant Org Switcher & Quick Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <AdminOrgSelector
              currentOrgId={selectedOrgId}
              isPlatformAdmin={isPlatformAdmin}
              onSelectOrg={handleSelectOrg}
            />

            {activeTab === 'observatory' && isPlatformAdmin && (
              <button
                onClick={() => handleTriggerScrape()}
                disabled={isGlobalScraping}
                className="btn btn-primary"
                style={{ padding: '8px 16px' }}
              >
                <RefreshCw size={15} className={isGlobalScraping ? 'animate-spin' : ''} />
                <span>{isGlobalScraping ? 'Triggering…' : 'Global Crawl'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main
        style={{
          maxWidth: '1360px',
          margin: '0 auto',
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Global Scrape Banner (if in observatory tab) */}
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

        {/* Command Center 5 Operational Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '12px',
            overflowX: 'auto',
          }}
        >
          <button
            onClick={() => handleTabChange('workers')}
            className={`btn ${activeTab === 'workers' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
          >
            <Users size={16} />
            <span>Workforce Management</span>
          </button>

          <button
            onClick={() => handleTabChange('assignments')}
            className={`btn ${activeTab === 'assignments' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
          >
            <ClipboardList size={16} />
            <span>Job Dispatcher</span>
          </button>

          <button
            onClick={() => handleTabChange('verifications')}
            className={`btn ${activeTab === 'verifications' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
          >
            <CheckSquare size={16} />
            <span>Review Queue</span>
          </button>

          <button
            onClick={() => handleTabChange('sync')}
            className={`btn ${activeTab === 'sync' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
          >
            <RotateCw size={16} />
            <span>Sync Engine</span>
          </button>

          <button
            onClick={() => handleTabChange('observatory')}
            className={`btn ${activeTab === 'observatory' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
          >
            <BarChart3 size={16} />
            <span>Source & Platform Observatory</span>
          </button>
        </div>

        {/* Tab 1: Workers Management */}
        {activeTab === 'workers' && (
          <WorkersManagement
            organizationId={selectedOrgId}
            organizationName={selectedOrg?.name}
            isPlatformAdmin={isPlatformAdmin}
          />
        )}

        {/* Tab 2: Job Assignment Dispatcher */}
        {activeTab === 'assignments' && (
          <JobAssignmentDispatcher
            organizationId={selectedOrgId}
            organizationName={selectedOrg?.name}
          />
        )}

        {/* Tab 3: Verification Review Queue */}
        {activeTab === 'verifications' && (
          <VerificationReviewQueue
            organizationId={selectedOrgId}
            organizationName={selectedOrg?.name}
          />
        )}

        {/* Tab 4: Sync Engine Monitoring & Retry Controls */}
        {activeTab === 'sync' && (
          <SyncEngineObservatory
            organizationId={selectedOrgId}
            organizationName={selectedOrg?.name}
          />
        )}

        {/* Tab 5: Source Health & Platform Observatory */}
        {activeTab === 'observatory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Observatory Error Banners */}
            <ErrorBanner error={metricsError} context="Metrics" onRetry={fetchMetrics} />
            <ErrorBanner error={sourcesError} context="Sources" onRetry={fetchSources} />
            <ErrorBanner error={scrapeError} context="Crawl Trigger" onRetry={() => handleTriggerScrape()} />

            {/* Sub-tab Navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setObservatorySubTab('metrics')}
                className={`btn ${observatorySubTab === 'metrics' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
              >
                <LayoutDashboard size={14} />
                <span>System Overview</span>
              </button>

              <button
                onClick={() => setObservatorySubTab('sources')}
                className={`btn ${observatorySubTab === 'sources' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
              >
                <Building2 size={14} />
                <span>Company Sources ({sources.length})</span>
              </button>

              <button
                onClick={() => setObservatorySubTab('onboard')}
                className={`btn ${observatorySubTab === 'onboard' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
              >
                <PlusCircle size={14} />
                <span>Onboard ATS Source</span>
              </button>

              <button
                onClick={() => setObservatorySubTab('runs')}
                className={`btn ${observatorySubTab === 'runs' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
              >
                <Activity size={14} />
                <span>Crawl Runs</span>
              </button>
            </div>

            {/* Observatory Sub-tab Content */}
            {observatorySubTab === 'metrics' && (
              <AdminMetricsOverview
                metrics={metrics}
                loading={loadingMetrics}
                onRefresh={fetchMetrics}
              />
            )}

            {observatorySubTab === 'sources' && (
              <SourceManagementTable
                sources={sources}
                loading={loadingSources}
                onRefresh={fetchSources}
                onTriggerCrawl={handleTriggerScrape}
              />
            )}

            {observatorySubTab === 'onboard' && (
              <SourceOnboardingWizard
                onSuccess={() => {
                  fetchSources();
                  fetchMetrics();
                }}
              />
            )}

            {observatorySubTab === 'runs' && (
              <RecentScrapeRunsTable
                runs={runs}
                loading={loadingRuns}
                onRefresh={fetchRuns}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export wrapped in Suspense for Next.js searchParams compatibility
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
      return (
        <Suspense fallback={<AdminLoadingScreen />}>
          <AdminDashboard
            isPlatformAdmin={authState.isPlatformAdmin}
            initialOrganizations={authState.organizations}
          />
        </Suspense>
      );
  }
}
