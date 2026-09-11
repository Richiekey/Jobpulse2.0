import React from 'react';
import Link from 'next/link';
import { Briefcase, Shield, FileText, ExternalLink } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-app)',
        padding: '36px 24px',
        marginTop: 'auto',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          {/* Brand Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--brand-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
              }}
            >
              <Briefcase size={16} strokeWidth={2.5} />
            </div>
            <div>
              <span
                style={{
                  fontSize: '1rem',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: 'var(--text-primary)',
                }}
              >
                JobPulse
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  marginLeft: '8px',
                }}
              >
                Production Job Aggregation & Application Engine
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              flexWrap: 'wrap',
            }}
          >
            <Link
              href="/"
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                transition: 'color 0.15s ease',
              }}
            >
              Job Feed
            </Link>
            <Link
              href="/worker"
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                transition: 'color 0.15s ease',
              }}
            >
              Worker Portal
            </Link>
            <Link
              href="/privacy"
              style={{
                fontSize: '0.8125rem',
                color: 'var(--brand-text)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 600,
              }}
            >
              <Shield size={13} />
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              style={{
                fontSize: '0.8125rem',
                color: 'var(--brand-text)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 600,
              }}
            >
              <FileText size={13} />
              Terms of Service
            </Link>
          </nav>
        </div>

        {/* Copyright & Disclaimer */}
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}
        >
          <div>
            &copy; {new Date().getFullYear()} JobPulse 2.0. All rights reserved. Direct ATS normalization from Greenhouse, Lever, Ashby, and Workday.
          </div>
          <div>
            Google Sheets™ is a trademark of Google LLC.
          </div>
        </div>
      </div>
    </footer>
  );
};
