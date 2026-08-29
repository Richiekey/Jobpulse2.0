'use client';

import React, { useState } from 'react';
import { X, CheckSquare, Building2, Calendar, FileText } from 'lucide-react';

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
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '540px', padding: '28px' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckSquare size={20} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Track Application</h3>
          </div>

          <button onClick={onClose} className="btn-icon" style={{ borderRadius: '50%' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Company Name
            </label>
            <input
              type="text"
              className="input-control"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Job Title
            </label>
            <input
              type="text"
              className="input-control"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Stage / Status
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {APPLICATION_STAGES.map((stage) => (
                <button
                  type="button"
                  key={stage.id}
                  onClick={() => setStatus(stage.id)}
                  style={{
                    padding: '8px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-md)',
                    border: status === stage.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                    background: status === stage.id ? 'var(--accent-glow)' : 'var(--bg-tertiary)',
                    color: status === stage.id ? '#c7d2fe' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'var(--transition)',
                  }}
                >
                  {stage.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Personal Notes (Interviewer names, compensation discussed, next steps)
            </label>
            <textarea
              className="input-control"
              rows={4}
              placeholder="e.g. Recruiter phone screen scheduled for next Tuesday..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
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
