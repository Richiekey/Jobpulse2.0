import React from 'react';
import { Search } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionSlot?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <Search size={32} color="var(--text-muted)" />,
  title,
  description,
  actionLabel,
  onAction,
  actionSlot,
  className = '',
  style,
}) => {
  return (
    <div
      style={{
        padding: 'var(--space-12) var(--space-5)',
        textAlign: 'center',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-family-body)',
        ...style,
      }}
      className={`ui-empty-state ${className}`}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 'var(--space-4)',
        }}
      >
        {icon}
      </div>

      <h3
        style={{
          fontSize: 'var(--font-size-md)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-family-heading)',
          margin: '0 0 var(--space-2)',
        }}
      >
        {title}
      </h3>

      {description && (
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-secondary)',
            maxWidth: '380px',
            margin: '0 auto var(--space-5)',
            lineHeight: 'var(--line-height-normal)',
          }}
        >
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}

      {actionSlot}
    </div>
  );
};
