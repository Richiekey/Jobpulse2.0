import React, { forwardRef, useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, leftIcon, rightIcon, id, className = '', style, disabled, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    const containerStyle: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1)',
      width: '100%',
      fontFamily: 'var(--font-family-body)',
    };

    const labelStyle: React.CSSProperties = {
      fontSize: 'var(--font-size-xs)',
      fontWeight: 600,
      color: error ? 'var(--status-danger-text)' : 'var(--text-secondary)',
    };

    const wrapperStyle: React.CSSProperties = {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      width: '100%',
    };

    const inputBaseStyle: React.CSSProperties = {
      width: '100%',
      backgroundColor: 'var(--bg-surface)',
      border: `1px solid ${error ? 'var(--status-danger-border)' : 'var(--border-default)'}`,
      color: 'var(--text-primary)',
      padding: '8px 12px',
      paddingLeft: leftIcon ? '34px' : '12px',
      paddingRight: rightIcon ? '34px' : '12px',
      borderRadius: 'var(--radius-md)',
      fontSize: 'var(--font-size-base)',
      outline: 'none',
      transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
      opacity: disabled ? 0.6 : 1,
      cursor: disabled ? 'not-allowed' : 'text',
      ...style,
    };

    const iconStyle: React.CSSProperties = {
      position: 'absolute',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      pointerEvents: 'none',
    };

    const describedBy = [error ? errorId : null, helperText ? helperId : null].filter(Boolean).join(' ') || undefined;

    return (
      <div style={containerStyle} className="ui-input-container">
        {label && (
          <label htmlFor={inputId} style={labelStyle}>
            {label}
          </label>
        )}
        <div style={wrapperStyle}>
          {leftIcon && <div style={{ ...iconStyle, left: '10px' }}>{leftIcon}</div>}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            style={inputBaseStyle}
            className={`ui-input-field ${error ? 'ui-input-error' : ''} ${className}`}
            {...props}
          />
          {rightIcon && <div style={{ ...iconStyle, right: '10px' }}>{rightIcon}</div>}
        </div>
        {error && (
          <span id={errorId} role="alert" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--status-danger-text)' }}>
            {error}
          </span>
        )}
        {!error && helperText && (
          <span id={helperId} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
