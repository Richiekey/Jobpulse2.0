'use client';

import React from 'react';
import { Briefcase, Bookmark, CheckSquare, Sparkles, RefreshCw } from 'lucide-react';

interface HeaderProps {
  activeTab: 'feed' | 'saved' | 'applications';
  onTabChange: (tab: 'feed' | 'saved' | 'applications') => void;
  savedCount: number;
  applicationCount: number;
  onTriggerScrape?: () => void;
  isScraping?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  savedCount,
  applicationCount,
  onTriggerScrape,
  isScraping = false,
}) => {
  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(10, 13, 20, 0.8)',
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
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(99, 102, 241, 0.5)',
            }}
          >
            <Briefcase size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                JobPulse
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: 'var(--accent-gradient)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                2.0 Production
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Verified High-Quality Job Pipeline
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => onTabChange('feed')}
            className={`btn ${activeTab === 'feed' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px' }}
          >
            <Sparkles size={16} />
            <span>Live Feed</span>
          </button>

          <button
            onClick={() => onTabChange('saved')}
            className={`btn ${activeTab === 'saved' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px' }}
          >
            <Bookmark size={16} />
            <span>Saved</span>
            {savedCount > 0 && (
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontSize: '0.7rem',
                }}
              >
                {savedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onTabChange('applications')}
            className={`btn ${activeTab === 'applications' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px' }}
          >
            <CheckSquare size={16} />
            <span>Tracker</span>
            {applicationCount > 0 && (
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontSize: '0.7rem',
                }}
              >
                {applicationCount}
              </span>
            )}
          </button>

          {onTriggerScrape && (
            <button
              onClick={onTriggerScrape}
              disabled={isScraping}
              className="btn btn-secondary"
              title="Trigger live ATS scrape ingestion run"
              style={{
                padding: '8px 14px',
                borderColor: 'rgba(99, 102, 241, 0.4)',
                background: 'rgba(99, 102, 241, 0.1)',
                color: '#a5b4fc',
              }}
            >
              <RefreshCw size={15} className={isScraping ? 'animate-spin' : ''} />
              <span>{isScraping ? 'Syncing...' : 'Sync ATS'}</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
