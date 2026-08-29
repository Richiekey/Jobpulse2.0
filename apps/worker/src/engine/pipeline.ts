import type {
  CompanySourceConfig,
  JobCandidate,
  NormalizedJob,
} from '@jobpulse/domain';
import { DeduplicationEngine } from '@jobpulse/domain';
import type { ATSAdapter } from '@jobpulse/ats';
import { logger } from '@jobpulse/shared';
import { supabase } from '../db.js';

export interface PipelineResult {
  candidateId: string;
  status: 'inserted' | 'updated' | 'rejected' | 'failed';
  jobId?: string;
  error?: string;
}

export class IngestionPipeline {
  /**
   * Processes a single job candidate through the entire 8-stage pipeline:
   * Fetch -> Parse -> Normalize -> Validate -> Resolve -> Deduplicate -> Atomic Transactional Store.
   */
  public static async processCandidate(
    adapter: ATSAdapter,
    companySource: CompanySourceConfig,
    candidate: JobCandidate
  ): Promise<PipelineResult> {
    try {
      // 1. Fetch raw payload
      const rawPayload = await adapter.fetch(candidate);

      // 2. Parse raw payload into RawJob
      const rawJob = await adapter.parse(rawPayload);

      // 3. Normalize into canonical model with authoritative URL resolution
      const normalizedJob = await adapter.normalize(rawJob, rawPayload.payloadHash);

      // 4. Validate data quality invariants & content sanity
      const validation = adapter.validate(normalizedJob);
      if (!validation.isValid) {
        logger.warn(`Candidate ${candidate.externalJobId} rejected by validation rules`, {
          issues: validation.issues,
          candidate,
        });
        return {
          candidateId: candidate.externalJobId,
          status: 'rejected',
          error: validation.issues.map((i) => `${i.field}: ${i.message}`).join('; '),
        };
      }

      // 5. Generate Level-3 Canonical Fingerprint
      const canonicalFingerprint = DeduplicationEngine.generateCanonicalFingerprint(
        companySource.companyId,
        normalizedJob.canonicalTitle,
        normalizedJob.locations
      );

      // 6. Atomic Transactional Persistence via PostgreSQL RPC
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'ingest_job_transaction',
        {
          p_company_id: companySource.companyId,
          p_canonical_title: normalizedJob.canonicalTitle,
          p_display_title: normalizedJob.displayTitle,
          p_description: normalizedJob.description,
          p_description_html: normalizedJob.descriptionHtml || null,
          p_employment_type: normalizedJob.employmentType,
          p_workplace_type: normalizedJob.workplaceType,
          p_locations: normalizedJob.locations,
          p_salary_min: normalizedJob.salary?.min ?? null,
          p_salary_max: normalizedJob.salary?.max ?? null,
          p_salary_currency: normalizedJob.salary?.currency ?? 'USD',
          p_salary_interval: normalizedJob.salary?.interval ?? null,
          p_skills: normalizedJob.skills,
          p_posted_at: normalizedJob.postedAt,
          p_canonical_url: normalizedJob.urls.canonicalUrl,
          p_apply_url: normalizedJob.urls.applyUrl,
          p_original_apply_url: normalizedJob.urls.originalApplyUrl || null,
          p_url_resolution_method: normalizedJob.urls.urlResolutionMethod,
          p_url_resolution_confidence: normalizedJob.urls.urlResolutionConfidence,
          p_canonical_fingerprint: canonicalFingerprint,
          p_source_id: companySource.sourceId,
          p_external_job_id: candidate.externalJobId,
          p_source_job_url: normalizedJob.urls.sourceJobUrl,
          p_discovery_url: normalizedJob.urls.discoveryUrl,
          p_raw_payload_hash: rawPayload.payloadHash,
          p_raw_payload: rawPayload.payload as any,
          p_parser_version: rawPayload.parserVersion,
          p_source_metadata: (normalizedJob.sourceMetadata || {}) as any,
        }
      );

      if (rpcError) {
        throw new Error(`Atomic transaction error: ${rpcError.message}`);
      }

      const status = (rpcResult as any)?.status === 'updated' ? 'updated' : 'inserted';
      const jobId = (rpcResult as any)?.job_id;

      return {
        candidateId: candidate.externalJobId,
        status,
        jobId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Pipeline failure for candidate ${candidate.externalJobId}:`, {
        error: errorMsg,
        candidate,
      });

      return {
        candidateId: candidate.externalJobId,
        status: 'failed',
        error: errorMsg,
      };
    }
  }
}
