/**
 * Types for @jobpulse/curation
 */

export interface CurationCriteria {
  resumeText?: string;
  targetRoles?: string[];
  skills?: string[];
  excludedKeywords?: string[];
  maxJobsPerCompany?: number; // default 3
  atsQuotas?: Record<string, number>; // e.g. { GREENHOUSE: 0.3, ASHBY: 0.2, LEVER: 0.2, WORKDAY: 0.15, OTHER: 0.15 }
  minScoreThreshold?: number; // default 40
  targetTotalJobs?: number; // default 1000
}

export interface RawJob {
  id: string;
  title?: string | null;
  canonical_title?: string | null;
  display_title?: string | null;
  company_name?: string | null;
  companies?: { name?: string | null; [key: string]: any } | { name?: string | null; [key: string]: any }[] | null;
  location?: string | null;
  locations?: string[] | null;
  location_city?: string | null;
  location_region?: string | null;
  location_country?: string | null;
  remote_type?: string | null;
  workplace_type?: string | null;
  is_remote?: boolean | null;
  employment_type?: string | null;
  department?: string | null;
  description?: string | null;
  requirements?: string | null;
  responsibilities?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_interval?: string | null;
  job_url?: string | null;
  apply_url?: string | null;
  source?: string | null;
  ats_platform_slug?: string | null;
  posted_at?: string | null;
  created_at?: string | null;
  first_seen_at?: string | null;
  skills?: string[] | null;
  role_category?: string | null;
  job_function_slug?: string | null;
  is_published?: boolean | null;
  [key: string]: any;
}

export interface ScoreBreakdown {
  titleScore: number;
  skillsScore: number;
  freshnessScore: number;
  penalty: number;
}

export interface ScoredJob extends RawJob {
  matchScore: number;
  matchingSkills: string[];
  scoreBreakdown: ScoreBreakdown;
}

export interface DiversitySummary {
  totalSelected: number;
  uniqueCompanies: number;
  atsBreakdown: Record<string, number>;
  roleBreakdown: Record<string, number>;
  averageScore: number;
}

export interface CurationResult {
  selectedJobs: ScoredJob[];
  summary: DiversitySummary;
}
