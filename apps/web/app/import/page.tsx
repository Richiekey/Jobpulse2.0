'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  UploadCloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Sparkles,
  Layers,
  HelpCircle,
} from 'lucide-react';
import type { UrlImportResultItem } from '@/app/api/jobs/import/route';

export default function BulkImportPage() {
  const [urlInput, setUrlInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<UrlImportResultItem[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; detected_count: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleImport = async () => {
    setErrorMsg(null);
    const rawLines = urlInput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (rawLines.length === 0) {
      setErrorMsg('Please enter at least one URL to import.');
      return;
    }

    // Basic URL filter
    const validUrls = rawLines.filter((l) => l.startsWith('http://') || l.startsWith('https://'));
    if (validUrls.length === 0) {
      setErrorMsg('Please enter valid HTTP/HTTPS URLs (e.g. https://boards.greenhouse.io/stripe).');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/jobs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: validUrls }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Import request failed');
      }

      setResults(json.data.results);
      setSummary({ total: json.data.total, detected_count: json.data.detected_count });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process import.');
    } finally {
      setIsSubmitting(false);
    }
  };

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

        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 'var(--radius-xs)',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            border: '1px solid rgba(37, 99, 235, 0.25)',
            color: 'var(--brand-text)',
            textTransform: 'uppercase',
          }}
        >
          20 ATS Engines Supported
        </span>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '36px 24px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            Bulk ATS Board & URL Ingestion
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '6px', lineHeight: 1.5 }}>
            Paste job board links, career page links, or individual job URLs. Our multi-engine ATS detector will automatically identify the underlying ATS platform (Greenhouse, Lever, Ashby, Workable, BambooHR, Rippling, Jobvite, etc.) and register the company source for live continuous syncing.
          </p>
        </div>

        {/* Input Card */}
        <div
          style={{
            padding: '24px',
            borderRadius: 'var(--radius-xl)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            marginBottom: '24px',
          }}
        >
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
            Target URLs (one per line, up to 50 URLs):
          </label>
          <textarea
            rows={7}
            placeholder={`https://boards.greenhouse.io/stripe\nhttps://jobs.lever.co/netflix\nhttps://jobs.ashbyhq.com/linear\nhttps://apply.workable.com/spotify-tech\nhttps://postman.bamboohr.com/careers`}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              fontFamily: 'monospace',
              fontSize: '13px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-surface-elevated)',
              color: 'var(--text-primary)',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {errorMsg && (
            <div
              style={{
                marginTop: '12px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                fontSize: '13px',
              }}
            >
              {errorMsg}
            </div>
          )}

          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Supports direct board links, widget embeds, and career site URLs.
            </span>

            <button
              onClick={handleImport}
              disabled={isSubmitting || !urlInput.trim()}
              style={{
                height: '38px',
                padding: '0 20px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: isSubmitting ? 'var(--text-muted)' : 'var(--brand-primary)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 700,
                border: 'none',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Detecting & Ingesting...</span>
                </>
              ) : (
                <>
                  <UploadCloud size={16} />
                  <span>Detect & Ingest URLs</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results Card */}
        {results && (
          <div
            style={{
              padding: '24px',
              borderRadius: 'var(--radius-xl)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                Batch Ingestion Summary
              </h2>
              {summary && (
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Detected {summary.detected_count} of {summary.total} sources
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {results.map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      {r.status === 'queued' || r.status === 'imported' ? (
                        <CheckCircle2 size={16} color="#4ade80" />
                      ) : r.status === 'unsupported_ats' ? (
                        <AlertTriangle size={16} color="#fbbf24" />
                      ) : (
                        <XCircle size={16} color="#f87171" />
                      )}

                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          wordBreak: 'break-all',
                        }}
                      >
                        {r.url}
                      </span>
                    </div>

                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                      {r.message}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {r.atsType && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: 'rgba(56, 189, 248, 0.1)',
                          color: 'var(--brand-text)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {r.atsType}
                      </span>
                    )}

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-xs)',
                        backgroundColor:
                          r.status === 'queued'
                            ? 'rgba(34, 197, 94, 0.12)'
                            : r.status === 'unsupported_ats'
                              ? 'rgba(234, 179, 8, 0.12)'
                              : 'rgba(239, 68, 68, 0.12)',
                        color:
                          r.status === 'queued'
                            ? '#4ade80'
                            : r.status === 'unsupported_ats'
                              ? '#facc15'
                              : '#f87171',
                        textTransform: 'uppercase',
                      }}
                    >
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
