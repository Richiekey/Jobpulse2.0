import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      className = '',
      style,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      fontWeight: 600,
      borderRadius: 'var(--radius-md)',
      border: '1px solid transparent',
      cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
      opacity: disabled || isLoading ? 0.65 : 1,
      transition: 'all var(--transition-fast)',
      textDecoration: 'none',
      lineHeight: 1.25,
      whiteSpace: 'nowrap',
      fontFamily: 'var(--font-family-body)',
      ...style,
    };

    const sizeStyles: Record<'sm' | 'md' | 'lg', React.CSSProperties> = {
      sm: {
        padding: '5px 10px',
        fontSize: 'var(--font-size-xs)',
      },
      md: {
        padding: '8px 16px',
        fontSize: 'var(--font-size-sm)',
      },
      lg: {
        padding: '11px 20px',
        fontSize: 'var(--font-size-base)',
      },
    };

    const variantStyles: Record<'primary' | 'secondary' | 'outline' | 'ghost' | 'danger', React.CSSProperties> = {
      primary: {
        backgroundColor: 'var(--brand-primary)',
        color: '#ffffff',
        borderColor: 'var(--brand-primary)',
      },
      secondary: {
        backgroundColor: 'var(--bg-surface-elevated)',
        color: 'var(--text-primary)',
        borderColor: 'var(--border-default)',
      },
      outline: {
        backgroundColor: 'transparent',
        color: 'var(--text-primary)',
        borderColor: 'var(--border-strong)',
      },
      ghost: {
        backgroundColor: 'transparent',
        color: 'var(--text-secondary)',
        borderColor: 'transparent',
      },
      danger: {
        backgroundColor: 'var(--status-danger-bg)',
        color: 'var(--status-danger-text)',
        borderColor: 'var(--status-danger-border)',
      },
    };

    const combinedStyle = {
      ...baseStyle,
      ...sizeStyles[size],
      ...variantStyles[variant],
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        style={combinedStyle}
        className={`ui-button ui-button-${variant} ui-button-${size} ${className}`}
        {...props}
      >
        {isLoading && <Loader2 size={size === 'sm' ? 12 : 16} className="animate-spin" aria-hidden="true" />}
        {!isLoading && leftIcon}
        <span>{children}</span>
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
