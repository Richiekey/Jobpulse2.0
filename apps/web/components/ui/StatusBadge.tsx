import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  RefreshCw,
  MinusCircle,
  Skull,
} from 'lucide-react';

export type SemanticStatusType = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: string;
  type?: SemanticStatusType;
  label?: string;
  showDot?: boolean;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export function resolveStatusSemantic(rawStatus: string): {
  type: SemanticStatusType;
  defaultLabel: string;
  icon: React.ReactNode;
  isInFlight: boolean;
} {
  const normalized = (rawStatus || '').toLowerCase().trim();

  switch (normalized) {
    // SUCCESS
    case 'active':
      return { type: 'success', defaultLabel: 'Active', icon: <CheckCircle2 size={12} />, isInFlight: false };
    case 'verified':
      return { type: 'success', defaultLabel: 'Verified', icon: <CheckCircle2 size={12} />, isInFlight: false };
    case 'completed':
      return { type: 'success', defaultLabel: 'Completed', icon: <CheckCircle2 size={12} />, isInFlight: false };
    case 'succeeded':
      return { type: 'success', defaultLabel: 'Succeeded', icon: <CheckCircle2 size={12} />, isInFlight: false };
    case 'synced':
      return { type: 'success', defaultLabel: 'Synced', icon: <CheckCircle2 size={12} />, isInFlight: false };

    // WARNING
    case 'aging':
      return { type: 'warning', defaultLabel: 'Aging', icon: <Clock size={12} />, isInFlight: false };
    case 'queued':
    case 'pending':
      return { type: 'warning', defaultLabel: 'Queued', icon: <Clock size={12} />, isInFlight: false };
    case 'in_progress':
      return { type: 'warning', defaultLabel: 'In Progress', icon: <RefreshCw size={12} className="animate-spin" />, isInFlight: true };
    case 'retrying':
      return { type: 'warning', defaultLabel: 'Retrying', icon: <RefreshCw size={12} className="animate-spin" />, isInFlight: true };

    // DANGER
    case 'stale':
      return { type: 'danger', defaultLabel: 'Stale', icon: <AlertTriangle size={12} />, isInFlight: false };
    case 'expired':
      return { type: 'danger', defaultLabel: 'Expired', icon: <AlertTriangle size={12} />, isInFlight: false };
    case 'failed':
      return { type: 'danger', defaultLabel: 'Failed', icon: <XCircle size={12} />, isInFlight: false };
    case 'rejected':
      return { type: 'danger', defaultLabel: 'Rejected', icon: <XCircle size={12} />, isInFlight: false };
    case 'dead_letter':
      return { type: 'danger', defaultLabel: 'Dead Letter', icon: <Skull size={12} />, isInFlight: false };
    case 'cancelled':
      return { type: 'danger', defaultLabel: 'Cancelled', icon: <XCircle size={12} />, isInFlight: false };

    // INFO
    case 'dispatched':
      return { type: 'info', defaultLabel: 'Dispatched', icon: <RefreshCw size={12} />, isInFlight: false };
    case 'running':
      return { type: 'info', defaultLabel: 'Running', icon: <RefreshCw size={12} className="animate-spin" />, isInFlight: true };
    case 'processing':
      return { type: 'info', defaultLabel: 'Processing', icon: <RefreshCw size={12} className="animate-spin" />, isInFlight: true };
    case 'assigned':
      return { type: 'info', defaultLabel: 'Assigned', icon: <Clock size={12} />, isInFlight: false };

    // NEUTRAL
    case 'archived':
      return { type: 'neutral', defaultLabel: 'Archived', icon: <MinusCircle size={12} />, isInFlight: false };
    case 'skipped':
      return { type: 'neutral', defaultLabel: 'Skipped', icon: <MinusCircle size={12} />, isInFlight: false };
    case 'draft':
      return { type: 'neutral', defaultLabel: 'Draft', icon: <MinusCircle size={12} />, isInFlight: false };

    default:
      return {
        type: 'neutral',
        defaultLabel: rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1),
        icon: <MinusCircle size={12} />,
        isInFlight: false,
      };
  }
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  type: forcedType,
  label: customLabel,
  showDot = false,
  showIcon = true,
  size = 'sm',
  className = '',
  style,
  ...props
}) => {
  const resolved = resolveStatusSemantic(status);
  const semanticType = forcedType || resolved.type;
  const displayLabel = customLabel || resolved.defaultLabel;

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontWeight: 600,
    borderRadius: 'var(--radius-full)',
    lineHeight: 1.2,
    fontFamily: 'var(--font-family-body)',
    whiteSpace: 'nowrap',
    ...style,
  };

  const sizeStyles: Record<'sm' | 'md', React.CSSProperties> = {
    sm: {
      padding: '2px 8px',
      fontSize: 'var(--font-size-xs)',
    },
    md: {
      padding: '4px 12px',
      fontSize: 'var(--font-size-sm)',
    },
  };

  const typeStyles: Record<SemanticStatusType, React.CSSProperties> = {
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

  const dotColor: Record<SemanticStatusType, string> = {
    success: 'var(--status-success-text)',
    warning: 'var(--status-warning-text)',
    danger: 'var(--status-danger-text)',
    info: 'var(--status-info-text)',
    neutral: 'var(--status-neutral-text)',
  };

  const combinedStyle = {
    ...baseStyle,
    ...sizeStyles[size],
    ...typeStyles[semanticType],
  };

  return (
    <span
      style={combinedStyle}
      className={`ui-status-badge ui-status-${semanticType} ${className}`}
      data-status={status}
      {...props}
    >
      {showDot && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: dotColor[semanticType],
            display: 'inline-block',
          }}
          aria-hidden="true"
        />
      )}
      {showIcon && !showDot && (
        <span style={{ display: 'inline-flex', alignItems: 'center' }} aria-hidden="true">
          {resolved.icon}
        </span>
      )}
      <span>{displayLabel}</span>
      <span className="sr-only">Status: {displayLabel}</span>
    </span>
  );
};
