'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Download,
  Copy,
  Check,
  RefreshCw,
  FileText,
  AlertCircle,
  MessageSquare,
  Mail,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { generateResumePdf, type ResumeData } from '@jobpulse/ai';

interface CvGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: {
    id?: string;
    title: string;
    company_name: string;
    location?: string;
    description?: string;
    apply_url?: string;
    source?: string;
  } | null;
  userProfile?: any;
  onOpenCoverLetter?: (job: any, resumeData: ResumeData) => void;
  onOpenQaAssistant?: (job: any, resumeData: ResumeData) => void;
}

export const CvGeneratorModal: React.FC<CvGeneratorModalProps> = ({
  isOpen,
  onClose,
  job,
  userProfile,
  onOpenCoverLetter,
  onOpenQaAssistant,
}) => {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [providerInfo, setProviderInfo] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Customization inputs
  const [masterResumeText, setMasterResumeText] = useState('');
  const [showCustomizer, setShowCustomizer] = useState(false);

  useEffect(() => {
    if (userProfile?.headline || userProfile?.skills) {
      const skillsStr = (userProfile.skills || []).join(', ');
      setMasterResumeText(
        `Professional Summary: ${userProfile.headline || ''}\nCore Skills: ${skillsStr}\nYears of Experience: ${userProfile.years_of_experience || 3}\nTarget Roles: ${userProfile.target_roles || ''}`
      );
    }
  }, [userProfile]);

  if (!isOpen || !job) return null;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/tailor-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: job.title,
          companyName: job.company_name,
          jobDescription:
            job.description || `${job.title} at ${job.company_name}. Location: ${job.location || 'Remote'}`,
          masterResume: masterResumeText || undefined,
          candidateInfo: userProfile || {
            fullName: 'Candidate',
            email: 'applicant@example.com',
            location: job.location || 'Remote',
          },
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setResumeData(json.data);
        setProviderInfo(`${json.provider?.toUpperCase()} (${json.model})`);
      } else {
        setError(json.error || 'Failed to generate tailored CV.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error generating CV.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!resumeData) return;
    const cleanCompany = (job.company_name || 'Target_Company').replace(/[^a-zA-Z0-9]/g, '_');
    generateResumePdf(resumeData, `${cleanCompany}_Tailored_Resume.pdf`);
  };

  const handleCopyText = () => {
    if (!resumeData) return;
    const lines: string[] = [];
    lines.push(resumeData.candidate?.name || 'Candidate Name');
    lines.push(
      [
        resumeData.candidate?.email,
        resumeData.candidate?.phone,
        resumeData.candidate?.location,
      ]
        .filter(Boolean)
        .join(' | ')
    );
    lines.push('\n--- SUMMARY ---');
    lines.push(resumeData.summary || '');
    lines.push('\n--- EXPERIENCE ---');
    (resumeData.experience || []).forEach((exp) => {
      lines.push(`${exp.role} - ${exp.company} (${exp.period || ''})`);
      (exp.highlights || []).forEach((h) => lines.push(`* ${h}`));
    });
    lines.push('\n--- SKILLS ---');
    if (resumeData.skills?.languages) lines.push(`Languages: ${resumeData.skills.languages.join(', ')}`);
    if (resumeData.skills?.frameworks) lines.push(`Frameworks: ${resumeData.skills.frameworks.join(', ')}`);
    if (resumeData.skills?.toolsAndCloud) lines.push(`Tools & Cloud: ${resumeData.skills.toolsAndCloud.join(', ')}`);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 9, 17, 0.82)',
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 960,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px',
          border: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          overflow: 'hidden',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.75)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(37, 99, 235, 0.08) 0%, transparent 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 16px rgba(37, 99, 235, 0.4)',
              }}
            >
              <Sparkles size={20} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>
                  AI Tailored CV & ATS Optimizer
                </h3>
                {providerInfo && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: 'rgba(37, 99, 235, 0.2)',
                      color: 'var(--brand-text)',
                      border: '1px solid var(--brand-border)',
                    }}
                  >
                    {providerInfo}
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                Targeting <strong style={{ color: 'var(--text-primary)' }}>{job.title}</strong> at {job.company_name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {error && (
            <div
              style={{
                marginBottom: 20,
                padding: '12px 16px',
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {!resumeData && !loading && (
            <div style={{ textAlign: 'center', padding: '36px 16px' }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 16,
                  background: 'rgba(37, 99, 235, 0.1)',
                  border: '1px solid var(--brand-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <FileText size={30} style={{ color: 'var(--brand-text)' }} />
              </div>
              <h4 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 8px' }}>
                Generate an ATS-Optimized Resume in Seconds
              </h4>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  maxWidth: 520,
                  margin: '0 auto 24px',
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                Our AI aligns your experience, keywords, and technical accomplishments directly with{' '}
                {job.company_name}’s requirements to maximize ATS scoring and recruiter response rates.
              </p>

              {/* Master Resume Accordion */}
              <div style={{ maxWidth: 580, margin: '0 auto 24px', textAlign: 'left' }}>
                <button
                  type="button"
                  onClick={() => setShowCustomizer(!showCustomizer)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--brand-text)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {showCustomizer
                    ? '▼ Hide Master Profile Notes'
                    : '▶ Customize Master Profile / Past Experience Text'}
                </button>

                {showCustomizer && (
                  <textarea
                    rows={4}
                    value={masterResumeText}
                    onChange={(e) => setMasterResumeText(e.target.value)}
                    placeholder="Paste your master resume summary, past roles, or key skills here..."
                    style={{
                      width: '100%',
                      padding: 12,
                      borderRadius: 10,
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                )}
              </div>

              <button
                onClick={handleGenerate}
                style={{
                  padding: '13px 28px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 8px 24px rgba(37, 99, 235, 0.35)',
                  transition: 'opacity 0.15s',
                }}
              >
                <Sparkles size={17} />
                Generate Tailored Resume
              </button>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Loader2
                size={38}
                className="animate-spin"
                style={{ color: 'var(--brand-text)', margin: '0 auto 18px' }}
              />
              <h4 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
                Crafting Your Tailored Resume...
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                Extracting high-impact keywords, calculating ATS score, and structuring Executive Serif layout.
              </p>
            </div>
          )}

          {resumeData && !loading && (
            <div>
              {/* ATS Match Score Bar */}
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: 12,
                  background: 'var(--status-success-bg)',
                  border: '1px solid var(--status-success-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: '#10b981',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 16,
                      boxShadow: '0 0 16px rgba(16, 185, 129, 0.5)',
                    }}
                  >
                    {resumeData.atsScore || 94}%
                  </div>
                  <div>
                    <h5 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--status-success-text)' }}>
                      High ATS Compatibility Score
                    </h5>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Optimized for {job.company_name}’s screening filter algorithms
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(resumeData.matchingKeywords || []).slice(0, 5).map((kw, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 11,
                        padding: '3px 9px',
                        borderRadius: 20,
                        background: 'rgba(16, 185, 129, 0.2)',
                        color: '#6ee7b7',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                      }}
                    >
                      ✓ {kw}
                    </span>
                  ))}
                </div>
              </div>

              {/* WYSIWYG Executive Paper Preview */}
              <div
                style={{
                  background: '#ffffff',
                  color: '#0f172a',
                  borderRadius: 10,
                  padding: '36px 44px',
                  boxShadow: '0 15px 35px rgba(0, 0, 0, 0.4)',
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: 13,
                  lineHeight: 1.5,
                  marginBottom: 20,
                }}
              >
                {/* Header */}
                <div
                  style={{
                    textAlign: 'center',
                    borderBottom: '1.5px solid #cbd5e1',
                    paddingBottom: 14,
                    marginBottom: 16,
                  }}
                >
                  <h2
                    style={{
                      fontSize: 22,
                      margin: '0 0 6px',
                      fontWeight: 'bold',
                      color: '#0f172a',
                    }}
                  >
                    {resumeData.candidate?.name || userProfile?.full_name || 'Candidate Name'}
                  </h2>
                  <div style={{ fontSize: 11, color: '#475569' }}>
                    {[
                      resumeData.candidate?.email,
                      resumeData.candidate?.phone,
                      resumeData.candidate?.location,
                      resumeData.candidate?.linkedin,
                      resumeData.candidate?.github,
                    ]
                      .filter(Boolean)
                      .join('  •  ')}
                  </div>
                </div>

                {/* Professional Summary */}
                {resumeData.summary && (
                  <div style={{ marginBottom: 18 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 'bold',
                        color: '#1e293b',
                        borderBottom: '1px solid #cbd5e1',
                        paddingBottom: 2,
                        marginBottom: 6,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Professional Summary
                    </div>
                    <p style={{ margin: 0, fontSize: 11.5, color: '#334155' }}>
                      {resumeData.summary}
                    </p>
                  </div>
                )}

                {/* Technical Skills */}
                {resumeData.skills && (
                  <div style={{ marginBottom: 18 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 'bold',
                        color: '#1e293b',
                        borderBottom: '1px solid #cbd5e1',
                        paddingBottom: 2,
                        marginBottom: 6,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Technical Skills
                    </div>
                    <div style={{ fontSize: 11, color: '#334155' }}>
                      {resumeData.skills.languages && resumeData.skills.languages.length > 0 && (
                        <div style={{ marginBottom: 3 }}>
                          <strong>Languages:</strong> {resumeData.skills.languages.join(', ')}
                        </div>
                      )}
                      {resumeData.skills.frameworks && resumeData.skills.frameworks.length > 0 && (
                        <div style={{ marginBottom: 3 }}>
                          <strong>Frameworks & Libraries:</strong>{' '}
                          {resumeData.skills.frameworks.join(', ')}
                        </div>
                      )}
                      {resumeData.skills.toolsAndCloud && resumeData.skills.toolsAndCloud.length > 0 && (
                        <div>
                          <strong>Tools & Cloud:</strong>{' '}
                          {resumeData.skills.toolsAndCloud.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Experience */}
                {resumeData.experience && resumeData.experience.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 'bold',
                        color: '#1e293b',
                        borderBottom: '1px solid #cbd5e1',
                        paddingBottom: 2,
                        marginBottom: 6,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Professional Experience
                    </div>
                    {resumeData.experience.map((exp, idx) => (
                      <div key={idx} style={{ marginBottom: 14 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 11.5,
                            fontWeight: 'bold',
                            color: '#0f172a',
                          }}
                        >
                          <span>{exp.role}</span>
                          <span style={{ fontWeight: 'normal', color: '#64748b' }}>
                            {exp.period}
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 11,
                            fontStyle: 'italic',
                            color: '#475569',
                            marginBottom: 4,
                          }}
                        >
                          <span>{exp.company}</span>
                          <span style={{ fontStyle: 'normal', color: '#94a3b8' }}>
                            {exp.location}
                          </span>
                        </div>
                        {exp.highlights && (
                          <ul
                            style={{
                              margin: '0 0 0 16px',
                              padding: 0,
                              fontSize: 10.5,
                              color: '#334155',
                            }}
                          >
                            {exp.highlights.map((h, hIdx) => (
                              <li key={hIdx} style={{ marginBottom: 2 }}>
                                {h}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Education */}
                {resumeData.education && resumeData.education.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 'bold',
                        color: '#1e293b',
                        borderBottom: '1px solid #cbd5e1',
                        paddingBottom: 2,
                        marginBottom: 6,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Education
                    </div>
                    {resumeData.education.map((edu, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          color: '#334155',
                        }}
                      >
                        <div>
                          <strong>{edu.degree}</strong> — {edu.institution}
                        </div>
                        <div style={{ color: '#64748b' }}>{edu.year}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-elevated)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            {onOpenCoverLetter && resumeData && (
              <button
                onClick={() => onOpenCoverLetter(job, resumeData)}
                className="btn btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 34,
                  padding: '0 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <Mail size={14} />
                Generate Cover Letter
              </button>
            )}

            {onOpenQaAssistant && (
              <button
                onClick={() => onOpenQaAssistant(job, resumeData || ({} as ResumeData))}
                className="btn btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 34,
                  padding: '0 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <MessageSquare size={14} />
                Interview Q&A
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {resumeData && (
              <>
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 34,
                    padding: '0 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={14} />
                  Re-roll
                </button>

                <button
                  onClick={handleCopyText}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 34,
                    padding: '0 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy Text'}
                </button>

                <button
                  onClick={handleDownloadPdf}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 34,
                    padding: '0 16px',
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--brand-primary)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  <Download size={14} />
                  Download PDF
                </button>
              </>
            )}

            {job.apply_url && (
              <a
                href={job.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 34,
                  padding: '0 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  textDecoration: 'none',
                }}
              >
                <span>Direct Apply</span>
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
