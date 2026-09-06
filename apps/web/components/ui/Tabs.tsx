import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, className = '', style }) => {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        overflowX: 'auto',
        paddingBottom: '2px',
        ...style,
      }}
      className={`ui-tabs-list ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '6px 14px',
              fontSize: 'var(--font-size-sm)',
              fontWeight: isActive ? 700 : 500,
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${isActive ? 'var(--border-default)' : 'transparent'}`,
              backgroundColor: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-family-body)',
            }}
            className={`ui-tab ${isActive ? 'ui-tab-active' : ''}`}
          >
            {tab.icon && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: isActive ? 'var(--brand-text)' : 'inherit',
                }}
              >
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: isActive ? 'var(--brand-surface)' : 'var(--bg-surface-subtle)',
                  color: isActive ? 'var(--brand-text)' : 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
