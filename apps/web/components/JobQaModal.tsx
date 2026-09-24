'use client';

import React, { useState } from 'react';
import {
  X,
  MessageSquare,
  Sparkles,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  HelpCircle,
  CornerDownLeft,
} from 'lucide-react';

interface JobQaModalProps {
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

const COMMON_QUESTIONS = [
  'Why are you the best fit for this role?',
  'What is your greatest technical achievement?',
  'Describe your experience with distributed systems and APIs.',
  'Why do you want to join our company?',
  'How do you handle deadlines and conflicting priorities?',
];

export const JobQaModal: React.FC<JobQaModalProps> = ({
  isOpen,
  onClose,
  job,
  tailoredResume,
  userProfile,
}) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerInfo, setProviderInfo] = useState<string>('');

  if (!isOpen || !job) return null;

  const handleGenerate = async (qToUse?: string) => {
    const activeQ = qToUse || question;
    if (!activeQ.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/qa-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: activeQ,
          jobTitle: job.title,
          companyName: job.company_name,
          jobDescription: job.description || `${job.title} at ${job.company_name}`,
          tailoredResume,
          candidateInfo: userProfile,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setAnswer(json.answer);
        setProviderInfo(`${json.provider?.toUpperCase()} (${json.model})`);
      } else {
        setError(json.error || 'Failed to generate answer.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error generating response.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!answer) return;
    navigator.clipboard.writeText(answer);
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
          maxWidth: 720,
          maxHeight: '88vh',
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
                background: 'linear-gradient(135deg, #2563eb 0%, #10b981 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 16px rgba(37, 99, 235, 0.4)',
              }}
            >
              <MessageSquare size={20} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>
                  Interview Prep & Screening Q&A
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
                Screening answers for <strong style={{ color: 'var(--text-primary)' }}>{job.title}</strong> at {job.company_name}
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

          {/* Prompt / Input */}
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 8,
              }}
            >
              Application Screening Question:
            </label>
            <div style={{ position: 'relative' }}>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Why are you interested in this position? Or paste an ATS question..."
                rows={3}
                style={{
                  width: '100%',
                  padding: 12,
                  paddingRight: 40,
                  borderRadius: 10,
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  fontSize: 13.5,
                  resize: 'none',
                  boxSizing: 'border-box',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
              <button
                onClick={() => handleGenerate()}
                disabled={loading || !question.trim()}
                aria-label="Generate answer"
                style={{
                  position: 'absolute',
                  right: 10,
                  bottom: 12,
                  background: 'var(--brand-primary)',
                  border: 'none',
                  borderRadius: 8,
                  width: 30,
                  height: 30,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: question.trim() ? 'pointer' : 'default',
                  opacity: question.trim() ? 1 : 0.4,
                  color: '#ffffff',
                }}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <CornerDownLeft size={14} />}
              </button>
            </div>
          </div>

          {/* Quick Common Question Chips */}
          <div style={{ marginBottom: 24 }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: 8,
              }}
            >
              <HelpCircle size={14} /> Quick Common Prompts:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COMMON_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setQuestion(q);
                    handleGenerate(q);
                  }}
                  style={{
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 20,
                    padding: '6px 12px',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--brand-border)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Answer Preview */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '36px 16px' }}>
              <Loader2
                size={32}
                className="animate-spin"
                style={{ color: 'var(--brand-text)', margin: '0 auto 12px' }}
              />
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                Synthesizing concise, high-converting screening answer...
              </p>
            </div>
          )}

          {answer && !loading && (
            <div
              style={{
                padding: 18,
                borderRadius: 12,
                background: 'var(--bg-app)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--status-success-text)',
                    letterSpacing: '0.05em',
                  }}
                >
                  Tailored Answer:
                </span>
                <button
                  onClick={handleCopy}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 28,
                    padding: '0 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 6,
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: copied ? 'var(--status-success-text)' : 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy Answer'}
                </button>
              </div>

              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--text-primary)',
                }}
              >
                {answer}
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-elevated)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              height: 32,
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
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
