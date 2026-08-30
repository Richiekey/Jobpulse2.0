'use client';

import React from 'react';
import { Briefcase, Bookmark, CheckSquare, Bell, Shield, Layers } from 'lucide-react';

interface HeaderProps {
  activeTab: 'feed' | 'saved' | 'applications' | 'alerts';
  onTabChange: (tab: 'feed' | 'saved' | 'applications' | 'alerts') => void;
  savedCount: number;
  applicationCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  savedCount,
  applicationCount,
}) => {
  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-app)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        {/* Brand / Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--brand-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <Briefcase size={18} strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  color: 'var(--text-primary)',
                }}
              >
                JobPulse
              </span>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-xs)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Verified ATS
              </span>
            </div>
          </div>
        </div>

        {/* Primary Product Navigation */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
          aria-label="Main Navigation"
        >
          <button
            onClick={() => onTabChange('feed')}
            className={`btn ${activeTab === 'feed' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{
              fontWeight: activeTab === 'feed' ? 700 : 500,
              backgroundColor: activeTab === 'feed' ? 'var(--bg-surface-elevated)' : 'transparent',
              borderColor: activeTab === 'feed' ? 'var(--border-default)' : 'transparent',
            }}
          >
            <Layers size={16} />
            <span>Jobs</span>
          </button>

          <button
            onClick={() => onTabChange('saved')}
            className={`btn ${activeTab === 'saved' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{
              fontWeight: activeTab === 'saved' ? 700 : 500,
              backgroundColor: activeTab === 'saved' ? 'var(--bg-surface-elevated)' : 'transparent',
              borderColor: activeTab === 'saved' ? 'var(--border-default)' : 'transparent',
            }}
          >
            <Bookmark size={16} />
            <span>Saved</span>
            {savedCount > 0 && (
              <span
                style={{
                  backgroundColor: 'var(--border-strong)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-full)',
                  padding: '1px 7px',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  marginLeft: '2px',
                }}
              >
                {savedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onTabChange('applications')}
            className={`btn ${activeTab === 'applications' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{
              fontWeight: activeTab === 'applications' ? 700 : 500,
              backgroundColor: activeTab === 'applications' ? 'var(--bg-surface-elevated)' : 'transparent',
              borderColor: activeTab === 'applications' ? 'var(--border-default)' : 'transparent',
            }}
          >
            <CheckSquare size={16} />
            <span>Applications</span>
            {applicationCount > 0 && (
              <span
                style={{
                  backgroundColor: 'var(--brand-surface)',
                  color: 'var(--brand-text)',
                  border: '1px solid var(--brand-border)',
                  borderRadius: 'var(--radius-full)',
                  padding: '1px 7px',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  marginLeft: '2px',
                }}
              >
                {applicationCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onTabChange('alerts')}
            className={`btn ${activeTab === 'alerts' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{
              fontWeight: activeTab === 'alerts' ? 700 : 500,
              backgroundColor: activeTab === 'alerts' ? 'var(--bg-surface-elevated)' : 'transparent',
              borderColor: activeTab === 'alerts' ? 'var(--border-default)' : 'transparent',
            }}
          >
            <Bell size={16} />
            <span>Alerts</span>
          </button>

          <div
            style={{
              width: '1px',
              height: '20px',
              backgroundColor: 'var(--border-subtle)',
              margin: '0 4px',
            }}
          />

          <a
            href="/admin"
            className="btn btn-ghost"
            style={{
              fontSize: '0.8125rem',
              color: 'var(--text-muted)',
              padding: '8px 12px',
            }}
            title="Admin Control Plane"
          >
            <Shield size={15} />
            <span>Admin</span>
          </a>
        </nav>
      </div>
    </header>
  );
};
