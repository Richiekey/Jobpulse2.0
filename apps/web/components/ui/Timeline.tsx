import React from 'react';
import { StatusBadge } from './StatusBadge';

export interface TimelineItem {
  id: string;
  title: string;
  timestamp: string;
  description?: React.ReactNode;
  status?: string;
  icon?: React.ReactNode;
}

export interface TimelineProps {
  items: TimelineItem[];
  className?: string;
  style?: React.CSSProperties;
}

export const Timeline: React.FC<TimelineProps> = ({ items, className = '', style }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        paddingLeft: '24px',
        fontFamily: 'var(--font-family-body)',
        ...style,
      }}
      className={`ui-timeline ${className}`}
    >
      {/* Vertical Spine */}
      <div
        style={{
          position: 'absolute',
          left: '7px',
          top: '8px',
          bottom: '8px',
          width: '2px',
          backgroundColor: 'var(--border-subtle)',
        }}
      />

      {items.map((item, idx) => (
        <div
          key={item.id || idx}
          style={{
            position: 'relative',
            paddingBottom: idx === items.length - 1 ? 0 : 'var(--space-5)',
          }}
          className="ui-timeline-item"
        >
          {/* Node dot */}
          <div
            style={{
              position: 'absolute',
              left: '-24px',
              top: '2px',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: 'var(--bg-surface)',
              border: '2px solid var(--brand-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--brand-text)',
            }}
          >
            {item.icon ? (
              <span style={{ transform: 'scale(0.7)' }}>{item.icon}</span>
            ) : (
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--brand-primary)',
                }}
              />
            )}
          </div>

          {/* Item Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {item.title}
                </span>
                {item.status && <StatusBadge status={item.status} size="sm" />}
              </div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                {item.timestamp}
              </span>
            </div>

            {item.description && (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {item.description}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
