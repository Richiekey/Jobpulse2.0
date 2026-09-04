export interface WorkerResumeItem {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
  isPrimary?: boolean;
}

export interface WorkerEducationItem {
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  graduationYear?: number;
}

export interface WorkerProfile {
  id: string;
  organizationId: string;
  userId: string;
  cvUrl?: string | null;
  resumes: WorkerResumeItem[];
  skills: string[];
  experienceYears?: number | null;
  education: WorkerEducationItem[];
  preferredRoles: string[];
  preferredLocations: string[];
  availability: 'immediate' | 'two_weeks' | 'one_month' | 'not_available' | string;
  notes?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
