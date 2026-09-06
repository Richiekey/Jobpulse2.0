import React from 'react';
import { X } from 'lucide-react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  isRemovable?: boolean;
  onRemove?: () => void;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  icon,
  isRemovable = false,
  onRemove,
  className = '',
  style,
  ...props
}) => {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontWeight: 600,
    borderRadius: 'var(--radius-sm)',
    lineHeight: 1.2,
    fontFamily: 'var(--font-family-body)',
    whiteSpace: 'nowrap',
    ...style,
  };

  const sizeStyles: Record<'sm' | 'md', React.CSSProperties> = {
    sm: {
      padding: '2px 7px',
      fontSize: 'var(--font-size-xs)',
    },
    md: {
      padding: '4px 10px',
      fontSize: 'var(--font-size-sm)',
    },
  };

  const variantStyles: Record<
    'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral',
    React.CSSProperties
  > = {
    default: {
      backgroundColor: 'var(--bg-surface-elevated)',
      color: 'var(--text-secondary)',
      border: '1px solid var(--border-subtle)',
    },
    primary: {
      backgroundColor: 'var(--brand-surface)',
      color: 'var(--brand-text)',
      border: '1px solid var(--brand-border)',
    },
    success: {
      backgroundColor: 'var(--status-success-bg)',
      color: 'var(--status-success-text)',
      border: '1px solid var(--status-success-border)',
    },
    warning: {
      backgroundColor: 'var(--status-warning-bg)',
      color: 'var(--status-warning-text)',
      border: '1px solid var(--status-warning-border)',
    },
    danger: {
      backgroundColor: 'var(--status-danger-bg)',
      color: 'var(--status-danger-text)',
      border: '1px solid var(--status-danger-border)',
    },
    info: {
      backgroundColor: 'var(--status-info-bg)',
      color: 'var(--status-info-text)',
      border: '1px solid var(--status-info-border)',
    },
    neutral: {
      backgroundColor: 'var(--status-neutral-bg)',
      color: 'var(--status-neutral-text)',
      border: '1px solid var(--status-neutral-border)',
    },
  };

  const combinedStyle = {
    ...baseStyle,
    ...sizeStyles[size],
    ...variantStyles[variant],
  };

  return (
    <span style={combinedStyle} className={`ui-badge ui-badge-${variant} ${className}`} {...props}>
      {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
      <span>{children}</span>
      {(isRemovable || onRemove) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          aria-label={`Remove ${typeof children === 'string' ? children : 'tag'}`}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            marginLeft: '2px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            color: 'inherit',
            opacity: 0.75,
          }}
        >
          <X size={10} aria-hidden="true" />
        </button>
      )}
    </span>
  );
};
