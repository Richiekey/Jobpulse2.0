import type {
  JobCandidate,
  RawJobPayload,
  RawJob,
  NormalizedJob,
  CompanySourceConfig,
} from '@jobpulse/domain';
import type { JobValidationResult } from '@jobpulse/validation';

export interface ATSAdapter {
  readonly platformSlug: string;
  readonly parserVersion: string;

  /**
   * Discovers job candidates for a given company configuration.
   */
  discover(companySource: CompanySourceConfig): Promise<JobCandidate[]>;

  /**
   * Fetches the raw job payload for a specific candidate.
   */
  fetch(candidate: JobCandidate): Promise<RawJobPayload>;

  /**
   * Parses the raw payload into an intermediate RawJob representation.
   */
  parse(rawPayload: RawJobPayload): Promise<RawJob>;

  /**
   * Normalizes the RawJob into a canonical NormalizedJob.
   */
  normalize(rawJob: RawJob, payloadHash: string): Promise<NormalizedJob>;

  /**
   * Validates the NormalizedJob against data quality invariants.
   */
  validate(job: NormalizedJob): JobValidationResult;
}
