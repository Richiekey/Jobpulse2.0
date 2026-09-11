import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';
import { Shield, ArrowLeft, CheckCircle2, Lock, FileSpreadsheet, Eye, Trash2, Mail } from 'lucide-react';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy — JobPulse',
  description: 'Learn how JobPulse collects, protects, and handles your data, including Google Sheets integration and OAuth data.',
};

export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-app)' }}>
      {/* Top Navbar */}
      <header
        style={{
          height: '56px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-app)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1000px',
            width: '100%',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={16} />
            Back to JobPulse
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>JobPulse</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ Privacy Policy</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          maxWidth: '900px',
          width: '100%',
          margin: '0 auto',
          padding: '48px 24px 80px',
        }}
      >
        {/* Header Badge & Title */}
        <div style={{ marginBottom: '36px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(37, 99, 235, 0.12)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              color: 'var(--brand-text)',
              fontSize: '0.75rem',
              fontWeight: 600,
              marginBottom: '16px',
            }}
          >
            <Shield size={13} />
            <span>Privacy & Data Protection</span>
          </div>
          <h1
            style={{
              fontSize: '2.25rem',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
              marginBottom: '12px',
            }}
          >
            JobPulse Privacy Policy
          </h1>
          <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>
            Effective Date: September 11, 2026 &bull; Last Updated: September 11, 2026
          </p>
        </div>

        {/* Highlight Box: Google Limited Use Compliance */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderLeft: '4px solid var(--brand-primary)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
            marginBottom: '40px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Lock size={18} color="#60a5fa" />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Google API Services User Data Policy Compliance
            </h2>
          </div>
          <p
            style={{
              fontSize: '0.875rem',
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            JobPulse&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--brand-text)', textDecoration: 'underline' }}
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.7 }}>
          {/* Section 1: Overview */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              1. Overview
            </h2>
            <p>
              JobPulse (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is a high-precision job aggregation and application tracking platform.
              We are dedicated to safeguarding the privacy of our users. This Privacy Policy details how we collect, use, store,
              and protect your information when you access our application at{' '}
              <strong style={{ color: 'var(--text-primary)' }}>https://web-three-opal-50.vercel.app</strong> or use our services.
            </p>
          </section>

          {/* Section 2: Information We Collect */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              2. Information We Collect
            </h2>
            <p style={{ marginBottom: '12px' }}>
              We only collect information necessary to provide and enhance our job discovery and application tracking features:
            </p>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>
                <strong style={{ color: 'var(--text-primary)' }}>Account Information:</strong> Your email address and authentication credentials provided when signing up or logging in.
              </li>
              <li>
                <strong style={{ color: 'var(--text-primary)' }}>Worker & Career Profile:</strong> Resumes, CV links, target job titles, target seniority, and skills you choose to store for application tracking.
              </li>
              <li>
                <strong style={{ color: 'var(--text-primary)' }}>Application Records:</strong> Jobs you mark as applied, saved jobs, submission dates, notes, and application statuses.
              </li>
            </ul>
          </section>

          {/* Section 3: Google Sheets & OAuth Integration */}
          <section
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <FileSpreadsheet size={22} color="#0F9D58" />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                3. Google OAuth & Google Sheets Integration
              </h2>
            </div>
            <p style={{ marginBottom: '16px' }}>
              JobPulse provides an optional feature allowing job seekers to automatically sync their submitted job applications
              directly to their personal Google Sheets. To enable this feature, we request access through Google OAuth 2.0.
            </p>

            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
              Specific Scopes Requested and Purpose:
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                <code style={{ color: 'var(--brand-text)', fontSize: '0.8125rem' }}>https://www.googleapis.com/auth/spreadsheets</code>
                <p style={{ margin: '6px 0 0', fontSize: '0.875rem' }}>
                  Used exclusively to write application tracking rows (Job Title, Company, Job URL, Location, Salary, Application Date, Application Status)
                  into the spreadsheet and tab that you explicitly select.
                </p>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                <code style={{ color: 'var(--brand-text)', fontSize: '0.8125rem' }}>https://www.googleapis.com/auth/drive.readonly</code>
                <p style={{ margin: '6px 0 0', fontSize: '0.875rem' }}>
                  Used strictly to display a list of your existing Google Spreadsheets in a dropdown menu so you can choose which spreadsheet
                  to sync your applications to. We do not read the content of your other Drive files.
                </p>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                <code style={{ color: 'var(--brand-text)', fontSize: '0.8125rem' }}>https://www.googleapis.com/auth/userinfo.email</code>
                <p style={{ margin: '6px 0 0', fontSize: '0.875rem' }}>
                  Used solely to identify which Google account is currently connected and display your email address in your settings.
                </p>
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Security & Encryption:
            </h3>
            <p style={{ fontSize: '0.875rem', marginBottom: '12px' }}>
              All OAuth refresh tokens are encrypted at rest using industry-standard <strong style={{ color: 'var(--text-primary)' }}>AES-256-GCM</strong> authenticated encryption
              with tenant-isolated authentication tags. Raw tokens are never logged or stored in plaintext.
            </p>

            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              What We Do NOT Do:
            </h3>
            <ul style={{ paddingLeft: '20px', fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>We do <strong>not</strong> read or index spreadsheets not selected by you.</li>
              <li>We do <strong>not</strong> share your Google Sheets or Google data with third parties.</li>
              <li>We do <strong>not</strong> use your Google user data for advertising or marketing.</li>
              <li>We do <strong>not</strong> train artificial intelligence or machine learning models on your Google user data.</li>
            </ul>
          </section>

          {/* Section 4: Data Retention & User Control */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              4. Data Retention, Disconnection & Deletion
            </h2>
            <p style={{ marginBottom: '12px' }}>
              You maintain complete control over your connected accounts and personal data at all times:
            </p>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>
                <strong style={{ color: 'var(--text-primary)' }}>One-Click Disconnection:</strong> You can disconnect your Google account at any time by clicking &quot;Disconnect&quot; under your Worker Profile settings.
                Disconnecting immediately revokes the OAuth token and permanently purges the stored encrypted token from our database.
              </li>
              <li>
                <strong style={{ color: 'var(--text-primary)' }}>Revoking Access via Google:</strong> You can also revoke JobPulse&apos;s permissions at any time directly through your{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--brand-text)', textDecoration: 'underline' }}
                >
                  Google Account Third-Party Access settings
                </a>.
              </li>
              <li>
                <strong style={{ color: 'var(--text-primary)' }}>Account Deletion:</strong> If you wish to delete your entire JobPulse account and all associated application records, you can request full deletion by contacting us.
              </li>
            </ul>
          </section>

          {/* Section 5: Data Sharing & Third Parties */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              5. Data Sharing & Third-Party Disclosure
            </h2>
            <p>
              We do not sell, rent, trade, or otherwise monetize your personal information or Google user data.
              Information is only processed through our secure cloud infrastructure (hosted on Supabase and Vercel)
              strictly for the purpose of running the JobPulse service.
            </p>
          </section>

          {/* Section 6: Security Safeguards */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              6. Security Safeguards
            </h2>
            <p>
              We implement comprehensive technical and organizational measures to protect your information, including TLS 1.3
              encryption in transit, AES-256-GCM application-layer encryption for credentials at rest, PostgreSQL Row-Level Security (RLS)
              at the database tier, and strict CSRF state verification on all OAuth transactions.
            </p>
          </section>

          {/* Section 7: Contact Us */}
          <section
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Mail size={18} color="#60a5fa" />
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                7. Contact Us
              </h2>
            </div>
            <p style={{ fontSize: '0.875rem', marginBottom: '12px' }}>
              If you have any questions, concerns, or requests regarding this Privacy Policy or your data, please reach out to us:
            </p>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              <strong>JobPulse Privacy Team</strong><br />
              Email:{' '}
              <a href="mailto:merichie430@gmail.com" style={{ color: 'var(--brand-text)' }}>
                merichie430@gmail.com
              </a><br />
              Website:{' '}
              <a href="https://web-three-opal-50.vercel.app" style={{ color: 'var(--brand-text)' }}>
                https://web-three-opal-50.vercel.app
              </a>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
