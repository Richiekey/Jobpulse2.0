'use client';

import React from 'react';
import { Search, X, DollarSign, SlidersHorizontal, ArrowUpDown } from 'lucide-react';

interface SearchFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  workplace: string;
  onWorkplaceChange: (w: string) => void;
  employment: string;
  onEmploymentChange: (e: string) => void;
  salaryMin: string;
  onSalaryMinChange: (s: string) => void;
  currency?: string;
  onCurrencyChange?: (c: string) => void;
  hasSalaryOnly?: boolean;
  onHasSalaryOnlyChange?: (hasSalary: boolean) => void;
  selectedSkill: string;
  onSkillChange: (skill: string) => void;
  onClearFilters: () => void;
  totalResults?: number;
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
  'Docker',
  'Kubernetes',
];

const SALARY_PRESETS = [
  { label: 'Any Compensation', value: '' },
  { label: '$80k+ / year', value: '80000' },
  { label: '$100k+ / year', value: '100000' },
  { label: '$120k+ / year', value: '120000' },
  { label: '$150k+ / year', value: '150000' },
  { label: '$180k+ / year', value: '180000' },
  { label: '$200k+ / year', value: '200000' },
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
  currency = '',
  onCurrencyChange,
  hasSalaryOnly = false,
  onHasSalaryOnlyChange,
  selectedSkill,
  onSkillChange,
  onClearFilters,
  totalResults,
}) => {
  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    workplace !== 'all' ||
    employment !== 'all' ||
    salaryMin !== '' ||
    currency !== '' ||
    hasSalaryOnly ||
    selectedSkill !== '';

  return (
    <section
      aria-label="Job Search and Filters"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        marginBottom: '24px',
      }}
    >
      {/* Search Input Bar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 340px' }}>
          <Search
            size={18}
            color="var(--text-muted)"
            style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            className="input-field"
            placeholder="Search by job title, company name, skill, or keyword..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              paddingLeft: '40px',
              paddingRight: searchQuery ? '36px' : '14px',
              height: '44px',
              fontSize: '0.9375rem',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
              }}
              title="Clear search query"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Workplace Selector */}
        <div style={{ width: '150px' }}>
          <select
            className="input-field"
            value={workplace}
            onChange={(e) => onWorkplaceChange(e.target.value)}
            style={{ height: '44px' }}
            aria-label="Filter by workplace type"
          >
            <option value="all">All Modes</option>
            <option value="remote">Remote Only</option>
            <option value="hybrid">Hybrid</option>
            <option value="on_site">On-Site</option>
          </select>
        </div>

        {/* Salary Floor Selector */}
        <div style={{ width: '165px' }}>
          <select
            className="input-field"
            value={salaryMin}
            onChange={(e) => onSalaryMinChange(e.target.value)}
            style={{ height: '44px' }}
            aria-label="Filter by minimum salary"
          >
            {SALARY_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        {/* Currency Selector */}
        {onCurrencyChange && (
          <div style={{ width: '120px' }}>
            <select
              className="input-field"
              value={currency || 'ALL'}
              onChange={(e) => onCurrencyChange(e.target.value === 'ALL' ? '' : e.target.value)}
              style={{ height: '44px' }}
              aria-label="Filter by currency"
            >
              <option value="ALL">Currency</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD (C$)</option>
            </select>
          </div>
        )}

        {/* Employment Type Selector */}
        <div style={{ width: '145px' }}>
          <select
            className="input-field"
            value={employment}
            onChange={(e) => onEmploymentChange(e.target.value)}
            style={{ height: '44px' }}
            aria-label="Filter by employment type"
          >
            <option value="all">Employment</option>
            <option value="full_time">Full-Time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
            <option value="part_time">Part-Time</option>
          </select>
        </div>

        {/* Disclosed Salary Toggle */}
        {onHasSalaryOnlyChange && (
          <button
            type="button"
            onClick={() => onHasSalaryOnlyChange(!hasSalaryOnly)}
            className="btn"
            style={{
              height: '44px',
              padding: '0 14px',
              backgroundColor: hasSalaryOnly ? 'var(--success-surface)' : 'var(--bg-surface)',
              color: hasSalaryOnly ? 'var(--success-text)' : 'var(--text-secondary)',
              borderColor: hasSalaryOnly ? 'var(--success-border)' : 'var(--border-default)',
            }}
          >
            <DollarSign size={15} />
            <span>Salary Disclosed</span>
          </button>
        )}
      </div>

      {/* Popular Skills Tags Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'wrap',
          paddingTop: '12px',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '4px' }}>
          Popular Tags:
        </span>
        {POPULAR_SKILLS.map((skill) => {
          const isSelected = selectedSkill.toLowerCase() === skill.toLowerCase();
          return (
            <button
              key={skill}
              type="button"
              onClick={() => onSkillChange(isSelected ? '' : skill)}
              style={{
                padding: '3px 9px',
                fontSize: '0.75rem',
                fontWeight: isSelected ? 700 : 500,
                borderRadius: 'var(--radius-sm)',
                backgroundColor: isSelected ? 'var(--brand-surface)' : 'var(--bg-surface-elevated)',
                color: isSelected ? 'var(--brand-text)' : 'var(--text-secondary)',
                border: isSelected ? '1px solid var(--brand-border)' : '1px solid var(--border-subtle)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              {skill}
            </button>
          );
        })}
      </div>

      {/* Active Filter Tags & Reset Bar */}
      {hasActiveFilters && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Active Filters:
            </span>

            {searchQuery.trim() && (
              <span
                className="badge"
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              >
                Query: {searchQuery}
                <button
                  onClick={() => onSearchChange('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {workplace !== 'all' && (
              <span
                className="badge"
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              >
                Mode: {workplace}
                <button
                  onClick={() => onWorkplaceChange('all')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {salaryMin && (
              <span
                className="badge"
                style={{
                  backgroundColor: 'var(--success-surface)',
                  border: '1px solid var(--success-border)',
                  color: 'var(--success-text)',
                }}
              >
                Min Salary: ${parseInt(salaryMin, 10).toLocaleString()}
                <button
                  onClick={() => onSalaryMinChange('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--success-text)' }}
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {selectedSkill && (
              <span
                className="badge"
                style={{
                  backgroundColor: 'var(--brand-surface)',
                  border: '1px solid var(--brand-border)',
                  color: 'var(--brand-text)',
                }}
              >
                Skill: {selectedSkill}
                <button
                  onClick={() => onSkillChange('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-text)' }}
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {hasSalaryOnly && (
              <span
                className="badge"
                style={{
                  backgroundColor: 'var(--success-surface)',
                  border: '1px solid var(--success-border)',
                  color: 'var(--success-text)',
                }}
              >
                Salary Disclosed
                <button
                  onClick={() => onHasSalaryOnlyChange && onHasSalaryOnlyChange(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--success-text)' }}
                >
                  <X size={12} />
                </button>
              </span>
            )}
          </div>

          <button
            onClick={onClearFilters}
            className="btn btn-ghost"
            style={{
              fontSize: '0.8125rem',
              padding: '4px 10px',
              color: 'var(--text-secondary)',
            }}
          >
            <X size={14} />
            <span>Reset All Filters</span>
          </button>
        </div>
      )}
    </section>
  );
};
