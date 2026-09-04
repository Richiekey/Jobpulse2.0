/**
 * Verification Status Enum
 * Represents the authoritative lifecycle state of an application screenshot verification.
 */
export type VerificationStatus = 'pending' | 'verified' | 'rejected';

/**
 * Application Verification Entity
 * Represents an evidence record submitted by a worker and reviewed by an administrator.
 */
export interface ApplicationVerification {
  id: string;
  applicationId: string;
  organizationId: string | null;
  workerId: string;
  screenshotUrl: string;
  status: VerificationStatus;
  reviewerId: string | null;
  reviewerNotes: string | null;
  reviewedAt: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationVerificationWithReviewer extends ApplicationVerification {
  reviewer?: {
    id: string;
    email: string | null;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
  worker?: {
    id: string;
    email: string | null;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
  signedUrl?: string | null;
}

export interface CreateVerificationInput {
  applicationId: string;
  screenshotUrl: string;
  idempotencyKey?: string | null;
}

export interface ReviewVerificationInput {
  verificationId: string;
  status: 'verified' | 'rejected';
  reviewerNotes?: string | null;
}

/**
 * Validates whether a verification state transition is permitted.
 * Invariant: 'pending' can transition to 'verified' or 'rejected'.
 * Terminal states ('verified', 'rejected') cannot transition.
 */
export function canTransitionVerification(
  currentStatus: VerificationStatus,
  targetStatus: VerificationStatus
): boolean {
  if (currentStatus === 'pending') {
    return targetStatus === 'verified' || targetStatus === 'rejected';
  }
  return false;
}

/**
 * Returns true if the status is a terminal state.
 */
export function isTerminalVerificationStatus(status: VerificationStatus): boolean {
  return status === 'verified' || status === 'rejected';
}

/**
 * Validates reviewed-state invariants:
 * Reviewed status must have reviewerId and reviewedAt.
 * Pending status must NOT have reviewerId or reviewedAt.
 */
export function validateVerificationInvariants(
  verification: Pick<ApplicationVerification, 'status' | 'reviewerId' | 'reviewedAt'>
): { valid: boolean; error?: string } {
  if (verification.status === 'pending') {
    if (verification.reviewerId !== null || verification.reviewedAt !== null) {
      return {
        valid: false,
        error: 'Pending verification must not have reviewer attribution or reviewed timestamp.',
      };
    }
  } else if (verification.status === 'verified' || verification.status === 'rejected') {
    if (!verification.reviewerId || !verification.reviewedAt) {
      return {
        valid: false,
        error: 'Reviewed verification must possess reviewer attribution and reviewed timestamp.',
      };
    }
  } else {
    return {
      valid: false,
      error: `Invalid verification status: ${verification.status}`,
    };
  }

  return { valid: true };
}
