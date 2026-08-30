'use client';

import React, { useState } from 'react';
import { X, Bell, ShieldCheck } from 'lucide-react';

export interface JobAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAlertCreated?: (alert: any) => void;
  initialCriteria?: {
    query?: string;
    location?: string;
    department?: string;
    employmentType?: string;
    remoteType?: string;
  };
}

export function JobAlertModal({
  isOpen,
  onClose,
  onAlertCreated,
  initialCriteria = {},
}: JobAlertModalProps) {
  const [title, setTitle] = useState(
    initialCriteria.query ? `${initialCriteria.query} Roles` : 'New Job Alert'
  );
  const [query, setQuery] = useState(initialCriteria.query || '');
  const [location, setLocation] = useState(initialCriteria.location || '');
  const [department, setDepartment] = useState(initialCriteria.department || '');
  const [remoteType, setRemoteType] = useState(initialCriteria.remoteType || 'any');
  const [frequency, setFrequency] = useState<'instant' | 'daily' | 'weekly'>('daily');
  const [channel, setChannel] = useState<'email' | 'webhook' | 'in_app'>('webhook');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          query: query || null,
          location: location || null,
          department: department || null,
          remoteType: remoteType === 'any' ? null : remoteType,
          frequency,
          channel,
          webhookUrl: channel === 'webhook' ? webhookUrl : null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to create job alert.');
      }

      setSuccess(true);
      if (onAlertCreated) {
        onAlertCreated(json.data.alert);
      }
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-modal-title"
    >
      <div
        className="modal-surface"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px', padding: '24px' }}
      >
        {/* Header */}
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
              <Bell size={18} />
            </div>
            <h2 id="alert-modal-title" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
              Create Automated Job Alert
            </h2>
          </div>

          <button onClick={onClose} className="btn-icon" style={{ borderRadius: 'var(--radius-full)' }} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--danger-surface)',
                color: 'var(--danger-text)',
                border: '1px solid var(--danger-border)',
                fontSize: '0.8125rem',
                marginBottom: '14px',
              }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--success-surface)',
                color: 'var(--success-text)',
                border: '1px solid var(--success-border)',
                fontSize: '0.8125rem',
                marginBottom: '14px',
              }}
            >
              Job alert activated successfully!
            </div>
          )}

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Alert Name
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Frontend Engineer (Remote)"
              className="input-field"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Keyword Query
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. React, Stripe"
                className="input-field"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. San Francisco, London"
                className="input-field"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Workplace
              </label>
              <select
                value={remoteType}
                onChange={(e) => setRemoteType(e.target.value)}
                className="input-field"
              >
                <option value="any">Any Mode</option>
                <option value="remote">Remote Only</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-Site</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Frequency
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as any)}
                className="input-field"
              >
                <option value="daily">Daily Digest</option>
                <option value="instant">Instant Realtime</option>
                <option value="weekly">Weekly Digest</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Channel
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as any)}
                className="input-field"
              >
                <option value="webhook">Webhook HTTPS</option>
                <option value="email" disabled>Email (Coming Soon)</option>
                <option value="in_app" disabled>In-App (Coming Soon)</option>
              </select>
            </div>
          </div>

          {channel === 'webhook' && (
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Webhook HTTPS Endpoint (SSRF Protected & Cryptographically Signed)
              </label>
              <input
                type="url"
                required
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://api.yourdomain.com/webhooks/jobpulse"
                className="input-field"
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? 'Creating...' : 'Activate Alert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
