import type { Database } from '../database.types.js';

export type JobStatus = Database['public']['Enums']['job_status_enum'];
export type WorkplaceType = Database['public']['Enums']['workplace_type_enum'];
export type EmploymentType = Database['public']['Enums']['employment_type_enum'];
import type { ApplicationStatus } from '../application-lifecycle.js';
export type { ApplicationStatus };

export interface SalaryRange {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  interval?: 'yearly' | 'monthly' | 'weekly' | 'hourly' | 'daily' | null;
}

export interface JobCandidate {
  sourceId: string;
  externalJobId: string;
  discoveryUrl: string;
  sourceJobUrl: string;
  companyIdentifier: string;
}

export interface RawJobPayload {
  sourceId: string;
  externalId: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  parserVersion: string;
  fetchedAt: string;
}

export interface RawJob {
  sourceId: string;
  externalJobId: string;
  rawTitle: string;
  rawDescription: string;
  rawDescriptionHtml?: string | null;
  rawLocations: string[];
  rawSalary?: string | null;
  rawEmploymentType?: string | null;
  rawWorkplaceType?: string | null;
  rawPostedAt?: string | null;
  rawApplyUrl?: string | null;
  rawCompany?: string | null;
  sourceJobUrl: string;
  discoveryUrl: string;
  sourceMetadata?: Record<string, unknown>;
}

export interface ResolvedURLs {
  discoveryUrl: string;
  sourceJobUrl: string;
  canonicalUrl: string;
  applyUrl: string;
  originalApplyUrl?: string | null;
  urlResolutionMethod: string;
  urlResolutionConfidence: number;
}

export interface NormalizedJob {
  sourceId: string;
  externalJobId: string;
  canonicalTitle: string;
  displayTitle: string;
  description: string;
  descriptionHtml?: string | null;
  employmentType: EmploymentType;
  workplaceType: WorkplaceType;
  locations: string[];
  salary?: SalaryRange | null;
  skills: string[];
  postedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  status: JobStatus;
  urls: ResolvedURLs;
  rawPayloadHash: string;
  sourceMetadata: Record<string, unknown>;
}

export interface CanonicalJobRecord extends NormalizedJob {
  id: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}
