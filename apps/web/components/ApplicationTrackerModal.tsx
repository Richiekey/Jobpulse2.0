'use client';

import React, { useState } from 'react';
import { X, CheckSquare } from 'lucide-react';

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

  const [companyName, setCompanyName] = useState(job.companies?.name || job.company_name || '');
  const [jobTitle, setJobTitle] = useState(job.display_title || job.job_title || '');
  const [status, setStatus] = useState(job.status || 'applied');
  const [notes, setNotes] = useState(job.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        jobId: job.id,
        companyName,
        jobTitle,
        status,
        notes,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tracker-modal-title"
    >
      <div
        className="modal-surface"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px', padding: '24px' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '18px',
          }}
        >
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
            <h2 id="tracker-modal-title" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
              Track Application
            </h2>
          </div>

          <button onClick={onClose} className="btn-icon" style={{ borderRadius: 'var(--radius-full)' }} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Company Name
            </label>
            <input
              type="text"
              className="input-field"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Job Title
            </label>
            <input
              type="text"
              className="input-field"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Current Stage
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              {APPLICATION_STAGES.map((stage) => {
                const isSelected = status === stage.id;
                return (
                  <button
                    type="button"
                    key={stage.id}
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
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Personal Notes
            </label>
            <textarea
              className="input-field"
              rows={3}
              placeholder="e.g. Recruiter phone screen scheduled for next Tuesday..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? 'Saving...' : 'Save to Tracker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
