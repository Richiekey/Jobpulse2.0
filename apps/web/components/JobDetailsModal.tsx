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
  TrendingUp,
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

  const companyName = job.companies?.name || 'Verified Tech Employer';
  const companyLogo = job.companies?.logo_url;
  const companyWebsite = job.companies?.website;

  // Format compensation details
  const formattedSalary = formatSalary({
    min: job.salary_min,
    max: job.salary_max,
    currency: job.salary_currency,
    interval: job.salary_interval,
  });

  const displaySalary = formattedSalary || 'Not Disclosed by Employer';

  let annualizedEst: string | null = null;
  if (job.salary_interval && job.salary_interval !== 'yearly' && (job.annualized_min || job.annualized_max)) {
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: '32px' }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '14px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
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
                <Building2 size={28} color="var(--text-muted)" />
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {companyName}
                </span>
                {companyWebsite && (
                  <a
                    href={companyWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--text-muted)', display: 'inline-flex' }}
                  >
                    <Globe size={14} />
                  </a>
                )}
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff' }}>
                {job.display_title}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn-icon"
            style={{ borderRadius: '50%' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Compensation & Market Transparency Card (Batch H) */}
        <div
          style={{
            padding: '20px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(99, 102, 241, 0.08) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            marginBottom: '24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <DollarSign size={16} />
              <span>Base Compensation</span>
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff' }}>
              {displaySalary}
            </div>
            {annualizedEst && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Estimated Annualized: {annualizedEst}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: '0.8rem', color: '#a5b4fc', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Zap size={15} />
              <span>Equity & Perks</span>
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: job.equity_mentioned ? '#c084fc' : 'var(--text-secondary)' }}>
              {job.equity_mentioned ? '✨ Stock Options / Equity Disclosed' : 'Standard Benefits Package'}
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            padding: '16px',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '24px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
              Workplace
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, textTransform: 'capitalize' }}>
              {job.workplace_type || 'Unspecified'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
              Locations
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {(job.locations || []).join(', ') || 'Remote'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
              Posted
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {new Date(job.posted_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
              ATS Application Link
            </div>
            <div style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={14} />
              <span>Verified Direct ATS</span>
            </div>
          </div>
        </div>

        {/* Skills */}
        {job.skills && job.skills.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
              Required Technical Stack
            </h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {job.skills.map((skill: string) => (
                <span
                  key={skill}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#a5b4fc',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    fontSize: '0.85rem',
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
        <div style={{ marginBottom: '32px' }}>
          <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            Job Description & Responsibilities
          </h4>
          <div
            style={{
              fontSize: '0.95rem',
              lineHeight: 1.7,
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

        {/* Modal Action Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '20px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            {onToggleSave && (
              <button
                onClick={() => onToggleSave(job.id)}
                className="btn btn-secondary"
                style={{ color: isSaved ? 'var(--accent-primary)' : 'inherit' }}
              >
                <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
                <span>{isSaved ? 'Saved' : 'Save'}</span>
              </button>
            )}

            {onTrackApplication && (
              <button
                onClick={() => onTrackApplication(job)}
                className="btn btn-secondary"
              >
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
            style={{ padding: '10px 24px', fontSize: '0.95rem' }}
          >
            <span>Apply on {companyName} ATS</span>
            <ExternalLink size={16} />
          </a>
        </div>
      </div>
    </div>
  );
};
