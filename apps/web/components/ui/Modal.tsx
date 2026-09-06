import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FOCUSABLE_ELEMENTS_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getModalFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS_SELECTOR)).filter(
    (el) =>
      typeof window === 'undefined' ||
      el.offsetParent !== null ||
      el.getClientRects().length > 0 ||
      window.getComputedStyle(el).display !== 'none'
  );
}

export function trapFocusInContainer(
  e: KeyboardEvent | React.KeyboardEvent,
  container: HTMLElement
): void {
  if (e.key !== 'Tab') return;

  const focusable = getModalFocusableElements(container);
  if (focusable.length === 0) {
    e.preventDefault();
    container.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = typeof document !== 'undefined' ? document.activeElement : null;

  if (e.shiftKey) {
    if (active === first || active === container || !container.contains(active)) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (active === last || !container.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  showCloseButton = true,
  children,
  className = '',
}) => {
  const generatedId = useId();
  const titleId = `modal-title-${generatedId}`;
  const descId = `modal-desc-${generatedId}`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Focus capture on open & restoration on close
  useEffect(() => {
    if (!isOpen) return;

    if (typeof document !== 'undefined') {
      previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    }

    const timer = setTimeout(() => {
      if (!dialogRef.current) return;
      const focusable = getModalFocusableElements(dialogRef.current);
      if (focusable.length > 0) {
        const preferred = focusable.find((el) => el.tagName.toLowerCase() === 'input') || focusable[0];
        preferred.focus();
      } else {
        dialogRef.current.focus();
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      if (previouslyFocusedRef.current && typeof previouslyFocusedRef.current.focus === 'function') {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [isOpen]);

  // Keyboard listeners: ESC dismissal and Tab focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        trapFocusInContainer(e, dialogRef.current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock background body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeMaxWidths: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
    sm: '480px',
    md: '620px',
    lg: '780px',
    xl: '960px',
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 'var(--space-4)',
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        className={`modal-surface ${className}`}
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xl)',
          maxWidth: sizeMaxWidths[size],
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        {(title || showCloseButton) && (
          <div
            style={{
              padding: 'var(--space-4) var(--space-5)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
            }}
          >
            <div>
              {title && (
                <h2
                  id={titleId}
                  style={{
                    fontSize: 'var(--font-size-lg)',
                    fontWeight: 700,
                    margin: 0,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-family-heading)',
                  }}
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id={descId}
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--text-secondary)',
                    margin: '2px 0 0',
                  }}
                >
                  {description}
                </p>
              )}
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color var(--transition-fast)',
                }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        <div
          style={{
            padding: 'var(--space-5)',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
