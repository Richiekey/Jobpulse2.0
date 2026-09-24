'use client';

import React, { useState } from 'react';
import {
  X,
  Mail,
  Sparkles,
  Copy,
  Check,
  Download,
  Loader2,
  RefreshCw,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { generateCoverLetterPdf } from '@jobpulse/ai';

interface CoverLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: {
    title: string;
    company_name: string;
    description?: string;
  } | null;
  tailoredResume?: any;
  userProfile?: any;
}

export const CoverLetterModal: React.FC<CoverLetterModalProps> = ({
  isOpen,
  onClose,
  job,
  tailoredResume,
  userProfile,
}) => {
  const [loading, setLoading] = useState(false);
  const [coverLetter, setCoverLetter] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerInfo, setProviderInfo] = useState<string>('');

  if (!isOpen || !job) return null;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: job.title,
          companyName: job.company_name,
          jobDescription: job.description || `${job.title} at ${job.company_name}`,
          tailoredResume,
          candidateInfo: userProfile,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setCoverLetter(json.coverLetter);
        setProviderInfo(`${json.provider?.toUpperCase()} (${json.model})`);
      } else {
        setError(json.error || 'Failed to generate cover letter.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error generating cover letter.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!coverLetter) return;
    navigator.clipboard.writeText(coverLetter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPdf = () => {
    if (!coverLetter) return;
    const candidate = {
      name: userProfile?.fullName || userProfile?.full_name || tailoredResume?.candidate?.name || 'Candidate',
      email: userProfile?.email || tailoredResume?.candidate?.email,
      phone: userProfile?.phone || tailoredResume?.candidate?.phone,
      location: userProfile?.location || tailoredResume?.candidate?.location,
    };
    const cleanCompany = (job.company_name || 'Target_Company').replace(/[^a-zA-Z0-9]/g, '_');
    generateCoverLetterPdf(coverLetter, candidate, `${cleanCompany}_Cover_Letter.pdf`);
  };

  const handleDownloadTxt = () => {
    if (!coverLetter) return;
    const blob = new Blob([coverLetter], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanCompany = (job.company_name || 'Target_Company').replace(/[^a-zA-Z0-9]/g, '_');
    link.download = `${cleanCompany}_Cover_Letter.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 9, 17, 0.82)',
        backdropFilter: 'blur(10px)',
        zIndex: 10000,
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
          maxWidth: 820,
          maxHeight: '90vh',
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
                background: 'linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 16px rgba(37, 99, 235, 0.4)',
              }}
            >
              <Mail size={20} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>
                  AI Tailored Cover Letter
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
                Customized for <strong style={{ color: 'var(--text-primary)' }}>{job.title}</strong> at {job.company_name}
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

          {!coverLetter && !loading && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
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
                <Mail size={30} style={{ color: 'var(--brand-text)' }} />
              </div>
              <h4 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 8px' }}>
                Draft an Executive Cover Letter
              </h4>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  maxWidth: 500,
                  margin: '0 auto 24px',
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                Generates a compelling, high-converting 3-4 paragraph cover letter linking your technical background
                directly to the needs of {job.company_name}.
              </p>

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
                }}
              >
                <Sparkles size={17} />
                Generate Cover Letter
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
                Drafting Your Cover Letter...
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                Synthesizing company requirements and articulating your key value proposition.
              </p>
            </div>
          )}

          {coverLetter && !loading && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Editable Preview:
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {coverLetter.split(/\s+/).filter(Boolean).length} words
                </span>
              </div>

              <textarea
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                rows={16}
                style={{
                  width: '100%',
                  padding: 16,
                  borderRadius: 10,
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
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
          {coverLetter ? (
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
                Regenerate
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleCopy}
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
                  {copied ? 'Copied' : 'Copy'}
                </button>

                <button
                  onClick={handleDownloadTxt}
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
                  <FileText size={14} />
                  Download .txt
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
              </div>
            </>
          ) : (
            <div style={{ marginLeft: 'auto' }}>
              <button
                onClick={onClose}
                style={{
                  height: 34,
                  padding: '0 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
