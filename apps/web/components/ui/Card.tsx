import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  isInteractive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  isInteractive = false,
  className = '',
  style,
  ...props
}) => {
  const paddingStyles: Record<'none' | 'sm' | 'md' | 'lg', string> = {
    none: '0',
    sm: 'var(--space-3)',
    md: 'var(--space-4)',
    lg: 'var(--space-6)',
  };

  const effectiveVariant = isInteractive ? 'interactive' : variant;

  const baseStyle: React.CSSProperties = {
    borderRadius: 'var(--radius-lg)',
    backgroundColor: effectiveVariant === 'elevated' ? 'var(--bg-surface-elevated)' : 'var(--bg-surface)',
    border: `1px solid ${effectiveVariant === 'elevated' ? 'var(--border-default)' : 'var(--border-subtle)'}`,
    boxShadow: effectiveVariant === 'elevated' ? 'var(--shadow-md)' : 'var(--shadow-sm)',
    padding: paddingStyles[padding],
    cursor: effectiveVariant === 'interactive' ? 'pointer' : undefined,
    transition: 'border-color var(--transition-fast), background-color var(--transition-fast)',
    fontFamily: 'var(--font-family-body)',
    ...style,
  };

  return (
    <div
      style={baseStyle}
      className={`ui-card ui-card-${effectiveVariant} ${effectiveVariant === 'interactive' ? 'ui-card-interactive' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  style,
  ...props
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-3)',
      marginBottom: 'var(--space-3)',
      ...style,
    }}
    className={`ui-card-header ${className}`}
    {...props}
  >
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  children,
  className = '',
  style,
  ...props
}) => (
  <h3
    style={{
      fontSize: 'var(--font-size-md)',
      fontWeight: 700,
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-family-heading)',
      margin: 0,
      ...style,
    }}
    className={`ui-card-title ${className}`}
    {...props}
  >
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  children,
  className = '',
  style,
  ...props
}) => (
  <p
    style={{
      fontSize: 'var(--font-size-xs)',
      color: 'var(--text-secondary)',
      margin: '2px 0 0',
      ...style,
    }}
    className={`ui-card-description ${className}`}
    {...props}
  >
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  style,
  ...props
}) => (
  <div style={{ ...style }} className={`ui-card-content ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  style,
  ...props
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 'var(--space-2)',
      marginTop: 'var(--space-4)',
      paddingTop: 'var(--space-3)',
      borderTop: '1px solid var(--border-subtle)',
      ...style,
    }}
    className={`ui-card-footer ${className}`}
    {...props}
  >
    {children}
  </div>
);
