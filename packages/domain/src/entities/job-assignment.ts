import type { Database } from '../database.types.js';

export type AssignmentStatus = Database['public']['Enums']['assignment_status_enum'];

export interface JobAssignment {
  id: string;
  organizationId: string;
  jobId: string;
  workerId: string;
  assignedBy: string;
  status: AssignmentStatus;
  deadlineAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobAssignmentWithDetails extends JobAssignment {
  jobTitle?: string;
  companyName?: string;
  canonicalUrl?: string;
  applyUrl?: string;
  workerName?: string;
  workerEmail?: string;
}
