import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type AlertVariant = 'success' | 'warning' | 'danger' | 'info';

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  onDismiss,
  action,
  className = '',
  style,
}) => {
  const iconMap: Record<AlertVariant, React.ReactNode> = {
    success: <CheckCircle2 size={18} />,
    warning: <AlertTriangle size={18} />,
    danger: <XCircle size={18} />,
    info: <Info size={18} />,
  };

  const variantStyles: Record<AlertVariant, React.CSSProperties> = {
    success: {
      backgroundColor: 'var(--status-success-bg)',
      border: '1px solid var(--status-success-border)',
      color: 'var(--status-success-text)',
    },
    warning: {
      backgroundColor: 'var(--status-warning-bg)',
      border: '1px solid var(--status-warning-border)',
      color: 'var(--status-warning-text)',
    },
    danger: {
      backgroundColor: 'var(--status-danger-bg)',
      border: '1px solid var(--status-danger-border)',
      color: 'var(--status-danger-text)',
    },
    info: {
      backgroundColor: 'var(--status-info-bg)',
      border: '1px solid var(--status-info-border)',
      color: 'var(--status-info-text)',
    },
  };

  return (
    <div
      role="alert"
      style={{
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        fontSize: 'var(--font-size-sm)',
        lineHeight: 'var(--line-height-normal)',
        fontFamily: 'var(--font-family-body)',
        ...variantStyles[variant],
        ...style,
      }}
      className={`ui-alert ui-alert-${variant} ${className}`}
    >
      <div style={{ flexShrink: 0, marginTop: '2px', display: 'flex', alignItems: 'center' }}>
        {iconMap[variant]}
      </div>

      <div style={{ flex: 1 }}>
        {title && (
          <h5 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, margin: '0 0 var(--space-1)', color: 'inherit' }}>
            {title}
          </h5>
        )}
        <div style={{ color: 'var(--text-primary)' }}>{children}</div>
      </div>

      {action && <div style={{ flexShrink: 0 }}>{action}</div>}

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss alert"
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: '2px',
            borderRadius: 'var(--radius-xs)',
            display: 'flex',
            alignItems: 'center',
            opacity: 0.8,
            transition: 'opacity var(--transition-fast)',
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};
