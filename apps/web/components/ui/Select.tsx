import React, { forwardRef, useId } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  options?: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, helperText, error, options, children, id, className = '', style, disabled, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const helperId = `${selectId}-helper`;
    const errorId = `${selectId}-error`;

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

    const selectBaseStyle: React.CSSProperties = {
      width: '100%',
      backgroundColor: 'var(--bg-surface)',
      border: `1px solid ${error ? 'var(--status-danger-border)' : 'var(--border-default)'}`,
      color: 'var(--text-primary)',
      padding: '8px 12px',
      borderRadius: 'var(--radius-md)',
      fontSize: 'var(--font-size-base)',
      outline: 'none',
      transition: 'border-color var(--transition-fast)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      ...style,
    };

    const describedBy = [error ? errorId : null, helperText ? helperId : null].filter(Boolean).join(' ') || undefined;

    return (
      <div style={containerStyle} className="ui-select-container">
        {label && (
          <label htmlFor={selectId} style={labelStyle}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          style={selectBaseStyle}
          className={`ui-select-field ${error ? 'ui-select-error' : ''} ${className}`}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
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

Select.displayName = 'Select';
