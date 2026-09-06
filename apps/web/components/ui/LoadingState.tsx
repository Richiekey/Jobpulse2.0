import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  fullHeight?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading verified data...',
  size = 'md',
  fullHeight = false,
  className = '',
  style,
}) => {
  const iconSizes: Record<'sm' | 'md' | 'lg', number> = {
    sm: 20,
    md: 32,
    lg: 44,
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: fullHeight ? 'var(--space-16) var(--space-4)' : 'var(--space-8) var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        textAlign: 'center',
        fontFamily: 'var(--font-family-body)',
        ...style,
      }}
      className={`ui-loading-state ${className}`}
    >
      <Loader2
        size={iconSizes[size]}
        className="animate-spin"
        style={{ color: 'var(--brand-text)' }}
        aria-hidden="true"
      />
      {message && (
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: 0 }}>
          {message}
        </p>
      )}
      <span className="sr-only">Loading in progress</span>
    </div>
  );
};
