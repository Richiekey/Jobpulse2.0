import React from 'react';
import { Card } from './Card';
import { Skeleton } from './Skeleton';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface StatCardProps {
  label?: string;
  title?: string;
  value: string | number;
  subtext?: string;
  subtitle?: string;
  delta?: string;
  deltaType?: 'positive' | 'negative' | 'neutral';
  trend?: {
    value: number | string;
    isPositive?: boolean;
    label?: string;
  };
  icon?: React.ReactNode;
  iconColor?: string;
  isLoading?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  title,
  value,
  subtext,
  subtitle,
  delta,
  deltaType,
  trend,
  icon,
  iconColor = 'var(--brand-text)',
  isLoading = false,
  className = '',
  style,
}) => {
  const displayLabel = label || title || '';
  const displaySubtext = subtext || subtitle;
  const effectiveTrend = trend || (delta ? { value: delta, isPositive: deltaType === 'positive' } : undefined);
  if (isLoading) {
    return (
      <Card padding="md" className={className} style={style}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
          <Skeleton variant="text" width="60%" height="14px" />
          <Skeleton variant="circular" width="32px" height="32px" />
        </div>
        <Skeleton variant="text" width="40%" height="28px" style={{ margin: 'var(--space-2) 0' }} />
        <Skeleton variant="text" width="50%" height="12px" />
      </Card>
    );
  }

  return (
    <Card padding="md" className={`ui-stat-card ${className}`} style={style}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {displayLabel}
        </span>
        {icon && (
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-surface-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: iconColor,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: 'var(--font-size-2xl)',
          fontWeight: 800,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-family-heading)',
          margin: 'var(--space-2) 0 var(--space-1)',
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {effectiveTrend && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              color: effectiveTrend.isPositive ? 'var(--status-success-text)' : 'var(--status-danger-text)',
            }}
          >
            {effectiveTrend.isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{effectiveTrend.value}</span>
          </span>
        )}
        {displaySubtext && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            {displaySubtext}
          </span>
        )}
      </div>
    </Card>
  );
};
