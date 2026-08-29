'use client';

import React from 'react';
import { ShieldCheck, Building2, Cpu, Zap } from 'lucide-react';

interface MetricBarProps {
  totalJobs: number;
  totalCompanies: number;
  atsCount?: number;
}

export const MetricBar: React.FC<MetricBarProps> = ({
  totalJobs,
  totalCompanies,
  atsCount = 5,
}) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        margin: '24px 0',
      }}
    >
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(99, 102, 241, 0.15)',
            color: '#818cf8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Zap size={22} />
        </div>
        <div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{totalJobs}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Active Verified Postings
          </div>
        </div>
      </div>

      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(6, 182, 212, 0.15)',
            color: '#22d3ee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Building2 size={22} />
        </div>
        <div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{totalCompanies}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Verified Tech Employers
          </div>
        </div>
      </div>

      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(168, 85, 247, 0.15)',
            color: '#c084fc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Cpu size={22} />
        </div>
        <div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{atsCount} Platforms</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Greenhouse, Lever, Ashby, etc.
          </div>
        </div>
      </div>

      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#34d399',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ShieldCheck size={22} />
        </div>
        <div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399' }}>
            100% Direct
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Zero Scraping Noise / Phishing
          </div>
        </div>
      </div>
    </div>
  );
};
