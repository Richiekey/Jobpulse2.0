'use client';

import React, { useState, useEffect } from 'react';
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
  Loader2,
} from 'lucide-react';
import { formatSalary } from '@/lib/format-salary';
import { isPresentableSalary } from '@/lib/salary-shield';

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
  job: initialJob,
  isSaved = false,
  onToggleSave,
  isApplied = false,
  onTrackApplication,
  onNextJob,
  onPrevJob,
  hasNext = false,
  hasPrev = false,
}) => {
  const [job, setJob] = useState<any>(initialJob);
  const [isResolving, setIsResolving] = useState<boolean>(false);

  useEffect(() => {
    setJob(initialJob);
  }, [initialJob?.id, initialJob?.apply_url]);

  useEffect(() => {
    if (!job) return;

    const isJobright =
      job.ats_platform_slug === 'jobright' ||
      job.source === 'jobright' ||
      job.source_metadata?.originalSource === 'jobright_github_markdown' ||
      job.apply_url?.includes('jobright.ai');

    const hasDirectAts = job.apply_url && !job.apply_url.includes('jobright.ai');

    if (isJobright && !hasDirectAts && job.source_metadata?.enrichment_status !== 'enriched') {
      let isMounted = true;
      setIsResolving(true);
      fetch(`/api/jobs/${job.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (isMounted && data.success && data.data) {
            setJob((prev: any) => (prev?.id === data.data.id ? { ...prev, ...data.data } : prev));
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setIsResolving(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [job?.id]);
  if (!job) {
    return (
      <div
        className="job-inspector-pane"
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          backgroundColor: 'var(--bg-surface)',
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

  const rawCompanyName = job.companies?.name || 'Verified Employer';
  const companyName = rawCompanyName.replace(/^\[(.*)\]$/, '$1').trim();
  const companyLogo = job.companies?.logo_url;
  const companyWebsite = job.companies?.website;
  const companyIndustry = job.companies?.industry;

  const rawTitle = job.display_title || job.canonical_title || 'Untitled Opportunity';
  const cleanTitle = rawTitle.replace(/^\[(.*)\]$/, '$1').trim();

  const rawSalaryObj = {
    min: job.salary_min,
    max: job.salary_max,
    currency: job.salary_currency,
    interval: job.salary_interval,
  };
  const isSalaryValid = isPresentableSalary(rawSalaryObj);

  const formattedSalary = isSalaryValid
    ? formatSalary(rawSalaryObj)
    : null;

  const displaySalary = formattedSalary
    ? (job.salary_currency ? formattedSalary : `${formattedSalary} (Currency not disclosed)`)
    : 'Not Disclosed';

  let annualizedEst: string | null = null;
  if (
    isSalaryValid &&
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
      annualizedEst = `Est. Annualized (2,080 hrs full-time): ~${formattedAnnual}`;
    }
  }

  const atsPlatform = job.ats_platform_slug || 'direct';
  const isJobrightSource =
    atsPlatform === 'jobright' ||
    job.source === 'jobright' ||
    job.source_metadata?.originalSource === 'jobright_github_markdown' ||
    Boolean(job.source_metadata?.jobright_reference_url) ||
    Boolean(job.apply_url?.includes('jobright.ai'));

  const atsNameMap: Record<string, string> = {
    greenhouse: 'Greenhouse ATS',
    lever: 'Lever ATS',
    ashby: 'Ashby ATS',
    workday: 'Workday ATS',
    smartrecruiters: 'SmartRecruiters',
    icims: 'iCIMS',
    successfactors: 'SAP SuccessFactors',
    oracle: 'Oracle Cloud HCM',
    jobright: 'Jobright Aggregator',
  };

  // Direct ATS / Employer Link
  const directAtsUrl =
    (job.apply_url && !job.apply_url.includes('jobright.ai') ? job.apply_url : null) ||
    (job.original_apply_url && !job.original_apply_url.includes('jobright.ai') ? job.original_apply_url : null) ||
    (job.canonical_url && !job.canonical_url.includes('jobright.ai') ? job.canonical_url : null) ||
    (job.source_metadata?.ats_url && !job.source_metadata.ats_url.includes('jobright.ai') ? job.source_metadata.ats_url : null) ||
    null;

  // Jobright Reference URL
  const jobrightUrl =
    job.source_metadata?.jobright_reference_url ||
    (job.apply_url?.includes('jobright.ai') ? job.apply_url : null) ||
    (job.original_apply_url?.includes('jobright.ai') ? job.original_apply_url : null) ||
    (job.job_sources?.find((s: any) => s.source_job_url?.includes('jobright.ai'))?.source_job_url) ||
    null;

  const primaryApplyUrl = directAtsUrl || jobrightUrl || job.apply_url || job.canonical_url || '';
  const isDirectAts = Boolean(directAtsUrl);

  let applyButtonLabel = 'Apply on Company Site';
  if (isDirectAts) {
    applyButtonLabel = 'Apply on company site';
  } else if (isResolving) {
    applyButtonLabel = 'Resolving Direct ATS...';
  } else if (isJobrightSource || (primaryApplyUrl && primaryApplyUrl.includes('jobright.ai'))) {
    applyButtonLabel = 'View on Jobright';
  }

  return (
    <div
      className="job-inspector-pane"
      style={{
        flex: 1,
        minWidth: 0,
        height: '100%',
        backgroundColor: 'var(--bg-surface)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {/* Sticky Action Header */}
      <div
        style={{
          padding: '12px 20px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', overflowX: 'auto' }}>
          {primaryApplyUrl ? (
            <a
              href={primaryApplyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '34px',
                padding: '0 16px',
                fontSize: '13px',
                fontWeight: 700,
                textDecoration: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--brand-primary)',
                color: '#ffffff',
                whiteSpace: 'nowrap',
                boxSizing: 'border-box',
              }}
            >
              <span>{applyButtonLabel}</span>
              {isResolving ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            </a>
          ) : (
            <button
              disabled
              className="btn btn-secondary"
              style={{
                height: '34px',
                padding: '0 14px',
                fontSize: '13px',
                whiteSpace: 'nowrap',
                boxSizing: 'border-box',
              }}
            >
              No Direct Link
            </button>
          )}

          {/* Secondary Jobright Button if direct apply exists and job originated from Jobright */}
          {jobrightUrl && directAtsUrl && (
            <a
              href={jobrightUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '34px',
                padding: '0 12px',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                boxSizing: 'border-box',
                transition: 'all 0.15s ease',
              }}
              title="View original Jobright listing"
            >
              <span>Jobright</span>
              <ExternalLink size={13} color="var(--text-muted)" />
            </a>
          )}

          <button
            onClick={() => onTrackApplication && onTrackApplication(job)}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              height: '34px',
              padding: '0 12px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: isApplied ? 'var(--success-surface)' : 'var(--bg-surface-elevated)',
              border: isApplied ? '1px solid var(--success-border)' : '1px solid var(--border-default)',
              color: isApplied ? 'var(--success-text)' : 'var(--text-primary)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxSizing: 'border-box',
            }}
          >
            <CheckSquare size={15} />
            <span>{isApplied ? 'Application Recorded' : 'Mark Applied'}</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={() => onToggleSave && onToggleSave(job.id)}
            style={{
              height: '34px',
              width: '34px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: isSaved ? 'var(--brand-surface)' : 'var(--bg-surface-elevated)',
              color: isSaved ? 'var(--brand-text)' : 'var(--text-secondary)',
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
            title={isSaved ? 'Saved' : 'Save Job'}
          >
            <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />
          </button>

          {hasPrev && (
            <button
              onClick={onPrevJob}
              style={{
                height: '34px',
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-elevated)',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                boxSizing: 'border-box',
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
                height: '34px',
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-elevated)',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                boxSizing: 'border-box',
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
            {cleanTitle}
          </h2>

          {/* Metadata Badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {isJobrightSource && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.28)',
                  color: '#38bdf8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                JOBRIGHT
              </span>
            )}

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: isDirectAts ? 'rgba(16, 185, 129, 0.12)' : 'var(--status-info-bg)',
                border: isDirectAts ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid var(--status-info-border)',
                color: isDirectAts ? '#34d399' : 'var(--status-info-text)',
              }}
              title={isDirectAts ? `Direct ATS (${atsNameMap[atsPlatform] || 'Verified Employer Board'})` : 'Aggregated listing'}
            >
              <ShieldCheck size={14} />
              {isDirectAts ? (atsNameMap[atsPlatform] || 'Verified Direct ATS') : 'Jobright Aggregator'}
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

        {/* Dedicated Direct ATS & Jobright Links Section (Employer Reference Layout) */}
        {(directAtsUrl || jobrightUrl) && (
          <div
            style={{
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            {directAtsUrl && (
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    marginBottom: '4px',
                  }}
                >
                  ORIGINAL APPLY (COMPANY / ATS)
                </div>
                <a
                  href={directAtsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#38bdf8',
                    fontSize: '13px',
                    wordBreak: 'break-all',
                    textDecoration: 'underline',
                    lineHeight: 1.45,
                    display: 'inline-block',
                  }}
                >
                  {directAtsUrl}
                </a>
              </div>
            )}

            {jobrightUrl && (
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    marginBottom: '4px',
                  }}
                >
                  JOBRIGHT LISTING
                </div>
                <a
                  href={jobrightUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#38bdf8',
                    fontSize: '13px',
                    wordBreak: 'break-all',
                    textDecoration: 'underline',
                    lineHeight: 1.45,
                    display: 'inline-block',
                  }}
                >
                  {jobrightUrl}
                </a>
              </div>
            )}
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

        {/* Provenance & Destination Breakdown */}
        <div
          style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: 'var(--font-size-xs)',
          }}
        >
          <span style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Provenance & Destination Metadata
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Employer: </span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{companyName}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Job Source: </span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {isJobrightSource ? 'Jobright GitHub Collection' : (job.source || 'Direct ATS')}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Platform / ATS: </span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {atsNameMap[atsPlatform] || atsPlatform}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Application Link: </span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {isDirectAts ? 'Direct Employer ATS' : (isJobrightSource ? 'Aggregator Redirect' : 'Standard Link')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
