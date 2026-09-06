'use client';

import React, { useState, useId } from 'react';
import { CheckSquare, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/ui';

interface ApplicationTrackerModalProps {
  job: any | null;
  onClose: () => void;
  onSubmit: (data: {
    jobId?: string;
    companyName: string;
    jobTitle: string;
    status: string;
    notes?: string;
  }) => Promise<void>;
}

const APPLICATION_STAGES = [
  { id: 'applied', label: 'Applied' },
  { id: 'screening', label: 'Screening' },
  { id: 'interview', label: 'Interviewing' },
  { id: 'offer', label: 'Offer Received' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'archived', label: 'Archived' },
];

export const ApplicationTrackerModal: React.FC<ApplicationTrackerModalProps> = ({
  job,
  onClose,
  onSubmit,
}) => {
  if (!job) return null;

  const formId = useId();
  const companyInputId = `tracker-company-${formId}`;
  const titleInputId = `tracker-title-${formId}`;
  const notesInputId = `tracker-notes-${formId}`;

  const [companyName, setCompanyName] = useState(job.companies?.name || job.company_name || '');
  const [jobTitle, setJobTitle] = useState(job.display_title || job.canonical_title || job.job_title || '');
  const [status, setStatus] = useState(job.status || 'applied');
  const [notes, setNotes] = useState(job.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit({
        jobId: job.id,
        companyName: companyName.trim(),
        jobTitle: jobTitle.trim(),
        status,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save application to tracker. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalTitle = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--brand-surface)',
          color: 'var(--brand-text)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CheckSquare size={18} />
      </div>
      <span>Track Application</span>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="sm"
      title={modalTitle}
    >
      <form onSubmit={handleSubmit} noValidate={false}>
        {errorMessage && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--danger-surface)',
              border: '1px solid var(--danger-border)',
              color: 'var(--danger-text)',
              fontSize: '0.8125rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        <div style={{ marginBottom: '14px' }}>
          <label
            htmlFor={companyInputId}
            style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}
          >
            Company Name
          </label>
          <input
            id={companyInputId}
            name="companyName"
            type="text"
            className="input-field"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            autoComplete="organization"
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label
            htmlFor={titleInputId}
            style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}
          >
            Job Title
          </label>
          <input
            id={titleInputId}
            name="jobTitle"
            type="text"
            className="input-field"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            required
            autoComplete="organization-title"
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <span
            id={`stage-label-${formId}`}
            style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}
          >
            Current Stage
          </span>
          <div
            role="radiogroup"
            aria-labelledby={`stage-label-${formId}`}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}
          >
            {APPLICATION_STAGES.map((stage) => {
              const isSelected = status === stage.id;
              return (
                <button
                  type="button"
                  key={stage.id}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setStatus(stage.id)}
                  style={{
                    padding: '7px 8px',
                    fontSize: '0.75rem',
                    fontWeight: isSelected ? 700 : 500,
                    borderRadius: 'var(--radius-sm)',
                    border: isSelected ? '1px solid var(--brand-border)' : '1px solid var(--border-subtle)',
                    backgroundColor: isSelected ? 'var(--brand-surface)' : 'var(--bg-surface-elevated)',
                    color: isSelected ? 'var(--brand-text)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  {stage.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label
            htmlFor={notesInputId}
            style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}
          >
            Personal Notes
          </label>
          <textarea
            id={notesInputId}
            name="notes"
            className="input-field"
            rows={3}
            placeholder="e.g. Recruiter phone screen scheduled for next Tuesday..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary">
            {isSubmitting ? 'Saving...' : 'Save to Tracker'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

