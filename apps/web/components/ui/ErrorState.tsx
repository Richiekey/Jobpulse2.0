import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message: string;
  errorCode?: string | number;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to load data',
  message,
  errorCode,
  onRetry,
  isRetrying = false,
  className = '',
  style,
}) => {
  return (
    <div
      role="alert"
      style={{
        padding: 'var(--space-5)',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--status-danger-bg)',
        border: '1px solid var(--status-danger-border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 'var(--space-3)',
        fontFamily: 'var(--font-family-body)',
        ...style,
      }}
      className={`ui-error-state ${className}`}
    >
      <div
        style={{
          width: '44px',
          height: '44px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'rgba(239, 68, 68, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--status-danger-text)',
        }}
      >
        <AlertCircle size={24} />
      </div>

      <div>
        <h4
          style={{
            fontSize: 'var(--font-size-base)',
            fontWeight: 700,
            color: 'var(--status-danger-text)',
            margin: '0 0 var(--space-1)',
            fontFamily: 'var(--font-family-heading)',
          }}
        >
          {title}
        </h4>
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-secondary)',
            margin: 0,
            maxWidth: '440px',
            lineHeight: 'var(--line-height-normal)',
          }}
        >
          {message}
        </p>
        {errorCode && (
          <span
            style={{
              display: 'inline-block',
              marginTop: 'var(--space-2)',
              fontSize: 'var(--font-size-xs)',
              fontFamily: 'var(--font-family-mono)',
              color: 'var(--text-muted)',
            }}
          >
            Error Code: {errorCode}
          </span>
        )}
      </div>

      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          isLoading={isRetrying}
          leftIcon={<RefreshCw size={14} />}
          style={{ marginTop: 'var(--space-1)' }}
        >
          Retry
        </Button>
      )}
    </div>
  );
};
