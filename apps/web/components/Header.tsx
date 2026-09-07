'use client';

import React, { useState } from 'react';
import { Briefcase, Bookmark, CheckSquare, Bell, Shield, Layers, Menu, X, LogOut, User } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, isAdmin, signOut } = useAuth();

  const handleSelectTab = (tab: 'feed' | 'saved' | 'applications' | 'alerts') => {
    onTabChange(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <header
      style={{
        height: '56px',
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-app)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          padding: '0 20px',
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
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--brand-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              flexShrink: 0,
            }}
          >
            <Briefcase size={17} strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '1.0625rem',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  color: 'var(--text-primary)',
                }}
              >
                JobPulse
              </span>
              <span
                className="hidden-mobile"
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

        {/* Desktop Navigation */}
        <nav
          className="desktop-nav"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
          aria-label="Main Navigation"
        >
          <button
            type="button"
            onClick={() => handleSelectTab('feed')}
            className="btn"
            style={{
              height: '34px',
              padding: '0 12px',
              fontSize: '0.8125rem',
              fontWeight: activeTab === 'feed' ? 700 : 500,
              backgroundColor: activeTab === 'feed' ? 'var(--bg-surface-elevated)' : 'transparent',
              borderColor: activeTab === 'feed' ? 'var(--border-default)' : 'transparent',
              color: activeTab === 'feed' ? 'var(--text-primary)' : 'var(--text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Layers size={15} />
            <span>Jobs</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('saved')}
            className="btn"
            style={{
              height: '34px',
              padding: '0 12px',
              fontSize: '0.8125rem',
              fontWeight: activeTab === 'saved' ? 700 : 500,
              backgroundColor: activeTab === 'saved' ? 'var(--bg-surface-elevated)' : 'transparent',
              borderColor: activeTab === 'saved' ? 'var(--border-default)' : 'transparent',
              color: activeTab === 'saved' ? 'var(--text-primary)' : 'var(--text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Bookmark size={15} />
            <span>Saved</span>
            {savedCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '18px',
                  padding: '0 6px',
                  backgroundColor: 'var(--border-strong)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-full)',
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
            type="button"
            onClick={() => handleSelectTab('applications')}
            className="btn"
            style={{
              height: '34px',
              padding: '0 12px',
              fontSize: '0.8125rem',
              fontWeight: activeTab === 'applications' ? 700 : 500,
              backgroundColor: activeTab === 'applications' ? 'var(--bg-surface-elevated)' : 'transparent',
              borderColor: activeTab === 'applications' ? 'var(--border-default)' : 'transparent',
              color: activeTab === 'applications' ? 'var(--text-primary)' : 'var(--text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <CheckSquare size={15} />
            <span>My Applications</span>
            {applicationCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '18px',
                  padding: '0 6px',
                  backgroundColor: 'var(--brand-surface)',
                  color: 'var(--brand-text)',
                  border: '1px solid var(--brand-border)',
                  borderRadius: 'var(--radius-full)',
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
            type="button"
            onClick={() => handleSelectTab('alerts')}
            className="btn"
            style={{
              height: '34px',
              padding: '0 12px',
              fontSize: '0.8125rem',
              fontWeight: activeTab === 'alerts' ? 700 : 500,
              backgroundColor: activeTab === 'alerts' ? 'var(--bg-surface-elevated)' : 'transparent',
              borderColor: activeTab === 'alerts' ? 'var(--border-default)' : 'transparent',
              color: activeTab === 'alerts' ? 'var(--text-primary)' : 'var(--text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Bell size={15} />
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

          {user && (
            <a
              href="/worker/jobs"
              className="btn btn-ghost"
              style={{
                height: '34px',
                padding: '0 12px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'var(--brand-text)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
                borderRadius: 'var(--radius-md)',
              }}
              title="Worker Command Center"
            >
              <Briefcase size={15} />
              <span>Worker Portal</span>
            </a>
          )}

          {isAdmin && (
            <a
              href="/admin"
              className="btn btn-ghost"
              style={{
                height: '34px',
                padding: '0 12px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
                borderRadius: 'var(--radius-md)',
              }}
              title="Admin Control Plane"
            >
              <Shield size={15} />
              <span>Admin</span>
            </a>
          )}

          {user && (
            <>
              <div
                style={{
                  width: '1px',
                  height: '20px',
                  backgroundColor: 'var(--border-subtle)',
                  margin: '0 4px',
                }}
              />
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '34px',
                  padding: '0 8px 0 10px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  boxSizing: 'border-box',
                }}
              >
                <User size={13} color="var(--text-muted)" />
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    maxWidth: '140px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                  }}
                  title={user.email}
                >
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: 'var(--radius-xs)',
                    transition: 'color 0.15s ease',
                  }}
                  title="Sign out"
                >
                  <LogOut size={14} />
                </button>
              </div>
            </>
          )}
        </nav>

        {/* Mobile Hamburger Toggle Button */}
        <div className="mobile-nav-toggle" style={{ display: 'none' }}>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="btn-icon"
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <nav
          className="mobile-nav-drawer"
          aria-label="Mobile Navigation"
          style={{
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
            padding: '12px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <button
            type="button"
            onClick={() => handleSelectTab('feed')}
            className={`btn ${activeTab === 'feed' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ justifyContent: 'flex-start', width: '100%', padding: '10px 14px' }}
          >
            <Layers size={18} />
            <span>Jobs Feed</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('saved')}
            className={`btn ${activeTab === 'saved' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ justifyContent: 'space-between', width: '100%', padding: '10px 14px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bookmark size={18} />
              <span>Saved Jobs</span>
            </div>
            {savedCount > 0 && (
              <span
                style={{
                  backgroundColor: 'var(--border-strong)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-full)',
                  padding: '2px 8px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {savedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('applications')}
            className={`btn ${activeTab === 'applications' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ justifyContent: 'space-between', width: '100%', padding: '10px 14px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckSquare size={18} />
              <span>My Applications</span>
            </div>
            {applicationCount > 0 && (
              <span
                style={{
                  backgroundColor: 'var(--brand-surface)',
                  color: 'var(--brand-text)',
                  borderRadius: 'var(--radius-full)',
                  padding: '2px 8px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {applicationCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('alerts')}
            className={`btn ${activeTab === 'alerts' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ justifyContent: 'flex-start', width: '100%', padding: '10px 14px' }}
          >
            <Bell size={18} />
            <span>Automated Alerts</span>
          </button>

          <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />

          {user && (
            <a
              href="/worker/jobs"
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start', width: '100%', padding: '10px 14px', color: 'var(--brand-text)' }}
            >
              <Briefcase size={18} />
              <span>Worker Portal</span>
            </a>
          )}

          {isAdmin && (
            <a
              href="/admin"
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start', width: '100%', padding: '10px 14px', color: 'var(--text-muted)' }}
            >
              <Shield size={18} />
              <span>Admin Control Plane</span>
            </a>
          )}

          {user && (
            <>
              <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />
              <button
                type="button"
                onClick={signOut}
                className="btn btn-ghost"
                style={{ justifyContent: 'flex-start', width: '100%', padding: '10px 14px', color: 'var(--text-muted)' }}
              >
                <LogOut size={18} />
                <span>Sign Out ({user.email})</span>
              </button>
            </>
          )}
        </nav>
      )}
    </header>
  );
};
