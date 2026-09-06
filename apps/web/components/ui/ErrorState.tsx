import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  userMessage?: string;
  diagnostic?: string;
  errorCode?: string | number;
  requestId?: string;
  showDiagnostics?: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Sanitizes technical diagnostic messages to prevent leaking secrets, credentials, or raw DB strings.
 */
export function sanitizeDiagnostic(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/(?:bearer\s+|key=|token=)[a-zA-Z0-9._~+/-]+/gi, '[REDACTED_SECRET]')
    .replace(/(?:password|pwd)=[^&\s]+/gi, 'password=[REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://[REDACTED_CONN_STRING]')
    .replace(/\b(SELECT\s+.*?\s+FROM|INSERT\s+INTO|UPDATE\s+.*?\s+SET|DELETE\s+FROM)\b/gi, '[REDACTED_SQL_QUERY]');
}

/**
 * Heuristic to detect whether an unclassified message string contains technical diagnostic details.
 */
export function isTechnicalDiagnostic(str: string): boolean {
  return /postgrest|pg_|sql|connrefused|500|502|503|504|econnreset|timeout|gateway|stack trace|at\s+[\w.<>]+:\d+:\d+/i.test(str);
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to load data',
  message,
  userMessage,
  diagnostic,
  errorCode,
  requestId,
  showDiagnostics = false,
  onRetry,
  isRetrying = false,
  className = '',
  style,
}) => {
  // Determine user-facing message vs technical diagnostic
  let displayUserMessage = userMessage;
  let effectiveDiagnostic = diagnostic;

  if (!displayUserMessage) {
    if (message && isTechnicalDiagnostic(message)) {
      displayUserMessage = "We encountered an issue loading this information. Please try again in a few moments.";
      if (!effectiveDiagnostic) {
        effectiveDiagnostic = message;
      }
    } else {
      displayUserMessage = message || "We couldn't complete this action. Please try again.";
    }
  }

  const cleanDiagnostic = effectiveDiagnostic ? sanitizeDiagnostic(effectiveDiagnostic) : null;
  const hasDiagnosticDetails = Boolean(cleanDiagnostic || errorCode || requestId);

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

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
          {displayUserMessage}
        </p>

        {hasDiagnosticDetails && (
          <details
            open={showDiagnostics}
            style={{
              marginTop: 'var(--space-3)',
              padding: 'var(--space-2) var(--space-3)',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-size-xs)',
              textAlign: 'left',
              maxWidth: '480px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontWeight: 600,
                userSelect: 'none',
              }}
            >
              Technical details {errorCode ? `(${errorCode})` : ''}
            </summary>
            <div
              style={{
                marginTop: 'var(--space-2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                paddingTop: '4px',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              {errorCode && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Error Code: </span>
                  <code style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--text-secondary)' }}>
                    {errorCode}
                  </code>
                </div>
              )}
              {requestId && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Request ID: </span>
                  <code style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--text-secondary)' }}>
                    {requestId}
                  </code>
                </div>
              )}
              {cleanDiagnostic && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Diagnostic: </span>
                  <pre
                    style={{
                      margin: '4px 0 0',
                      padding: '6px 8px',
                      backgroundColor: 'var(--bg-app)',
                      borderRadius: 'var(--radius-xs)',
                      overflowX: 'auto',
                      fontFamily: 'var(--font-family-mono)',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {cleanDiagnostic}
                  </pre>
                </div>
              )}
            </div>
          </details>
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

