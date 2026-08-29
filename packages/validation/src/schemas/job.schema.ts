import { z } from 'zod';

export const WorkplaceTypeSchema = z.enum(['remote', 'hybrid', 'on_site', 'unspecified']);
export const EmploymentTypeSchema = z.enum(['full_time', 'part_time', 'contract', 'internship', 'temporary', 'other']);
export const JobStatusSchema = z.enum(['active', 'suspect', 'stale', 'expired', 'removed']);

export const SalaryRangeSchema = z.object({
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  interval: z.enum(['yearly', 'monthly', 'hourly', 'daily']).nullable().optional(),
}).refine(
  (data) => {
    if (data.min != null && data.max != null) {
      return data.min <= data.max;
    }
    return true;
  },
  { message: 'Salary min must be less than or equal to max' }
);

export const ResolvedURLsSchema = z.object({
  discoveryUrl: z.string().url(),
  sourceJobUrl: z.string().url(),
  canonicalUrl: z.string().url(),
  applyUrl: z.string().url(),
  originalApplyUrl: z.string().url().nullable().optional(),
  urlResolutionMethod: z.string().min(1),
  urlResolutionConfidence: z.number().min(0).max(1),
});

export const NormalizedJobSchema = z.object({
  sourceId: z.string().uuid(),
  externalJobId: z.string().min(1),
  canonicalTitle: z.string().min(1).max(255),
  displayTitle: z.string().min(1).max(255),
  description: z.string().min(20, 'Job description must be at least 20 characters'),
  descriptionHtml: z.string().nullable().optional(),
  employmentType: EmploymentTypeSchema,
  workplaceType: WorkplaceTypeSchema,
  locations: z.array(z.string().min(1)).min(1),
  salary: SalaryRangeSchema.nullable().optional(),
  skills: z.array(z.string()),
  postedAt: z.string().datetime(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  status: JobStatusSchema,
  urls: ResolvedURLsSchema,
  rawPayloadHash: z.string().length(64),
  sourceMetadata: z.record(z.unknown()),
});

export const JobCandidateSchema = z.object({
  sourceId: z.string().uuid(),
  externalJobId: z.string().min(1),
  discoveryUrl: z.string().url(),
  sourceJobUrl: z.string().url(),
  companyIdentifier: z.string().min(1),
});
