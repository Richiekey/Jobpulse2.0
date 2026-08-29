'use client';

import React from 'react';
import {
  Building2,
  MapPin,
  DollarSign,
  Clock,
  ExternalLink,
  Bookmark,
  CheckSquare,
  Sparkles,
} from 'lucide-react';

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
  const companyName = job.companies?.name || 'Verified Company';
  const companyLogo = job.companies?.logo_url;

  // Format salary
  let salaryString: string | null = null;
  if (job.salary_min || job.salary_max) {
    const symbol = job.salary_currency === 'EUR' ? '€' : job.salary_currency === 'GBP' ? '£' : '$';
    if (job.salary_min && job.salary_max) {
      salaryString = `${symbol}${(job.salary_min / 1000).toFixed(0)}k - ${symbol}${(job.salary_max / 1000).toFixed(0)}k`;
    } else if (job.salary_max) {
      salaryString = `Up to ${symbol}${(job.salary_max / 1000).toFixed(0)}k`;
    } else if (job.salary_min) {
      salaryString = `From ${symbol}${(job.salary_min / 1000).toFixed(0)}k`;
    }
  }

  // Format relative time
  const postedDate = new Date(job.posted_at);
  const diffDays = Math.floor((Date.now() - postedDate.getTime()) / (1000 * 60 * 60 * 24));
  const timeAgo = diffDays === 0 ? 'Today' : diffDays === 1 ? '1 day ago' : `${diffDays}d ago`;

  // Detect ATS slug from apply URL
  let atsName = 'Direct ATS';
  if (job.apply_url.includes('greenhouse.io')) atsName = 'Greenhouse';
  else if (job.apply_url.includes('lever.co')) atsName = 'Lever';
  else if (job.apply_url.includes('ashbyhq.com')) atsName = 'Ashby';
  else if (job.apply_url.includes('myworkdayjobs.com')) atsName = 'Workday';

  return (
    <div
      className="glass-card"
      style={{
        padding: '20px 24px',
        marginBottom: '16px',
        cursor: 'pointer',
      }}
      onClick={() => onOpenDetails?.(job.id)}
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
        {/* Left Side: Company Logo + Title + Metadata */}
        <div style={{ display: 'flex', gap: '16px', flex: '1 1 400px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
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
              <Building2 size={24} color="var(--text-muted)" />
            )}
          </div>

          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '4px',
              }}
            >
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {companyName}
              </span>
              <span className="badge badge-ats">
                <Sparkles size={11} />
                {atsName}
              </span>
              {job.workplace_type === 'remote' && <span className="badge badge-remote">Remote</span>}
              {job.workplace_type === 'hybrid' && <span className="badge badge-hybrid">Hybrid</span>}
              {job.workplace_type === 'on_site' && <span className="badge badge-onsite">On-Site</span>}
            </div>

            <h3
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '8px',
                lineHeight: 1.3,
              }}
            >
              {job.display_title}
            </h3>

            {/* Badges & Info row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                flexWrap: 'wrap',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPin size={14} />
                <span>{job.locations.slice(0, 2).join(', ')}</span>
              </div>

              {salaryString && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: '#22d3ee',
                    fontWeight: 600,
                  }}
                >
                  <DollarSign size={14} />
                  <span>{salaryString}</span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={14} />
                <span>{timeAgo}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Quick Action Buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {onToggleSave && (
            <button
              onClick={() => onToggleSave(job.id)}
              className="btn btn-icon"
              title={isSaved ? 'Remove from Saved' : 'Save Job'}
              style={{
                color: isSaved ? 'var(--accent-primary)' : 'var(--text-muted)',
                borderColor: isSaved ? 'var(--accent-primary)' : 'var(--border-color)',
                background: isSaved ? 'var(--accent-glow)' : 'var(--bg-secondary)',
              }}
            >
              <Bookmark size={18} fill={isSaved ? 'currentColor' : 'none'} />
            </button>
          )}

          {onTrackApplication && (
            <button
              onClick={() => onTrackApplication(job)}
              className="btn btn-secondary"
              title="Track your application progress"
              style={{ padding: '8px 12px', fontSize: '0.8rem' }}
            >
              <CheckSquare size={16} />
              <span>Track</span>
            </button>
          )}

          <a
            href={`/api/jobs/${job.id}/apply`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <span>Apply Direct</span>
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {/* Skills tags preview */}
      {job.skills && job.skills.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          {job.skills.slice(0, 6).map((skill) => (
            <span
              key={skill}
              style={{
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.04)',
                color: 'var(--text-secondary)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {skill}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
