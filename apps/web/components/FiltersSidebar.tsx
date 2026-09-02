'use client';

import React, { useState } from 'react';
import {
  Search,
  X,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Briefcase,
  Layers,
  MapPin,
  DollarSign,
  Calendar,
  Building,
} from 'lucide-react';

export interface FilterOptions {
  total_active_jobs?: number;
  functions: Array<{
    slug: string;
    name: string;
    count: number;
    subFunctions?: Array<{ slug: string; name: string; count: number }>;
  }>;
  platforms: Array<{ slug: string; name: string; count: number }>;
  workplace_types: Array<{ slug: string; name: string; count: number }>;
  employment_types: Array<{ slug: string; name: string; count: number }>;
  countries: Array<{ country: string; count: number }>;
  date_presets: Array<{ id: string; label: string; hours: number }>;
}

export interface ActiveFilters {
  search: string;
  selectedFunctions: Set<string>;
  selectedPlatforms: Set<string>;
  selectedWorkplaces: Set<string>;
  selectedEmployments: Set<string>;
  selectedCountries: Set<string>;
  salaryMin: string;
  selectedCurrency: string;
  hasSalaryOnly: boolean;
  datePreset: string;
  isRemoteOnly: boolean;
}

interface FiltersSidebarProps {
  options: FilterOptions | null;
  filters: ActiveFilters;
  onFilterChange: (newFilters: ActiveFilters) => void;
  onReset: () => void;
  totalActiveCount?: number;
  filteredCount?: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const FiltersSidebar: React.FC<FiltersSidebarProps> = ({
  options,
  filters,
  onFilterChange,
  onReset,
  totalActiveCount,
  filteredCount,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    functions: true,
    platforms: true,
    workplace: true,
    employment: true,
    salary: true,
    dates: true,
    locations: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleToggleFunction = (slug: string) => {
    const next = new Set(filters.selectedFunctions);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onFilterChange({ ...filters, selectedFunctions: next });
  };

  const handleTogglePlatform = (slug: string) => {
    const next = new Set(filters.selectedPlatforms);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onFilterChange({ ...filters, selectedPlatforms: next });
  };

  const handleToggleWorkplace = (slug: string) => {
    const next = new Set(filters.selectedWorkplaces);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onFilterChange({ ...filters, selectedWorkplaces: next });
  };

  const handleToggleEmployment = (slug: string) => {
    const next = new Set(filters.selectedEmployments);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onFilterChange({ ...filters, selectedEmployments: next });
  };

  const handleToggleCountry = (country: string) => {
    const next = new Set(filters.selectedCountries);
    if (next.has(country)) next.delete(country);
    else next.add(country);
    onFilterChange({ ...filters, selectedCountries: next });
  };

  const handleDatePreset = (presetId: string) => {
    onFilterChange({
      ...filters,
      datePreset: filters.datePreset === presetId ? 'all' : presetId,
    });
  };

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.selectedFunctions.size > 0 ||
    filters.selectedPlatforms.size > 0 ||
    filters.selectedWorkplaces.size > 0 ||
    filters.selectedEmployments.size > 0 ||
    filters.selectedCountries.size > 0 ||
    filters.salaryMin !== '' ||
    filters.hasSalaryOnly ||
    filters.isRemoteOnly ||
    (filters.datePreset !== 'all' && filters.datePreset !== '');

  const platformBadgeColors: Record<string, { bg: string; text: string; border: string }> = {
    greenhouse: { bg: 'rgba(16, 185, 129, 0.12)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' },
    lever: { bg: 'rgba(59, 130, 246, 0.12)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' },
    ashby: { bg: 'rgba(168, 85, 247, 0.12)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' },
    workday: { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' },
    smartrecruiters: { bg: 'rgba(236, 72, 153, 0.12)', text: '#f472b6', border: 'rgba(236, 72, 153, 0.3)' },
    icims: { bg: 'rgba(14, 165, 233, 0.12)', text: '#38bdf8', border: 'rgba(14, 165, 233, 0.3)' },
    successfactors: { bg: 'rgba(99, 102, 241, 0.12)', text: '#818cf8', border: 'rgba(99, 102, 241, 0.3)' },
    oracle: { bg: 'rgba(239, 68, 68, 0.12)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' },
    jobright: { bg: 'rgba(100, 116, 139, 0.12)', text: '#94a3b8', border: 'rgba(100, 116, 139, 0.3)' },
  };

  return (
    <aside
      className={`filters-sidebar-pane ${isOpenMobile ? 'open-mobile' : ''}`}
      style={{
        width: '100%',
        maxWidth: '300px',
        backgroundColor: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 120px)',
        position: 'sticky',
        top: '120px',
        overflowY: 'auto',
      }}
    >
      {/* Sidebar Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          backgroundColor: 'var(--bg-surface)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SlidersHorizontal size={18} color="var(--brand-text)" />
          <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '-0.01em' }}>
            Job Filters
          </span>
          {hasActiveFilters && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--brand-primary)',
                color: '#ffffff',
              }}
            >
              Active
            </span>
          )}
        </div>

        {hasActiveFilters && (
          <button
            onClick={onReset}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: 'var(--radius-sm)',
            }}
            title="Reset all filters"
          >
            <RotateCcw size={12} />
            Reset
          </button>
        )}
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Search Input */}
        <div>
          <label
            htmlFor="filter-search-input"
            style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}
          >
            Keyword Search
          </label>
          <div style={{ position: 'relative' }}>
            <Search
              size={15}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              id="filter-search-input"
              type="text"
              placeholder="Title, skill, or keyword..."
              value={filters.search}
              onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 30px 8px 32px',
                backgroundColor: 'var(--bg-app)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            {filters.search && (
              <button
                onClick={() => onFilterChange({ ...filters, search: '' })}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Date Presets */}
        <div>
          <button
            onClick={() => toggleSection('dates')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: '8px',
              padding: '2px 0',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} color="var(--brand-text)" />
              Date Posted
            </span>
            {expandedSections['dates'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {expandedSections['dates'] && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(options?.date_presets || [
                { id: '24h', label: '24h' },
                { id: '3d', label: '3 days' },
                { id: '7d', label: '7 days' },
                { id: '14d', label: '14 days' },
                { id: '30d', label: '30 days' },
              ]).map((p) => {
                const isSelected = filters.datePreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleDatePreset(p.id)}
                    style={{
                      fontSize: '12px',
                      padding: '5px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: isSelected ? '1px solid var(--brand-primary)' : '1px solid var(--border-subtle)',
                      backgroundColor: isSelected ? 'var(--brand-surface)' : 'var(--bg-surface-elevated)',
                      color: isSelected ? 'var(--brand-text)' : 'var(--text-secondary)',
                      fontWeight: isSelected ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'var(--transition-fast)',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Job Function Taxonomy (15 Top-Level Categories) */}
        <div>
          <button
            onClick={() => toggleSection('functions')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: '8px',
              padding: '2px 0',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Briefcase size={14} color="var(--brand-text)" />
              Job Function
            </span>
            {expandedSections['functions'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {expandedSections['functions'] && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '240px', overflowY: 'auto' }}>
              {options?.functions && options.functions.length > 0 ? (
                options.functions.map((fn) => {
                  const isSelected = filters.selectedFunctions.has(fn.slug);
                  return (
                    <label
                      key={fn.slug}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: isSelected ? 'var(--brand-surface)' : 'transparent',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleFunction(fn.slug)}
                          style={{ accentColor: 'var(--brand-primary)', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: isSelected ? 600 : 400 }}>{fn.name}</span>
                      </div>
                      {fn.count > 0 && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            backgroundColor: 'var(--bg-surface-elevated)',
                            padding: '1px 6px',
                            borderRadius: '10px',
                          }}
                        >
                          {fn.count}
                        </span>
                      )}
                    </label>
                  );
                })
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading functions...</span>
              )}
            </div>
          )}
        </div>

        {/* ATS Platforms */}
        <div>
          <button
            onClick={() => toggleSection('platforms')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: '8px',
              padding: '2px 0',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} color="var(--brand-text)" />
              ATS Platform
            </span>
            {expandedSections['platforms'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {expandedSections['platforms'] && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(options?.platforms || []).map((ats) => {
                const isSelected = filters.selectedPlatforms.has(ats.slug);
                const colors = platformBadgeColors[ats.slug] || {
                  bg: 'var(--bg-surface-elevated)',
                  text: 'var(--text-secondary)',
                  border: 'var(--border-subtle)',
                };

                return (
                  <button
                    key={ats.slug}
                    onClick={() => handleTogglePlatform(ats.slug)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '11px',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${isSelected ? 'var(--brand-primary)' : colors.border}`,
                      backgroundColor: isSelected ? 'var(--brand-surface)' : colors.bg,
                      color: isSelected ? 'var(--brand-text)' : colors.text,
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    <span>{ats.name}</span>
                    {ats.count > 0 && <span style={{ opacity: 0.8 }}>({ats.count})</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Workplace Type */}
        <div>
          <button
            onClick={() => toggleSection('workplace')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: '8px',
              padding: '2px 0',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building size={14} color="var(--brand-text)" />
              Workplace Type
            </span>
            {expandedSections['workplace'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {expandedSections['workplace'] && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {[
                { slug: 'remote', label: 'Remote' },
                { slug: 'hybrid', label: 'Hybrid' },
                { slug: 'on_site', label: 'On-site' },
              ].map((w) => {
                const isSelected = filters.selectedWorkplaces.has(w.slug);
                return (
                  <button
                    key={w.slug}
                    onClick={() => handleToggleWorkplace(w.slug)}
                    style={{
                      fontSize: '12px',
                      padding: '5px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: isSelected ? '1px solid var(--brand-primary)' : '1px solid var(--border-subtle)',
                      backgroundColor: isSelected ? 'var(--brand-surface)' : 'var(--bg-surface-elevated)',
                      color: isSelected ? 'var(--brand-text)' : 'var(--text-secondary)',
                      fontWeight: isSelected ? 600 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Compensation Filter */}
        <div>
          <button
            onClick={() => toggleSection('salary')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: '8px',
              padding: '2px 0',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <DollarSign size={14} color="var(--brand-text)" />
              Minimum Compensation
            </span>
            {expandedSections['salary'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {expandedSections['salary'] && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <select
                value={filters.salaryMin}
                onChange={(e) => onFilterChange({ ...filters, salaryMin: e.target.value })}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                }}
              >
                <option value="">Any Minimum</option>
                <option value="60000">$60,000+ / year</option>
                <option value="80000">$80,000+ / year</option>
                <option value="100000">$100,000+ / year</option>
                <option value="120000">$120,000+ / year</option>
                <option value="150000">$150,000+ / year</option>
                <option value="180000">$180,000+ / year</option>
                <option value="200000">$200,000+ / year</option>
              </select>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filters.hasSalaryOnly}
                  onChange={(e) => onFilterChange({ ...filters, hasSalaryOnly: e.target.checked })}
                  style={{ accentColor: 'var(--brand-primary)' }}
                />
                Disclosed Salary Only
              </label>
            </div>
          )}
        </div>

        {/* Location Countries */}
        <div>
          <button
            onClick={() => toggleSection('locations')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: '8px',
              padding: '2px 0',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={14} color="var(--brand-text)" />
              Country / Region
            </span>
            {expandedSections['locations'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {expandedSections['locations'] && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
              {(options?.countries || []).map((c) => {
                const isSelected = filters.selectedCountries.has(c.country);
                return (
                  <label
                    key={c.country}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 6px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleCountry(c.country)}
                        style={{ accentColor: 'var(--brand-primary)' }}
                      />
                      <span>{c.country}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.count}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
