import type {
  CompanySourceConfig,
  JobCandidate,
  NormalizedJob,
} from '@jobpulse/domain';
import {
  DeduplicationEngine,
  SalaryExtractor,
  JobFunctionTaxonomy,
  LocationParser,
} from '@jobpulse/domain';
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

      // 5. Enrich Salary & Compensation Intelligence (Batch H)
      let salaryMin = normalizedJob.salary?.min ?? null;
      let salaryMax = normalizedJob.salary?.max ?? null;
      let salaryCurrency: string | null = normalizedJob.salary?.currency ?? null;
      let salaryInterval = normalizedJob.salary?.interval ?? 'yearly';

      if (!salaryMin && !salaryMax) {
        // Attempt extraction from unstructured description
        const extracted = SalaryExtractor.extractFromText(normalizedJob.description || '');
        if (extracted.hasSalary) {
          salaryMin = extracted.salaryMin;
          salaryMax = extracted.salaryMax;
          salaryCurrency = extracted.currency;
          salaryInterval = extracted.interval;
        }
      }

      const salaryProfile = SalaryExtractor.normalize(
        salaryMin,
        salaryMax,
        salaryCurrency,
        salaryInterval as any,
        normalizedJob.description || ''
      );

      // 6. Generate Level-3 Canonical Fingerprint
      const canonicalFingerprint = DeduplicationEngine.generateCanonicalFingerprint(
        companySource.companyId,
        normalizedJob.canonicalTitle,
        normalizedJob.locations
      );

      // 7. Classify Job Function (Taxonomy)
      const functionClassification = JobFunctionTaxonomy.classify(
        normalizedJob.canonicalTitle,
        {
          department: typeof normalizedJob.sourceMetadata?.department === 'string' ? normalizedJob.sourceMetadata.department : null,
          category: typeof normalizedJob.sourceMetadata?.category === 'string' ? normalizedJob.sourceMetadata.category : null,
          skills: normalizedJob.skills,
          description: normalizedJob.description,
        }
      );

      // 8. Structured Location Decomposition
      const parsedLocation = LocationParser.parseMultiple(normalizedJob.locations);
      const isRemote = normalizedJob.workplaceType === 'remote' || parsedLocation.isRemote;

      // 9. Atomic Transactional Persistence via PostgreSQL RPC
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
          p_salary_min: salaryProfile.salaryMin,
          p_salary_max: salaryProfile.salaryMax,
          p_salary_currency: salaryProfile.currency,
          p_salary_interval: salaryProfile.interval,
          p_annualized_min: salaryProfile.annualizedMin,
          p_annualized_max: salaryProfile.annualizedMax,
          p_has_salary: salaryProfile.hasSalary,
          p_equity_mentioned: salaryProfile.equityMentioned,
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
          p_ats_platform_slug: adapter.platformSlug,
          p_job_function_slug: functionClassification.slug,
          p_job_function_confidence: functionClassification.source,
          p_location_country: parsedLocation.country,
          p_location_region: parsedLocation.region,
          p_location_city: parsedLocation.city,
          p_is_remote: isRemote,
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
