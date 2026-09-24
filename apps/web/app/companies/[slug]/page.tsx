'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  Building2,
  Globe,
  Briefcase,
  MapPin,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  ArrowLeft,
  Search,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import { CvGeneratorModal } from '@/components/CvGeneratorModal';

interface CompanyDetailPageProps {
  params: Promise<{ slug: string }>;
}

export default function CompanyDetailPage({ params }: CompanyDetailPageProps) {
  const { slug } = use(params);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ company: any; jobs: any[]; total_active_jobs: number } | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedJobForAi, setSelectedJobForAi] = useState<any | null>(null);

  useEffect(() => {
    async function loadCompanyData() {
      try {
        setLoading(true);
        const res = await fetch(`/api/companies/${slug}`);
        if (res.ok) {
          const json = await res.json();
          setData(json.data);
        }
      } catch (err) {
        console.error('Failed to load company:', err);
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      loadCompanyData();
    }
  }, [slug]);

  const company = data?.company;
  const jobs = data?.jobs || [];

  const filteredJobs = jobs.filter((j) => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    const title = (j.display_title || j.canonical_title || '').toLowerCase();
    const locs = (j.locations || []).join(' ').toLowerCase();
    const skills = (j.skills || []).join(' ').toLowerCase();
    return title.includes(term) || locs.includes(term) || skills.includes(term);
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Top Navbar */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Live Job Stream</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 'var(--radius-xs)',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              color: 'var(--brand-text)',
              textTransform: 'uppercase',
            }}
          >
            Verified ATS Company Hub
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
            <Building2 size={40} style={{ animation: 'pulse 1.5s infinite', margin: '0 auto 16px' }} />
            <p style={{ fontSize: '15px' }}>Loading verified company openings...</p>
          </div>
        ) : !company ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Company Not Found</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
              We could not find active postings or verified records for this organization.
            </p>
            <Link
              href="/"
              style={{
                display: 'inline-block',
                marginTop: '16px',
                padding: '8px 16px',
                backgroundColor: 'var(--brand-primary)',
                color: '#fff',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              Return to Feed
            </Link>
          </div>
        ) : (
          <>
            {/* Company Hero Banner */}
            <div
              style={{
                padding: '28px',
                borderRadius: 'var(--radius-xl)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '20px',
                marginBottom: '28px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                {company.logo_url ? (
                  <img
                    src={company.logo_url}
                    alt=""
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: 'var(--radius-lg)',
                      objectFit: 'contain',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      padding: '8px',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: 'var(--radius-lg)',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Building2 size={32} color="var(--brand-primary)" />
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>{company.name}</h1>
                    {company.verified && (
                      <span title="Verified Direct ATS Connection">
                        <CheckCircle2 size={18} color="#38bdf8" />
                      </span>
                    )}
                    {company.is_staffing_agency && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          textTransform: 'uppercase',
                        }}
                      >
                        Staffing Agency
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {company.industry && <span>{company.industry}</span>}
                    {company.website && (
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--brand-text)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                      >
                        <Globe size={13} />
                        <span>Website</span>
                      </a>
                    )}
                    <span>{jobs.length} Active {jobs.length === 1 ? 'Opening' : 'Openings'}</span>
                  </div>
                </div>
              </div>

              {company.careers_url && (
                <a
                  href={company.careers_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    color: 'var(--text-primary)',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <span>Official Careers Site</span>
                  <ExternalLink size={13} />
                </a>
              )}
            </div>

            {/* Filter Toolbar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                <Search
                  size={15}
                  color="var(--text-muted)"
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  placeholder={`Search ${company.name} jobs by title or skill...`}
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Showing {filteredJobs.length} of {jobs.length}
              </span>
            </div>

            {/* Jobs List */}
            {filteredJobs.length === 0 ? (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <Briefcase size={32} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  No active jobs match your search filter.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredJobs.map((job) => {
                  const title = job.display_title || job.canonical_title || 'Untitled Role';
                  const locations = (job.locations && job.locations.length > 0)
                    ? job.locations.join(', ')
                    : 'Unspecified';

                  return (
                    <div
                      key={job.id}
                      style={{
                        padding: '16px 20px',
                        borderRadius: 'var(--radius-lg)',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        transition: 'border-color 0.2s',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                            {title}
                          </h3>
                          {job.workplace_type === 'remote' && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: 'var(--radius-xs)',
                                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                color: '#4ade80',
                                textTransform: 'uppercase',
                              }}
                            >
                              Remote
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '12px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={12} />
                            <span>{locations}</span>
                          </span>

                          {job.salary_max && (
                            <span>
                              ${Number(job.salary_min || 0).toLocaleString()} - ${Number(job.salary_max).toLocaleString()}
                            </span>
                          )}

                          {job.posted_at && (
                            <span>Posted {new Date(job.posted_at).toLocaleDateString()}</span>
                          )}
                        </div>

                        {job.skills && job.skills.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                            {job.skills.slice(0, 6).map((skill: string) => (
                              <span
                                key={skill}
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 6px',
                                  borderRadius: 'var(--radius-xs)',
                                  backgroundColor: 'var(--bg-surface-elevated)',
                                  border: '1px solid var(--border-subtle)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={() => setSelectedJobForAi(job)}
                          style={{
                            height: '34px',
                            padding: '0 12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid rgba(37, 99, 235, 0.3)',
                            backgroundColor: 'rgba(37, 99, 235, 0.12)',
                            color: 'var(--brand-text)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          title="Generate tailored resume for this opening"
                        >
                          <Sparkles size={13} color="#60a5fa" />
                          <span>Tailor CV</span>
                        </button>

                        {(job.apply_url || job.canonical_url) && (
                          <a
                            href={job.apply_url || job.canonical_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              height: '34px',
                              padding: '0 14px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              borderRadius: 'var(--radius-md)',
                              backgroundColor: 'var(--brand-primary)',
                              color: '#fff',
                              fontSize: '12px',
                              fontWeight: 700,
                              textDecoration: 'none',
                            }}
                          >
                            <span>Apply</span>
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* AI Resume Tailor Modal */}
      {selectedJobForAi && (
        <CvGeneratorModal
          isOpen={true}
          onClose={() => setSelectedJobForAi(null)}
          job={selectedJobForAi}
        />
      )}
    </div>
  );
}
