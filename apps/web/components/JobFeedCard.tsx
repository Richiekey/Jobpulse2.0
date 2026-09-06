'use client';

import React from 'react';
import {
  Building2,
  MapPin,
  DollarSign,
  Calendar,
  Bookmark,
  CheckSquare,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { formatSalary } from '@/lib/format-salary';
import { Badge } from '@/components/ui';

interface JobFeedCardProps {
  job: any;
  isSelected?: boolean;
  onSelect: () => void;
  isSaved?: boolean;
  onToggleSave?: (e: React.MouseEvent, jobId: string) => void;
  isApplied?: boolean;
  onTrackApplication?: (e: React.MouseEvent, job: any) => void;
}

export const JobFeedCard: React.FC<JobFeedCardProps> = ({
  job,
  isSelected = false,
  onSelect,
  isSaved = false,
  onToggleSave,
  isApplied = false,
  onTrackApplication,
}) => {
  const rawCompanyName = job.companies?.name || 'Verified Employer';
  const companyName = rawCompanyName.replace(/^\[(.*)\]$/, '$1').trim();
  const companyLogo = job.companies?.logo_url;

  const formattedSalary = formatSalary({
    min: job.salary_min,
    max: job.salary_max,
    currency: job.salary_currency,
    interval: job.salary_interval,
  });

  const timeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Recently';
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    const days = Math.floor(seconds / 86400);
    return `${days}d ago`;
  };

  const atsPlatform = job.ats_platform_slug || 'direct';
  const isJobright = atsPlatform === 'jobright';
  const atsNameMap: Record<string, string> = {
    greenhouse: 'Greenhouse',
    lever: 'Lever',
    ashby: 'Ashby',
    workday: 'Workday',
    smartrecruiters: 'SmartRecruiters',
    icims: 'iCIMS',
    successfactors: 'SuccessFactors',
    oracle: 'Oracle Cloud',
    jobright: 'Jobright Aggregator',
  };

  const primaryLocation =
    job.location_city && job.location_country
      ? `${job.location_city}, ${job.location_country}`
      : job.locations && job.locations.length > 0
      ? job.locations[0]
      : 'Unspecified';

  const rawTitle = job.canonical_title || job.display_title || 'Untitled Role';
  const cleanTitle = rawTitle.replace(/^\[(.*)\]$/, '$1').trim();

  return (
    <div
      onClick={onSelect}
      className={`job-feed-item ${isSelected ? 'selected' : ''}`}
      style={{
        padding: '14px 16px',
        backgroundColor: isSelected ? 'var(--bg-surface-elevated)' : 'var(--bg-surface)',
        border: `1px solid ${isSelected ? 'var(--brand-primary)' : 'var(--border-subtle)'}`,
        borderLeft: isSelected ? '4px solid var(--brand-primary)' : '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        position: 'relative',
      }}
    >
      {/* Top Row: Company & Badges */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          {companyLogo ? (
            <img
              src={companyLogo}
              alt=""
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                objectFit: 'contain',
                backgroundColor: 'var(--bg-surface-subtle)',
              }}
            />
          ) : (
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-surface-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Building2 size={13} color="var(--text-muted)" />
            </div>
          )}
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {companyName}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {atsPlatform && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 'var(--radius-xs)',
                backgroundColor: isJobright ? 'var(--status-info-bg)' : 'var(--bg-surface-subtle)',
                border: `1px solid ${isJobright ? 'var(--status-info-border)' : 'var(--border-subtle)'}`,
                color: isJobright ? 'var(--status-info-text)' : 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
              title={isJobright ? 'Aggregated via Jobright Collection' : `Direct ATS (${atsNameMap[atsPlatform] || atsPlatform})`}
            >
              {isJobright ? 'Aggregator' : (atsNameMap[atsPlatform] || atsPlatform)}
            </span>
          )}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{timeAgo(job.posted_at)}</span>
        </div>
      </div>

      {/* Middle Row: Title */}
      <h3
        style={{
          fontSize: '14px',
          fontWeight: 700,
          color: isSelected ? 'var(--brand-text)' : 'var(--text-primary)',
          lineHeight: 1.3,
          margin: 0,
        }}
      >
        {cleanTitle}
      </h3>

      {/* Attributes & Pills */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
        {job.is_remote || job.workplace_type === 'remote' ? (
          <Badge variant="success" size="sm">
            Remote
          </Badge>
        ) : job.workplace_type === 'hybrid' ? (
          <Badge variant="info" size="sm">
            Hybrid
          </Badge>
        ) : (
          <Badge variant="default" size="sm">
            {primaryLocation}
          </Badge>
        )}

        {formattedSalary && (
          <Badge variant="warning" size="sm">
            {formattedSalary}
          </Badge>
        )}

        {job.equity_mentioned && (
          <Badge variant="primary" size="sm">
            Equity
          </Badge>
        )}

        {job.job_function_slug && (
          <Badge variant="neutral" size="sm">
            {job.job_function_slug.replace(/-/g, ' ')}
          </Badge>
        )}
      </div>

      {/* Action Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '2px',
          paddingTop: '6px',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isApplied ? (
            <span style={{ fontSize: '11px', color: 'var(--success-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
              ✓ Applied
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onTrackApplication) onTrackApplication(e, job);
              }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '11px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: 'var(--radius-xs)',
              }}
              title="Mark as Applied"
            >
              + Mark Applied
            </button>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onToggleSave) onToggleSave(e, job.id);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: isSaved ? 'var(--brand-primary)' : 'var(--text-muted)',
            cursor: 'pointer',
            padding: '2px',
          }}
          title={isSaved ? 'Remove Bookmark' : 'Bookmark Job'}
        >
          <Bookmark size={14} fill={isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  );
};
