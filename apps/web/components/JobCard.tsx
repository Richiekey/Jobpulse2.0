'use client';

import React from 'react';
import {
  Building2,
  MapPin,
  Clock,
  ExternalLink,
  Bookmark,
  CheckSquare,
  Zap,
} from 'lucide-react';
import { formatSalary } from '@/lib/format-salary';

export interface JobCardProps {
  job: {
    id: string;
    display_title: string;
    canonical_title: string;
    description: string;
    employment_type: string;
    workplace_type: string;
    locations: string[];
    salary_min?: number | null;
    salary_max?: number | null;
    salary_currency?: string | null;
    salary_interval?: string | null;
    annualized_min?: number | null;
    annualized_max?: number | null;
    has_salary?: boolean;
    equity_mentioned?: boolean;
    skills: string[];
    posted_at: string;
    apply_url: string;
    canonical_url: string;
    companies?: {
      name: string;
      logo_url?: string | null;
      website?: string | null;
    } | null;
  };
  isSaved?: boolean;
  onToggleSave?: (jobId: string) => void;
  onOpenDetails?: (jobId: string) => void;
  onTrackApplication?: (job: any) => void;
}

export const JobCard: React.FC<JobCardProps> = ({
  job,
  isSaved = false,
  onToggleSave,
  onOpenDetails,
  onTrackApplication,
}) => {
  const companyName = job.companies?.name || 'Verified Tech Employer';
  const companyLogo = job.companies?.logo_url;

  // Format compensation deterministically using domain helper
  const salaryString = formatSalary({
    min: job.salary_min,
    max: job.salary_max,
    currency: job.salary_currency,
    interval: job.salary_interval,
  });

  // Format relative posting time
  const postedDate = new Date(job.posted_at);
  const diffDays = Math.floor((Date.now() - postedDate.getTime()) / (1000 * 60 * 60 * 24));
  const timeAgo =
    diffDays === 0 ? 'Today' : diffDays === 1 ? '1d ago' : `${diffDays}d ago`;

  // Detect ATS platform from apply URL
  let atsSource = 'Direct ATS';
  if (job.apply_url.includes('greenhouse.io')) atsSource = 'Greenhouse';
  else if (job.apply_url.includes('lever.co')) atsSource = 'Lever';
  else if (job.apply_url.includes('ashbyhq.com')) atsSource = 'Ashby';
  else if (job.apply_url.includes('myworkdayjobs.com')) atsSource = 'Workday';

  return (
    <article
      className="job-card-container"
      style={{
        padding: '18px 20px',
        marginBottom: '12px',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        {/* Main Content Area */}
        <div style={{ display: 'flex', gap: '14px', flex: '1 1 420px', minWidth: 0 }}>
          {/* Company Avatar / Logo */}
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
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
                alt={`${companyName} logo`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <Building2 size={22} color="var(--text-muted)" />
            )}
          </div>

          {/* Core Job Details */}
          <div style={{ minWidth: 0, flex: 1 }}>
            {/* Row 1: Company + Source + Time */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '4px',
              }}
            >
              <span
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                {companyName}
              </span>

              <span className="badge badge-source" style={{ fontSize: '0.6875rem' }}>
                {atsSource}
              </span>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                }}
              >
                <Clock size={12} />
                <span>{timeAgo}</span>
              </span>
            </div>

            {/* Row 2: Dominant Job Title as Primary Accessible Trigger */}
            <h2 style={{ lineHeight: 1.35, marginBottom: '8px' }}>
              <button
                type="button"
                onClick={() => onOpenDetails?.(job.id)}
                className="job-title-button"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'inline-block',
                  textDecoration: 'none',
                  outline: 'none',
                }}
                aria-label={`View details for ${job.display_title} at ${companyName}`}
              >
                {job.display_title}
              </button>
            </h2>

            {/* Row 3: Metadata Badges (Location, Mode, Salary, Equity) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
                fontSize: '0.8125rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: 'var(--text-secondary)',
                }}
              >
                <MapPin size={14} color="var(--text-muted)" />
                <span>{(job.locations || []).slice(0, 2).join(', ') || 'Remote'}</span>
              </div>

              {job.workplace_type === 'remote' && (
                <span className="badge badge-remote">Remote</span>
              )}
              {job.workplace_type === 'hybrid' && (
                <span className="badge badge-hybrid">Hybrid</span>
              )}
              {job.workplace_type === 'on_site' && (
                <span className="badge badge-onsite">On-Site</span>
              )}

              {salaryString && (
                <span className="badge badge-salary">
                  {salaryString}
                </span>
              )}

              {job.equity_mentioned && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#c084fc',
                    backgroundColor: 'rgba(192, 132, 252, 0.1)',
                    border: '1px solid rgba(192, 132, 252, 0.25)',
                    padding: '2px 7px',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  <Zap size={11} />
                  <span>Equity</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          {onToggleSave && (
            <button
              type="button"
              onClick={() => onToggleSave(job.id)}
              className="btn btn-icon"
              title={isSaved ? 'Remove from Saved' : 'Save this job'}
              aria-label={isSaved ? `Remove ${job.display_title} from saved jobs` : `Save ${job.display_title}`}
              style={{
                color: isSaved ? 'var(--brand-primary)' : 'var(--text-muted)',
                borderColor: isSaved ? 'var(--brand-primary)' : 'var(--border-subtle)',
                backgroundColor: isSaved ? 'var(--brand-surface)' : 'var(--bg-surface)',
              }}
            >
              <Bookmark size={17} fill={isSaved ? 'currentColor' : 'none'} />
            </button>
          )}

          {onTrackApplication && (
            <button
              type="button"
              onClick={() => onTrackApplication(job)}
              className="btn btn-secondary"
              title="Track application progress"
              aria-label={`Track application for ${job.display_title}`}
              style={{ padding: '8px 12px', fontSize: '0.8125rem' }}
            >
              <CheckSquare size={15} />
              <span>Track</span>
            </button>
          )}

          <a
            href={`/api/jobs/${job.id}/apply`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            aria-label={`Apply for ${job.display_title} at ${companyName} via ATS`}
            style={{ padding: '8px 14px', fontSize: '0.8125rem' }}
          >
            <span>Apply</span>
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Skills Footer */}
      {job.skills && job.skills.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
            marginTop: '12px',
            paddingTop: '10px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          {job.skills.slice(0, 6).map((skill) => (
            <span
              key={skill}
              style={{
                fontSize: '0.6875rem',
                fontWeight: 500,
                padding: '2px 7px',
                borderRadius: 'var(--radius-xs)',
                backgroundColor: 'var(--bg-surface-elevated)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {skill}
            </span>
          ))}
        </div>
      )}
    </article>
  );
};
