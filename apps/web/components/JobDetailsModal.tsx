'use client';

import React from 'react';
import {
  X,
  Building2,
  MapPin,
  DollarSign,
  Calendar,
  ExternalLink,
  ShieldCheck,
  Bookmark,
  CheckSquare,
  Globe,
  Zap,
} from 'lucide-react';
import { formatSalary } from '@/lib/format-salary';

interface JobDetailsModalProps {
  job: any | null;
  onClose: () => void;
  isSaved?: boolean;
  onToggleSave?: (jobId: string) => void;
  onTrackApplication?: (job: any) => void;
}

export const JobDetailsModal: React.FC<JobDetailsModalProps> = ({
  job,
  onClose,
  isSaved = false,
  onToggleSave,
  onTrackApplication,
}) => {
  if (!job) return null;

  const companyName = job.companies?.name || 'Verified Employer';
  const companyLogo = job.companies?.logo_url;
  const companyWebsite = job.companies?.website;

  // Format compensation
  const formattedSalary = formatSalary({
    min: job.salary_min,
    max: job.salary_max,
    currency: job.salary_currency,
    interval: job.salary_interval,
  });

  const displaySalary = formattedSalary || 'Not Disclosed';

  let annualizedEst: string | null = null;
  if (
    job.salary_interval &&
    job.salary_interval !== 'yearly' &&
    (job.annualized_min || job.annualized_max)
  ) {
    const formattedAnnual = formatSalary({
      min: job.annualized_min,
      max: job.annualized_max,
      currency: job.salary_currency,
      interval: 'yearly',
    });
    if (formattedAnnual) {
      annualizedEst = `~${formattedAnnual}`;
    }
  }

  // Detect ATS Name
  let atsName = 'Direct Employer ATS';
  if (job.apply_url?.includes('greenhouse.io')) atsName = 'Greenhouse ATS';
  else if (job.apply_url?.includes('lever.co')) atsName = 'Lever ATS';
  else if (job.apply_url?.includes('ashbyhq.com')) atsName = 'Ashby ATS';
  else if (job.apply_url?.includes('myworkdayjobs.com')) atsName = 'Workday ATS';

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-details-title"
    >
      <div
        className="modal-surface"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: '28px' }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt={companyName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Building2 size={26} color="var(--text-muted)" />
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {companyName}
                </span>
                {companyWebsite && (
                  <a
                    href={companyWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--text-muted)', display: 'inline-flex' }}
                    title="Company Website"
                  >
                    <Globe size={14} />
                  </a>
                )}
              </div>
              <h1
                id="job-details-title"
                style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}
              >
                {job.display_title}
              </h1>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn-icon"
            style={{ borderRadius: 'var(--radius-full)' }}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Compensation & Transparency Box */}
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-default)',
            marginBottom: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--success-text)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginBottom: '4px',
              }}
            >
              <DollarSign size={14} />
              <span>Base Compensation</span>
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {displaySalary}
            </div>
            {annualizedEst && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Estimated Annualized: {annualizedEst}
              </div>
            )}
          </div>

          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--brand-text)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginBottom: '4px',
              }}
            >
              <Zap size={14} />
              <span>Equity & Benefits</span>
            </div>
            <div
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: job.equity_mentioned ? '#c084fc' : 'var(--text-secondary)',
              }}
            >
              {job.equity_mentioned ? 'Stock Options / Equity Disclosed' : 'Standard Employer Benefits'}
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            padding: '14px',
            backgroundColor: 'var(--bg-surface-elevated)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            marginBottom: '20px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>
              Workplace
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'capitalize' }}>
              {job.workplace_type || 'Unspecified'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>
              Location
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {(job.locations || []).join(', ') || 'Remote'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>
              Posted
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {new Date(job.posted_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>
              Source Verification
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--success-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={14} />
              <span>{atsName}</span>
            </div>
          </div>
        </div>

        {/* Required Technical Stack */}
        {job.skills && job.skills.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h2
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px',
              }}
            >
              Required Technical Stack
            </h2>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {job.skills.map((skill: string) => (
                <span
                  key={skill}
                  style={{
                    padding: '3px 9px',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Job Description */}
        <div style={{ marginBottom: '28px' }}>
          <h2
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '10px',
            }}
          >
            Role Overview & Responsibilities
          </h2>
          <div
            style={{
              fontSize: '0.9375rem',
              lineHeight: 1.65,
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {job.description
              ? job.description
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'")
                  .replace(/&nbsp;/g, ' ')
                  .replace(/<[^>]+>/g, '\n')
                  .replace(/\n{3,}/g, '\n\n')
                  .trim()
              : 'No detailed description available.'}
          </div>
        </div>

        {/* Action Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '18px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            {onToggleSave && (
              <button
                onClick={() => onToggleSave(job.id)}
                className="btn btn-secondary"
                style={{ color: isSaved ? 'var(--brand-primary)' : 'inherit' }}
              >
                <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
                <span>{isSaved ? 'Saved' : 'Save'}</span>
              </button>
            )}

            {onTrackApplication && (
              <button onClick={() => onTrackApplication(job)} className="btn btn-secondary">
                <CheckSquare size={16} />
                <span>Track Application</span>
              </button>
            )}
          </div>

          <a
            href={`/api/jobs/${job.id}/apply`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ padding: '9px 20px', fontSize: '0.875rem' }}
          >
            <span>Apply on {companyName} ATS</span>
            <ExternalLink size={15} />
          </a>
        </div>
      </div>
    </div>
  );
};
