import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';
import { FileText, ArrowLeft, CheckCircle2, ShieldCheck, AlertTriangle, Scale, Mail } from 'lucide-react';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Terms of Service — JobPulse',
  description: 'Terms of Service governing the use of the JobPulse job aggregation and application tracking platform.',
};

export default function TermsOfServicePage() {
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
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ Terms of Service</span>
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
            <Scale size={13} />
            <span>Legal Agreement</span>
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
            JobPulse Terms of Service
          </h1>
          <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>
            Effective Date: September 11, 2026 &bull; Last Updated: September 11, 2026
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.7 }}>
          {/* Section 1 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing, browsing, or using JobPulse at <strong style={{ color: 'var(--text-primary)' }}>https://web-three-opal-50.vercel.app</strong> (&quot;Service&quot;),
              you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree with any part of these Terms, you may not use our Service.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              2. Description of the Service
            </h2>
            <p style={{ marginBottom: '12px' }}>
              JobPulse 2.0 is a specialized career acceleration platform that aggregates, normalizes, and indexes publicly available employment
              opportunities directly from employer Applicant Tracking Systems (including Greenhouse, Lever, Ashby, and Workday).
            </p>
            <p>
              The Service provides search, filtering, salary benchmarking, job bookmarking, and application tracking features,
              including optional third-party integrations such as syncing application history to Google Sheets.
            </p>
          </section>

          {/* Section 3 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              3. User Accounts and Responsibilities
            </h2>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>
                You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
              </li>
              <li>
                You agree not to use the Service for any unlawful purpose or in violation of any applicable local, state, national, or international law.
              </li>
              <li>
                You agree not to bypass, disable, or tamper with security features, rate limits, or access controls of the Service.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '24px',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              4. Third-Party Integrations & Google Services
            </h2>
            <p style={{ marginBottom: '12px' }}>
              JobPulse allows users to link external third-party services, including Google Sheets. By connecting your Google account:
            </p>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>
                You grant JobPulse permission to access your Google Sheets and Google Drive metadata strictly within the scopes consented to during OAuth authorization.
              </li>
              <li>
                You acknowledge that JobPulse adheres to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--brand-text)', textDecoration: 'underline' }}
                >
                  Google API Services User Data Policy
                </a>, including the Limited Use requirements.
              </li>
              <li>
                You may disconnect or revoke third-party permissions at any time through the Service or via your Google Account settings.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              5. Intellectual Property
            </h2>
            <p>
              All software, source code, designs, branding, logos, trademarks, and user interfaces comprising JobPulse are the exclusive
              property of JobPulse and its licensors. Job listings indexed by the Service remain the property of their respective employer companies.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              6. Disclaimer of Warranties
            </h2>
            <p>
              THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.
              WE DO NOT GUARANTEE THAT JOB LISTINGS ARE ACCURATE, COMPLETE, OR CURRENT, AS JOB AVAILABILITY IS DETERMINED BY THIRD-PARTY EMPLOYERS.
              JOBPULSE DOES NOT GUARANTEE EMPLOYMENT OR INTERVIEWS FROM USING THE PLATFORM.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              7. Limitation of Liability
            </h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, JOBPULSE AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR DATA ARISING OUT OF OR IN CONNECTION WITH YOUR
              USE OF THE SERVICE.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              8. Termination
            </h2>
            <p>
              We reserve the right to suspend or terminate your access to the Service at our sole discretion, without prior notice,
              for conduct that we believe violates these Terms or is harmful to other users or the platform.
            </p>
          </section>

          {/* Section 9 */}
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
                9. Contact Information
              </h2>
            </div>
            <p style={{ fontSize: '0.875rem', marginBottom: '12px' }}>
              If you have any questions about these Terms of Service, please contact us:
            </p>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              <strong>JobPulse Legal Support</strong><br />
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
