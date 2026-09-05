'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  CheckSquare,
  User,
  Activity,
  Building2,
  ChevronDown,
  LogOut,
  Layers,
  Shield,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import { useWorker } from './WorkerContext';

export const WorkerNav: React.FC = () => {
  const { user, isAdmin, organizations, activeOrgId, setActiveOrgId, signOut } = useWorker();
  const pathname = usePathname();
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const activeOrg = organizations.find((o) => o.id === activeOrgId);

  const navLinks = [
    { href: '/worker/jobs', label: 'Assigned Jobs', icon: Briefcase },
    { href: '/worker/applications', label: 'Applications & Proofs', icon: CheckSquare },
    { href: '/worker/profile', label: 'Worker Profile', icon: User },
    { href: '/worker/activity', label: 'Activity Log', icon: Activity },
  ];

  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-surface)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        {/* Brand & Organization Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link
            href="/worker/jobs"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
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
                flexShrink: 0,
              }}
            >
              <Briefcase size={18} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '1.0625rem',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
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
                    backgroundColor: 'rgba(37, 99, 235, 0.15)',
                    color: 'var(--brand-text)',
                    border: '1px solid var(--brand-border)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Worker Center
                </span>
              </div>
            </div>
          </Link>

          {/* Organization Switcher Dropdown */}
          {organizations.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
                className="btn btn-secondary"
                style={{
                  padding: '6px 10px',
                  fontSize: '0.8125rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'var(--bg-app)',
                  borderColor: 'var(--border-default)',
                }}
              >
                <Building2 size={14} style={{ color: 'var(--text-muted)' }} />
                <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeOrg ? activeOrg.name : 'All Organizations'}
                </span>
                <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
              </button>

              {isOrgDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '4px',
                    width: '240px',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 200,
                    padding: '6px',
                  }}
                >
                  <div
                    style={{
                      padding: '6px 10px',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Select Organization
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveOrgId(null);
                      setIsOrgDropdownOpen(false);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      backgroundColor: activeOrgId === null ? 'var(--brand-surface)' : 'transparent',
                      color: activeOrgId === null ? 'var(--brand-text)' : 'var(--text-primary)',
                      fontWeight: activeOrgId === null ? 700 : 500,
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>All Organizations / Personal</span>
                  </button>
                  {organizations.map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => {
                        setActiveOrgId(org.id);
                        setIsOrgDropdownOpen(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        backgroundColor: activeOrgId === org.id ? 'var(--brand-surface)' : 'transparent',
                        color: activeOrgId === org.id ? 'var(--brand-text)' : 'var(--text-primary)',
                        fontWeight: activeOrgId === org.id ? 700 : 500,
                        fontSize: '0.8125rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {org.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          color: 'var(--text-muted)',
                          textTransform: 'capitalize',
                        }}
                      >
                        {org.membershipRole}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop Navigation Links */}
        <nav
          className="desktop-nav"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
          aria-label="Worker Navigation"
        >
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href + (activeOrgId ? `?organizationId=${activeOrgId}` : '')}
                className={`btn ${isActive ? 'btn-secondary' : 'btn-ghost'}`}
                style={{
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.8125rem',
                  padding: '7px 12px',
                  backgroundColor: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
                  borderColor: isActive ? 'var(--border-default)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Icon size={15} style={{ color: isActive ? 'var(--brand-text)' : 'var(--text-muted)' }} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Actions: Public Feed, Admin, User, Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link
            href="/"
            className="btn btn-ghost"
            style={{
              fontSize: '0.8125rem',
              color: 'var(--text-muted)',
              padding: '7px 10px',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Return to Public Job Search"
          >
            <Layers size={15} />
            <span className="hidden-mobile">Search</span>
          </Link>

          {isAdmin && (
            <Link
              href="/admin"
              className="btn btn-ghost"
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-muted)',
                padding: '7px 10px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Admin Control Plane"
            >
              <Shield size={15} />
              <span className="hidden-mobile">Admin</span>
            </Link>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    maxWidth: '130px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={user.email}
                >
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="btn btn-ghost"
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    padding: '6px 8px',
                  }}
                  title="Sign out"
                >
                  <LogOut size={14} />
                </button>
              </div>
            </>
          )}

          {/* Mobile hamburger menu */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="btn-icon mobile-only"
            aria-label="Toggle worker navigation"
            style={{
              display: 'none', // Managed by responsive CSS media query
            }}
          >
            {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-elevated)',
            padding: '12px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href + (activeOrgId ? `?organizationId=${activeOrgId}` : '')}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`btn ${isActive ? 'btn-secondary' : 'btn-ghost'}`}
                style={{
                  justifyContent: 'flex-start',
                  width: '100%',
                  padding: '10px 14px',
                  textDecoration: 'none',
                }}
              >
                <Icon size={16} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
};
