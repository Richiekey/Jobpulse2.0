import React from 'react';

export interface SkeletonProps {
  variant?: 'text' | 'rectangular' | 'circular' | 'card' | 'table-row';
  width?: string | number;
  height?: string | number;
  count?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  count = 1,
  className = '',
  style,
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'circular':
        return {
          width: width || '40px',
          height: height || '40px',
          borderRadius: 'var(--radius-full)',
        };
      case 'rectangular':
        return {
          width: width || '100%',
          height: height || '120px',
          borderRadius: 'var(--radius-md)',
        };
      case 'card':
        return {
          width: width || '100%',
          height: height || '110px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
        };
      case 'table-row':
        return {
          width: width || '100%',
          height: height || '48px',
          borderRadius: 'var(--radius-sm)',
        };
      case 'text':
      default:
        return {
          width: width || '100%',
          height: height || '14px',
          borderRadius: 'var(--radius-xs)',
        };
    }
  };

  const items = Array.from({ length: Math.max(1, count) });

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%' }}
      aria-hidden="true"
    >
      {items.map((_, idx) => (
        <div
          key={idx}
          className={`skeleton-shimmer ${className}`}
          style={{
            ...getVariantStyles(),
            ...style,
          }}
        />
      ))}
    </div>
  );
};
