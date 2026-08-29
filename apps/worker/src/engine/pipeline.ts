import type {
  CompanySourceConfig,
  JobCandidate,
  NormalizedJob,
} from '@jobpulse/domain';
import type { ATSAdapter } from '@jobpulse/ats';
import { logger } from '@jobpulse/shared';
import { supabase } from '../db.js';

export interface PipelineResult {
  candidateId: string;
  status: 'inserted' | 'updated' | 'rejected' | 'failed';
  error?: string;
}

export class IngestionPipeline {
  /**
   * Processes a single job candidate through the entire pipeline:
   * Fetch -> Parse -> Normalize -> Validate -> Persist (raw + canonical + source mapping).
   */
  public static async processCandidate(
    adapter: ATSAdapter,
    companySource: CompanySourceConfig,
    candidate: JobCandidate
  ): Promise<PipelineResult> {
    try {
      // 1. Fetch raw payload
      const rawPayload = await adapter.fetch(candidate);

      // 2. Parse raw payload
      const rawJob = await adapter.parse(rawPayload);

      // 3. Normalize into canonical model
      const normalizedJob = await adapter.normalize(rawJob, rawPayload.payloadHash);

      // 4. Validate data quality invariants
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

      // 5. Store raw payload audit record (fire-and-forget or non-blocking)
      try {
        await supabase.from('raw_job_payloads').insert({
          source_id: companySource.sourceId,
          external_id: candidate.externalJobId,
          payload: rawPayload.payload as any,
          payload_hash: rawPayload.payloadHash,
          parser_version: rawPayload.parserVersion,
          fetched_at: rawPayload.fetchedAt,
        });
      } catch (err) {
        logger.debug('Failed to write raw_job_payloads audit record', { error: String(err) });
      }

      // 6. Check existing job_sources mapping for Level-1 deduplication
      const { data: existingSource } = await supabase
        .from('job_sources')
        .select('id, job_id, raw_payload_hash')
        .eq('source_id', companySource.sourceId)
        .eq('external_job_id', candidate.externalJobId)
        .maybeSingle();

      const nowIso = new Date().toISOString();

      if (existingSource) {
        // Job already exists in database -> UPDATE
        const { error: updateJobError } = await supabase
          .from('jobs')
          .update({
            canonical_title: normalizedJob.canonicalTitle,
            display_title: normalizedJob.displayTitle,
            description: normalizedJob.description,
            description_html: normalizedJob.descriptionHtml,
            employment_type: normalizedJob.employmentType,
            workplace_type: normalizedJob.workplaceType,
            locations: normalizedJob.locations,
            salary_min: normalizedJob.salary?.min ?? null,
            salary_max: normalizedJob.salary?.max ?? null,
            salary_currency: normalizedJob.salary?.currency ?? 'USD',
            salary_interval: normalizedJob.salary?.interval ?? null,
            skills: normalizedJob.skills,
            status: 'active',
            missed_scrape_count: 0,
            canonical_url: normalizedJob.urls.canonicalUrl,
            apply_url: normalizedJob.urls.applyUrl,
            original_apply_url: normalizedJob.urls.originalApplyUrl,
            url_resolution_method: normalizedJob.urls.urlResolutionMethod,
            url_resolution_confidence: normalizedJob.urls.urlResolutionConfidence,
            last_seen_at: nowIso,
            source_metadata: normalizedJob.sourceMetadata as any,
            updated_at: nowIso,
          })
          .eq('id', existingSource.job_id);

        if (updateJobError) {
          throw new Error(`Failed to update job ${existingSource.job_id}: ${updateJobError.message}`);
        }

        // Update provenance timestamp and payload hash
        await supabase
          .from('job_sources')
          .update({
            raw_payload_hash: rawPayload.payloadHash,
            last_seen_at: nowIso,
            source_job_url: normalizedJob.urls.sourceJobUrl,
            discovery_url: normalizedJob.urls.discoveryUrl,
            updated_at: nowIso,
          })
          .eq('id', existingSource.id);

        return { candidateId: candidate.externalJobId, status: 'updated' };
      } else {
        // New Job -> INSERT into jobs table
        const { data: newJob, error: insertJobError } = await supabase
          .from('jobs')
          .insert({
            company_id: companySource.companyId,
            canonical_title: normalizedJob.canonicalTitle,
            display_title: normalizedJob.displayTitle,
            description: normalizedJob.description,
            description_html: normalizedJob.descriptionHtml,
            employment_type: normalizedJob.employmentType,
            workplace_type: normalizedJob.workplaceType,
            locations: normalizedJob.locations,
            salary_min: normalizedJob.salary?.min ?? null,
            salary_max: normalizedJob.salary?.max ?? null,
            salary_currency: normalizedJob.salary?.currency ?? 'USD',
            salary_interval: normalizedJob.salary?.interval ?? null,
            skills: normalizedJob.skills,
            posted_at: normalizedJob.postedAt,
            first_seen_at: nowIso,
            last_seen_at: nowIso,
            status: 'active',
            missed_scrape_count: 0,
            canonical_url: normalizedJob.urls.canonicalUrl,
            apply_url: normalizedJob.urls.applyUrl,
            original_apply_url: normalizedJob.urls.originalApplyUrl,
            url_resolution_method: normalizedJob.urls.urlResolutionMethod,
            url_resolution_confidence: normalizedJob.urls.urlResolutionConfidence,
            source_metadata: normalizedJob.sourceMetadata as any,
          })
          .select('id')
          .single();

        if (insertJobError || !newJob) {
          throw new Error(`Failed to insert new job: ${insertJobError?.message}`);
        }

        // Insert job_sources provenance row
        const { error: insertSourceError } = await supabase.from('job_sources').insert({
          job_id: newJob.id,
          source_id: companySource.sourceId,
          external_job_id: candidate.externalJobId,
          discovery_url: normalizedJob.urls.discoveryUrl,
          source_job_url: normalizedJob.urls.sourceJobUrl,
          raw_payload_hash: rawPayload.payloadHash,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
          is_primary: true,
          metadata: {},
        });

        if (insertSourceError) {
          throw new Error(`Failed to insert job_source mapping: ${insertSourceError.message}`);
        }

        return { candidateId: candidate.externalJobId, status: 'inserted' };
      }
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error processing candidate ${candidate.externalJobId}`, { error: errMessage });
      return {
        candidateId: candidate.externalJobId,
        status: 'failed',
        error: errMessage,
      };
    }
  }
}
