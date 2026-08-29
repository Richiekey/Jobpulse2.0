'use client';

import React from 'react';
import { Search, Globe, MapPin, DollarSign, Filter, X, Sparkles } from 'lucide-react';

interface SearchFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  workplace: string;
  onWorkplaceChange: (w: string) => void;
  employment: string;
  onEmploymentChange: (e: string) => void;
  salaryMin: string;
  onSalaryMinChange: (s: string) => void;
  hasSalaryOnly?: boolean;
  onHasSalaryOnlyChange?: (hasSalary: boolean) => void;
  selectedSkill: string;
  onSkillChange: (skill: string) => void;
  onClearFilters: () => void;
}

const POPULAR_SKILLS = [
  'TypeScript',
  'React',
  'Next.js',
  'Node.js',
  'Python',
  'Go',
  'Rust',
  'PostgreSQL',
  'AWS',
  'GraphQL',
  'Web3',
  'AI',
];

const SALARY_PRESETS = [
  { label: 'Any Salary', value: '' },
  { label: '$80k+', value: '80000' },
  { label: '$100k+', value: '100000' },
  { label: '$120k+', value: '120000' },
  { label: '$150k+', value: '150000' },
  { label: '$180k+', value: '180000' },
  { label: '$200k+', value: '200000' },
];

export const SearchFilters: React.FC<SearchFiltersProps> = ({
  searchQuery,
  onSearchChange,
  workplace,
  onWorkplaceChange,
  employment,
  onEmploymentChange,
  salaryMin,
  onSalaryMinChange,
  hasSalaryOnly = false,
  onHasSalaryOnlyChange,
  selectedSkill,
  onSkillChange,
  onClearFilters,
}) => {
  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    workplace !== 'all' ||
    employment !== 'all' ||
    salaryMin !== '' ||
    hasSalaryOnly ||
    selectedSkill !== '';

  return (
    <div
      className="glass-card"
      style={{
        padding: '24px',
        marginBottom: '24px',
      }}
    >
      {/* Primary Search Bar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            position: 'relative',
            flex: '1 1 320px',
          }}
        >
          <Search
            size={18}
            color="var(--text-muted)"
            style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
          <input
            type="text"
            className="input-control"
            placeholder="Search by role title, company, skill (e.g. Senior Frontend, Stripe, Rust)..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              paddingLeft: '42px',
              fontSize: '0.95rem',
              height: '46px',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Salary Floor Selector (Batch H) */}
        <div style={{ width: '160px' }}>
          <select
            className="input-control"
            value={salaryMin}
            onChange={(e) => onSalaryMinChange(e.target.value)}
            style={{ height: '46px' }}
          >
            {SALARY_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        {/* Employment Type Selector */}
        <div style={{ width: '160px' }}>
          <select
            className="input-control"
            value={employment}
            onChange={(e) => onEmploymentChange(e.target.value)}
            style={{ height: '46px' }}
          >
            <option value="all">All Types</option>
            <option value="full_time">Full-Time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
            <option value="part_time">Part-Time</option>
          </select>
        </div>

        {/* Disclosed Salary Only Filter Toggle */}
        {onHasSalaryOnlyChange && (
          <button
            onClick={() => onHasSalaryOnlyChange(!hasSalaryOnly)}
            className="btn"
            style={{
              height: '46px',
              padding: '0 14px',
              borderRadius: 'var(--radius-md)',
              border: hasSalaryOnly ? '1px solid #10b981' : '1px solid var(--border-color)',
              background: hasSalaryOnly ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-tertiary)',
              color: hasSalaryOnly ? '#34d399' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'var(--transition)',
            }}
          >
            <DollarSign size={15} />
            <span>Disclosed Salary</span>
          </button>
        )}

        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="btn btn-secondary"
            style={{ height: '46px', padding: '0 16px' }}
          >
            <X size={16} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Workplace Type Pills */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '4px' }}>
          Workplace:
        </span>
        {[
          { id: 'all', label: 'All Modes' },
          { id: 'remote', label: 'Remote Only' },
          { id: 'hybrid', label: 'Hybrid' },
          { id: 'on_site', label: 'On-Site' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => onWorkplaceChange(item.id)}
            style={{
              padding: '6px 14px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: 'var(--radius-full)',
              border: workplace === item.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
              background: workplace === item.id ? 'var(--accent-glow)' : 'var(--bg-tertiary)',
              color: workplace === item.id ? '#c7d2fe' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'var(--transition)',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Popular Skills Tag Pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '4px' }}>
          Skills:
        </span>
        {POPULAR_SKILLS.map((skill) => (
          <button
            key={skill}
            onClick={() => onSkillChange(selectedSkill === skill ? '' : skill)}
            style={{
              padding: '4px 10px',
              fontSize: '0.75rem',
              fontWeight: 500,
              borderRadius: 'var(--radius-sm)',
              border: selectedSkill === skill ? '1px solid var(--accent-secondary)' : '1px solid var(--border-color)',
              background: selectedSkill === skill ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.03)',
              color: selectedSkill === skill ? '#67e8f9' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'var(--transition)',
            }}
          >
            {skill}
          </button>
        ))}
      </div>
    </div>
  );
};
