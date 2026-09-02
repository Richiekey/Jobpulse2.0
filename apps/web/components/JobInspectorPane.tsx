'use client';

import React from 'react';
import {
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
  Briefcase,
  Share2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { formatSalary } from '@/lib/format-salary';

interface JobInspectorPaneProps {
  job: any | null;
  isSaved?: boolean;
  onToggleSave?: (jobId: string) => void;
  isApplied?: boolean;
  onTrackApplication?: (job: any) => void;
  onNextJob?: () => void;
  onPrevJob?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export const JobInspectorPane: React.FC<JobInspectorPaneProps> = ({
  job,
  isSaved = false,
  onToggleSave,
  isApplied = false,
  onTrackApplication,
  onNextJob,
  onPrevJob,
  hasNext = false,
  hasPrev = false,
}) => {
  if (!job) {
    return (
      <div
        style={{
          flex: '1.4',
          height: 'calc(100vh - 120px)',
          backgroundColor: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-xl)',
            backgroundColor: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
        >
          <Briefcase size={28} color="var(--text-muted)" />
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Select a Job to Inspect</h3>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '320px', lineHeight: 1.5 }}>
          Use the stream on the left or press <kbd style={{ padding: '2px 6px', background: 'var(--bg-surface-elevated)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>↑</kbd> / <kbd style={{ padding: '2px 6px', background: 'var(--bg-surface-elevated)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>↓</kbd> to rapidly inspect verified direct-ATS postings.
        </p>
      </div>
    );
  }

  const companyName = job.companies?.name || 'Verified Employer';
  const companyLogo = job.companies?.logo_url;
  const companyWebsite = job.companies?.website;
  const companyIndustry = job.companies?.industry;

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

  const atsPlatform = job.ats_platform_slug || 'direct';
  const atsNameMap: Record<string, string> = {
    greenhouse: 'Greenhouse ATS',
    lever: 'Lever ATS',
    ashby: 'Ashby ATS',
    workday: 'Workday CXS',
    smartrecruiters: 'SmartRecruiters',
    icims: 'iCIMS Portal',
    successfactors: 'SAP SuccessFactors',
    oracle: 'Oracle Cloud HCM',
    jobright: 'Jobright Aggregator',
  };

  const applyUrl = job.apply_url || job.canonical_url || '';

  return (
    <div
      className="job-inspector-pane"
      style={{
        flex: '1.4',
        height: 'calc(100vh - 120px)',
        backgroundColor: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        position: 'sticky',
        top: '120px',
      }}
    >
      {/* Sticky Action Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {applyUrl ? (
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: 700,
                textDecoration: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--brand-primary)',
                color: '#ffffff',
              }}
            >
              <span>Apply on {atsNameMap[atsPlatform] || 'Company Site'}</span>
              <ExternalLink size={14} />
            </a>
          ) : (
            <button disabled className="btn btn-secondary" style={{ padding: '9px 16px', fontSize: '13px' }}>
              No Direct Link
            </button>
          )}

          <button
            onClick={() => onTrackApplication && onTrackApplication(job)}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: isApplied ? 'var(--success-surface)' : 'var(--bg-surface-elevated)',
              border: isApplied ? '1px solid var(--success-border)' : '1px solid var(--border-default)',
              color: isApplied ? 'var(--success-text)' : 'var(--text-primary)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
            }}
          >
            <CheckSquare size={15} />
            <span>{isApplied ? 'Application Recorded' : 'Mark Applied'}</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => onToggleSave && onToggleSave(job.id)}
            style={{
              padding: '8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: isSaved ? 'var(--brand-surface)' : 'var(--bg-surface-elevated)',
              color: isSaved ? 'var(--brand-text)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            title={isSaved ? 'Saved' : 'Save Job'}
          >
            <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
          </button>

          {hasPrev && (
            <button
              onClick={onPrevJob}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-elevated)',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title="Previous job (↑)"
            >
              Prev
            </button>
          )}
          {hasNext && (
            <button
              onClick={onNextJob}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-elevated)',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title="Next job (↓)"
            >
              Next
            </button>
          )}
        </div>
      </div>

      {/* Main Content Body */}
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Company & Title Header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            {companyLogo ? (
              <img
                src={companyLogo}
                alt=""
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 'var(--radius-md)',
                  objectFit: 'contain',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  padding: '4px',
                }}
              />
            ) : (
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Building2 size={20} color="var(--text-muted)" />
              </div>
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{companyName}</span>
                {companyWebsite && (
                  <a
                    href={companyWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--brand-text)', display: 'flex', alignItems: 'center' }}
                  >
                    <Globe size={13} />
                  </a>
                )}
              </div>
              {companyIndustry && (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{companyIndustry}</span>
              )}
            </div>
          </div>

          <h2 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25, marginBottom: '12px' }}>
            {job.display_title || job.canonical_title}
          </h2>

          {/* Metadata Badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: '#34d399',
              }}
            >
              <ShieldCheck size={14} />
              {atsNameMap[atsPlatform] || 'Verified ATS'}
            </span>

            {job.job_function_slug && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '12px',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Briefcase size={13} />
                {job.job_function_slug.replace(/-/g, ' ')}
              </span>
            )}

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <MapPin size={13} />
              {job.is_remote ? 'Remote' : (job.locations || []).join(', ') || 'Unspecified'}
            </span>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <Calendar size={13} />
              {job.posted_at ? new Date(job.posted_at).toLocaleDateString() : 'Recently'}
            </span>
          </div>
        </div>

        {/* Compensation Highlight Card */}
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
              Estimated Compensation
            </span>
            <div style={{ fontSize: '18px', fontWeight: 800, color: formattedSalary ? '#fbbf24' : 'var(--text-secondary)', marginTop: '2px' }}>
              {displaySalary}
            </div>
            {annualizedEst && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{annualizedEst}</span>
            )}
          </div>

          {job.equity_mentioned && (
            <div
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(168, 85, 247, 0.15)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                color: '#c084fc',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Sparkles size={13} />
              Equity Offered
            </div>
          )}
        </div>

        {/* Skills Tag Cloud */}
        {job.skills && job.skills.length > 0 && (
          <div>
            <h4 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '8px' }}>
              Detected Skills & Technologies
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {job.skills.map((s: string) => (
                <span
                  key={s}
                  style={{
                    fontSize: '12px',
                    padding: '4px 9px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--brand-text)',
                    fontWeight: 500,
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Job Description */}
        <div>
          <h4 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '12px' }}>
            Job Description & Responsibilities
          </h4>
          <div
            className="job-description-content"
            style={{
              fontSize: '14px',
              lineHeight: 1.65,
              color: 'var(--text-secondary)',
            }}
          >
            {job.description_html ? (
              <div
                dangerouslySetInnerHTML={{ __html: job.description_html }}
                style={{
                  wordBreak: 'break-word',
                }}
              />
            ) : (
              <p style={{ whiteSpace: 'pre-line' }}>{job.description}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
