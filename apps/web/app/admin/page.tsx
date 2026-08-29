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
} from 'lucide-react';
import { AdminMetricsOverview, AdminMetricsData } from '@/components/admin/AdminMetricsOverview';
import { SourceManagementTable, AdminCompanySource } from '@/components/admin/SourceManagementTable';
import { SourceOnboardingWizard } from '@/components/admin/SourceOnboardingWizard';

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<'metrics' | 'sources' | 'onboard'>('metrics');
  const [metrics, setMetrics] = useState<AdminMetricsData | null>(null);
  const [sources, setSources] = useState<AdminCompanySource[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingSources, setLoadingSources] = useState(true);
  const [isGlobalScraping, setIsGlobalScraping] = useState(false);
  const [globalScrapeSuccess, setGlobalScrapeSuccess] = useState<string | null>(null);

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const res = await fetch('/api/admin/metrics');
      const json = await res.json();
      if (res.ok && json.data) {
        setMetrics(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch admin metrics:', err);
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  // Fetch company sources
  const fetchSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const res = await fetch('/api/admin/sources?limit=100');
      const json = await res.json();
      if (res.ok && json.data) {
        setSources(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch admin sources:', err);
    } finally {
      setLoadingSources(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    fetchSources();
  }, [fetchMetrics, fetchSources]);

  // Trigger manual scrape crawl
  const handleTriggerScrape = async (sourceId?: string) => {
    setIsGlobalScraping(true);
    setGlobalScrapeSuccess(null);

    try {
      const body = sourceId ? { sourceId } : {};
      const res = await fetch('/api/admin/scrape/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (res.ok && json.data) {
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
