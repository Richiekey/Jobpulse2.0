'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Building,
  Globe,
  RefreshCw,
  Plus,
} from 'lucide-react';

interface SourceOnboardingWizardProps {
  onSuccess: () => void;
}

export const SourceOnboardingWizard: React.FC<SourceOnboardingWizardProps> = ({ onSuccess }) => {
  const [step, setStep] = useState<'input' | 'validated' | 'success'>('input');
  const [careerUrl, setCareerUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyDomain, setCompanyDomain] = useState('');
  const [detectedPlatform, setDetectedPlatform] = useState<string>('');
  const [sourceIdentifier, setSourceIdentifier] = useState<string>('');
  const [scheduleInterval, setScheduleInterval] = useState<number>(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<any | null>(null);

  // Step 1: Detect ATS Platform from URL / Input
  const handleDetect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!careerUrl) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/sources/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: careerUrl }),
      });

      const json = await res.json();
      if (!res.ok || !json.data?.detected) {
        throw new Error(json.error || json.data?.reason || 'Could not detect ATS platform from given URL.');
      }

      const match = json.data.matches?.[0] || json.data;
      setDetectedPlatform(match.platformSlug || match.platform);
      setSourceIdentifier(match.sourceIdentifier || match.identifier);

      // Auto-extract company name suggestion
      if (!companyName && match.sourceIdentifier) {
        setCompanyName(
          match.sourceIdentifier.charAt(0).toUpperCase() + match.sourceIdentifier.slice(1)
        );
      }

      // Step 2: Automatically run pre-flight validation
      const valRes = await fetch('/api/admin/sources/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: match.platformSlug || match.platform,
          identifier: match.sourceIdentifier || match.identifier,
        }),
      });

      const valJson = await valRes.json();
      if (valRes.ok && valJson.data) {
        setValidationResult(valJson.data);
      }

      setStep('validated');
    } catch (err: any) {
      setError(err.message || 'Detection failed. Please check the URL.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Execute Atomic Onboarding
  const handleOnboard = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/sources/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          companyDomain: companyDomain || undefined,
          platform: detectedPlatform,
          identifier: sourceIdentifier,
          scheduleIntervalMinutes: scheduleInterval,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to complete source onboarding.');
      }

      setStep('success');
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to onboard company source.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('input');
    setCareerUrl('');
    setCompanyName('');
    setCompanyDomain('');
    setDetectedPlatform('');
    setSourceIdentifier('');
    setValidationResult(null);
    setError(null);
  };

  return (
    <div className="card" style={{ padding: '28px', maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'var(--accent-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Sparkles size={18} color="#ffffff" />
        </div>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>ATS Source Onboarding Console</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Automatically detect ATS platform, validate endpoints, and atomically onboard company pipelines.
          </p>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#fca5a5',
            fontSize: '0.85rem',
          }}
        >
          <AlertTriangle size={18} color="#ef4444" />
          <span>{error}</span>
        </div>
      )}

      {step === 'input' && (
        <form onSubmit={handleDetect} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Career Page or ATS Job Board URL
            </label>
            <div style={{ position: 'relative' }}>
              <Globe
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="url"
                required
                placeholder="https://boards.greenhouse.io/stripe or https://jobs.lever.co/netflix"
                value={careerUrl}
                onChange={(e) => setCareerUrl(e.target.value)}
                className="input"
                style={{ paddingLeft: '38px', width: '100%' }}
              />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              Supports Greenhouse, Lever, Ashby, Workable, and standard ATS career page patterns.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !careerUrl}
            className="btn btn-primary"
            style={{ marginTop: '8px', justifyContent: 'center' }}
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
            <span>{loading ? 'Detecting ATS & Pre-flight Checking...' : 'Detect & Validate Source'}</span>
          </button>
        </form>
      )}

      {step === 'validated' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Pre-flight Banner */}
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: '8px',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CheckCircle2 size={24} color="#10b981" />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#34d399' }}>
                  ATS Detected: {detectedPlatform.toUpperCase()}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Identifier: <code style={{ color: '#ffffff' }}>{sourceIdentifier}</code>
                </div>
              </div>
            </div>
            {validationResult?.reachable && (
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                PRE-FLIGHT PASSED
              </span>
            )}
          </div>

          {/* Form Fields for Onboarding */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Company Name
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. Stripe"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Official Domain (Optional)
              </label>
              <input
                type="text"
                value={companyDomain}
                onChange={(e) => setCompanyDomain(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. stripe.com"
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Scrape Schedule Interval
            </label>
            <select
              value={scheduleInterval}
              onChange={(e) => setScheduleInterval(Number(e.target.value))}
              className="input"
              style={{ width: '100%' }}
            >
              <option value={15}>Every 15 minutes (High Priority)</option>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every 1 hour (Standard)</option>
              <option value={120}>Every 2 hours</option>
              <option value={360}>Every 6 hours</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
            <button onClick={handleReset} className="btn btn-secondary">
              Back
            </button>
            <button
              onClick={handleOnboard}
              disabled={loading || !companyName}
              className="btn btn-primary"
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
              <span>{loading ? 'Onboarding...' : 'Confirm & Onboard Pipeline'}</span>
            </button>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div style={{ textAlign: 'center', padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle2 size={32} color="#10b981" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Company Pipeline Onboarded!</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
              <strong>{companyName}</strong> has been atomically registered with {detectedPlatform.toUpperCase()} ingestion schedule.
            </p>
          </div>
          <button onClick={handleReset} className="btn btn-primary" style={{ marginTop: '8px' }}>
            Onboard Another Source
          </button>
        </div>
      )}
    </div>
  );
};
