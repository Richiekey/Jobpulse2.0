export type ApplicationStage =
  | 'applied'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'archived';

export interface ApplicationDisplayState {
  hasApplication: boolean;
  status: ApplicationStage | string | null;
  label: string;
  badgeLabel: string;
  actionLabel: string;
  badgeVariant: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  color: string;
  backgroundColor: string;
  borderColor: string;
}

/**
 * Maps raw application status values to authoritative UI labels, badge variants, and colors.
 * Guarantees that non-applied stages (interview, offer, rejected) are never mislabeled as "Applied".
 */
export function getApplicationDisplayState(
  status: string | null | undefined
): ApplicationDisplayState {
  if (!status || typeof status !== 'string' || !status.trim()) {
    return {
      hasApplication: false,
      status: null,
      label: 'Not Applied',
      badgeLabel: 'Not Applied',
      actionLabel: 'Mark Applied',
      badgeVariant: 'neutral',
      color: 'var(--text-muted)',
      backgroundColor: 'var(--bg-surface-elevated)',
      borderColor: 'var(--border-default)',
    };
  }

  const normalized = status.trim().toLowerCase();

  switch (normalized) {
    case 'applied':
      return {
        hasApplication: true,
        status: 'applied',
        label: 'Applied',
        badgeLabel: '✓ Applied',
        actionLabel: 'Application: Applied',
        badgeVariant: 'success',
        color: 'var(--success-text)',
        backgroundColor: 'var(--success-surface)',
        borderColor: 'var(--success-border)',
      };
    case 'interview':
    case 'interviewing':
      return {
        hasApplication: true,
        status: 'interview',
        label: 'Interview',
        badgeLabel: 'Interview',
        actionLabel: 'Application: Interview',
        badgeVariant: 'info',
        color: 'var(--status-info-text)',
        backgroundColor: 'var(--status-info-bg)',
        borderColor: 'var(--status-info-border)',
      };
    case 'screening':
      return {
        hasApplication: true,
        status: 'screening',
        label: 'Screening',
        badgeLabel: 'Screening',
        actionLabel: 'Application: Screening',
        badgeVariant: 'info',
        color: 'var(--status-info-text)',
        backgroundColor: 'var(--status-info-bg)',
        borderColor: 'var(--status-info-border)',
      };
    case 'offer':
      return {
        hasApplication: true,
        status: 'offer',
        label: 'Offer',
        badgeLabel: '★ Offer',
        actionLabel: 'Application: Offer',
        badgeVariant: 'warning',
        color: 'var(--brand-primary)',
        backgroundColor: 'var(--brand-surface)',
        borderColor: 'var(--brand-border)',
      };
    case 'rejected':
      return {
        hasApplication: true,
        status: 'rejected',
        label: 'Rejected',
        badgeLabel: 'Rejected',
        actionLabel: 'Application: Rejected',
        badgeVariant: 'error',
        color: 'var(--status-error-text)',
        backgroundColor: 'var(--status-error-bg)',
        borderColor: 'var(--status-error-border)',
      };
    case 'withdrawn':
      return {
        hasApplication: true,
        status: 'withdrawn',
        label: 'Withdrawn',
        badgeLabel: 'Withdrawn',
        actionLabel: 'Application: Withdrawn',
        badgeVariant: 'neutral',
        color: 'var(--text-muted)',
        backgroundColor: 'var(--bg-surface-elevated)',
        borderColor: 'var(--border-subtle)',
      };
    case 'archived':
      return {
        hasApplication: true,
        status: 'archived',
        label: 'Archived',
        badgeLabel: 'Archived',
        actionLabel: 'Application: Archived',
        badgeVariant: 'neutral',
        color: 'var(--text-muted)',
        backgroundColor: 'var(--bg-surface-elevated)',
        borderColor: 'var(--border-subtle)',
      };
    default: {
      const formatted = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      return {
        hasApplication: true,
        status: normalized,
        label: formatted,
        badgeLabel: formatted,
        actionLabel: `Application: ${formatted}`,
        badgeVariant: 'neutral',
        color: 'var(--text-secondary)',
        backgroundColor: 'var(--bg-surface-elevated)',
        borderColor: 'var(--border-subtle)',
      };
    }
  }
}
