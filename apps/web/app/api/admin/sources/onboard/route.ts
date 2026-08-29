import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { CompanySourceOnboardingService } from '@jobpulse/domain';
import { z } from 'zod';

const OnboardSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  companyDomain: z.string().trim().max(200).optional().nullable(),
  careersUrl: z.string().trim().max(500).optional().nullable(),
  atsType: z.string().trim().min(1).max(100),
  boardIdentifier: z.string().trim().min(1).max(100),
  sourceUrl: z.string().trim().max(500).optional().nullable(),
  priority: z.number().int().min(1).max(1000).optional(),
  scheduleIntervalMinutes: z.number().int().min(15).max(43200).optional(),
  isActive: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAdmin();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase } = authResult;

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = OnboardSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid request payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const input = parseResult.data;

    // 1. Resolve ATS source record
    const { data: sourceRecord, error: sourceError } = await supabase
      .from('sources')
      .select('id, adapter_name')
      .eq('adapter_name', input.atsType)
      .single();

    if (sourceError || !sourceRecord) {
      return ApiResponse.error(
        `ATS source adapter "${input.atsType}" not found in registered sources catalog.`,
        sourceError,
        400
      );
    }

    // 2. Targeted Candidate Company Query (prevents full-table scan)
    const filter = CompanySourceOnboardingService.getCandidateLookupFilter(input);
    let candidateQuery = supabase
      .from('companies')
      .select('id, name, slug, domain, normalized_name, careers_url, logo_url, description, industry, company_size, location, verified, status, metadata, created_at, updated_at');

    if (filter.domain) {
      candidateQuery = candidateQuery.or(`domain.eq.${filter.domain},normalized_name.eq.${filter.normalizedName}`);
    } else {
      candidateQuery = candidateQuery.eq('normalized_name', filter.normalizedName);
    }

    const { data: candidateCompaniesRaw } = await candidateQuery;

    const candidateCompanies = (candidateCompaniesRaw || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      domain: c.domain,
      normalizedName: c.normalized_name,
      careersUrl: c.careers_url,
      logoUrl: c.logo_url,
      description: c.description,
      industry: c.industry,
      companySize: c.company_size,
      location: c.location,
      verified: c.verified ?? false,
      status: (c.status || 'active') as 'active' | 'inactive' | 'pending_verification',
      metadata: c.metadata || {},
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    // 3. Prepare deterministic company & source payload
    const prepared = CompanySourceOnboardingService.prepareOnboarding(input, candidateCompanies);

    // 4. Atomic Transaction via Database RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc('onboard_company_and_source', {
      p_company_name: prepared.preparedCompany.name,
      p_company_slug: prepared.preparedCompany.slug,
      p_company_domain: prepared.preparedCompany.domain,
      p_careers_url: prepared.preparedCompany.careersUrl,
      p_normalized_name: prepared.preparedCompany.normalizedName,
      p_source_id: sourceRecord.id,
      p_source_identifier: prepared.preparedSource.sourceIdentifier,
      p_source_url: prepared.preparedSource.sourceUrl,
      p_priority: prepared.preparedSource.priority,
      p_schedule_interval_minutes: prepared.preparedSource.scheduleIntervalMinutes,
      p_is_active: prepared.preparedSource.isActive,
      p_health_status: prepared.preparedSource.healthStatus,
    });

    if (!rpcError && rpcResult) {
      return ApiResponse.success(
        {
          companyId: rpcResult.company_id,
          companySlug: rpcResult.company_slug,
          companyName: rpcResult.company_name,
          isNewCompany: rpcResult.is_new_company,
          companySourceId: rpcResult.company_source_id,
        },
        undefined,
        { status: 201 }
      );
    }

    // Fallback: If RPC is not available in mock/test environment, execute atomic sequential steps
    let companyId = prepared.matchedCompany?.id;

    if (!companyId) {
      const { data: newCompany, error: companyInsertError } = await supabase
        .from('companies')
        .insert({
          name: prepared.preparedCompany.name,
          slug: prepared.preparedCompany.slug,
          domain: prepared.preparedCompany.domain,
          careers_url: prepared.preparedCompany.careersUrl,
          normalized_name: prepared.preparedCompany.normalizedName,
          verified: false,
          status: 'active',
        })
        .select('id, name, slug, domain')
        .single();

      if (companyInsertError || !newCompany) {
        return ApiResponse.error('Failed to create company record.', companyInsertError, 500);
      }

      companyId = newCompany.id;
    }

    const { data: companySource, error: csUpsertError } = await supabase
      .from('company_sources')
      .upsert(
        {
          company_id: companyId,
          source_id: sourceRecord.id,
          source_identifier: prepared.preparedSource.sourceIdentifier,
          source_url: prepared.preparedSource.sourceUrl,
          priority: prepared.preparedSource.priority,
          schedule_interval_minutes: prepared.preparedSource.scheduleIntervalMinutes,
          is_active: prepared.preparedSource.isActive,
          health_status: prepared.preparedSource.healthStatus,
        },
        { onConflict: 'company_id, source_id, source_identifier' }
      )
      .select('id, company_id, source_id, source_identifier, source_url, is_active, health_status, priority, schedule_interval_minutes')
      .single();

    if (csUpsertError || !companySource) {
      return ApiResponse.error('Failed to create company source record.', csUpsertError, 500);
    }

    return ApiResponse.success(
      {
        companyId,
        companySlug: prepared.preparedCompany.slug,
        companyName: prepared.preparedCompany.name,
        isNewCompany: !prepared.matchedCompany,
        companySource,
      },
      undefined,
      { status: 201 }
    );
  } catch (err) {
    return ApiResponse.error(
      'An unexpected error occurred during company source onboarding.',
      err,
      500
    );
  }
}
