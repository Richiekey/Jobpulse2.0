import { z } from 'zod';

export const OrgRoleSchema = z.enum(['owner', 'admin', 'worker']);
export const AssignmentStatusSchema = z.enum(['assigned', 'in_progress', 'completed', 'skipped']);

export const CreateOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(100),
  slug: z
    .string()
    .trim()
    .min(2, 'Slug must be at least 2 characters')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase alphanumeric characters and hyphens'),
  domain: z.string().trim().max(100).optional().nullable(),
  logoUrl: z.string().url().max(500).optional().nullable(),
});

export const UpdateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  domain: z.string().trim().max(100).optional().nullable(),
  logoUrl: z.string().url().max(500).optional().nullable(),
});

export const AddOrganizationMemberSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  role: OrgRoleSchema.default('worker'),
}).refine((data) => Boolean(data.userId || data.email), {
  message: 'Either userId or email must be provided to add a member',
});

export const UpdateOrganizationMemberSchema = z.object({
  role: OrgRoleSchema,
});

export const WorkerResumeItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(150),
  url: z.string().url(),
  uploadedAt: z.string().datetime(),
  isPrimary: z.boolean().optional(),
});

export const WorkerEducationItemSchema = z.object({
  institution: z.string().min(1).max(200),
  degree: z.string().max(100).optional().nullable(),
  fieldOfStudy: z.string().max(100).optional().nullable(),
  graduationYear: z.number().int().min(1950).max(2100).optional().nullable(),
});

export const UpdateWorkerProfileSchema = z.object({
  organizationId: z.string().uuid(),
  cvUrl: z.string().url().optional().nullable(),
  resumes: z.array(WorkerResumeItemSchema).optional(),
  skills: z.array(z.string().trim().min(1).max(50)).optional(),
  experienceYears: z.number().min(0).max(60).optional().nullable(),
  education: z.array(WorkerEducationItemSchema).optional(),
  preferredRoles: z.array(z.string().trim().min(1).max(100)).optional(),
  preferredLocations: z.array(z.string().trim().min(1).max(100)).optional(),
  availability: z.enum(['immediate', 'two_weeks', 'one_month', 'not_available']).or(z.string()).default('immediate'),
  notes: z.string().max(2000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export const CreateJobAssignmentSchema = z.object({
  organizationId: z.string().uuid(),
  jobId: z.string().uuid(),
  workerId: z.string().uuid(),
  deadlineAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const UpdateJobAssignmentStatusSchema = z.object({
  status: AssignmentStatusSchema,
  notes: z.string().max(1000).optional().nullable(),
});
