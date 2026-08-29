import type {
  JobCandidate,
  RawJobPayload,
  RawJob,
  NormalizedJob,
  CompanySourceConfig,
  SourceValidationResult,
  ATSDetectionResult,
} from '@jobpulse/domain';
import type { JobValidationResult } from '@jobpulse/validation';

export interface ATSAdapter {
  readonly platformSlug: string;
  readonly parserVersion: string;

  /**
   * Evaluates whether a given URL or HTML content matches this ATS platform.
   */
  detect(url: string, html?: string): ATSDetectionResult;

  /**
   * Validates connectivity and discovering capabilities for a given company source prior to activation.
   */
  validateSource(config: CompanySourceConfig): Promise<SourceValidationResult>;

  /**
   * Discovers job candidates for a given company source configuration.
   */
  discover(config: CompanySourceConfig): Promise<JobCandidate[]>;

  /**
   * Fetches the raw job payload for a specific candidate.
   */
  fetch(candidate: JobCandidate): Promise<RawJobPayload>;

  /**
   * Parses the raw payload into an intermediate RawJob representation.
   */
  parse(rawPayload: RawJobPayload): Promise<RawJob>;

  /**
   * Normalizes the RawJob into a canonical NormalizedJob with resolved URLs and payload hash.
   */
  normalize(rawJob: RawJob, payloadHash: string): Promise<NormalizedJob>;

  /**
   * Validates a normalized job against data quality invariants.
   */
  validate(job: NormalizedJob): JobValidationResult;

  /**
   * Resolves the original application destination URL from candidate and raw job metadata.
   */
  resolveApplicationUrl(candidate: JobCandidate, raw: RawJob): Promise<string>;
}
