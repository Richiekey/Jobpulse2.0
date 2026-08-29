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

    // 2. Query existing companies for deduplication match
    const { data: existingCompaniesRaw } = await supabase
      .from('companies')
      .select('id, name, slug, domain, normalized_name, careers_url, logo_url, description, industry, company_size, location, verified, metadata, created_at, updated_at');

    const existingCompanies = (existingCompaniesRaw || []).map((c: any) => ({
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
      verified: c.verified,
      status: (c.status || 'active') as 'active' | 'inactive' | 'pending_verification',
      metadata: c.metadata || {},
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    // 3. Prepare deterministic company & source data
    const prepared = CompanySourceOnboardingService.prepareOnboarding(input, existingCompanies);

    let companyId = prepared.matchedCompany?.id;

    // 4. If new company, insert into companies table
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
        })
        .select('id, name, slug, domain')
        .single();

      if (companyInsertError || !newCompany) {
        return ApiResponse.error('Failed to create company record.', companyInsertError, 500);
      }

      companyId = newCompany.id;
    }

    // 5. Upsert company_sources record
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
