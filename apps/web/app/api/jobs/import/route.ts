import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { AuthGuard } from '@/lib/auth-guard';
import { ATSDetector, ATSAdapterRegistry } from '@jobpulse/ats';
import { CompanyNormalizer } from '@jobpulse/domain';
import { z } from 'zod';

const ImportUrlsSchema = z.object({
  urls: z.array(z.string().url('Invalid URL format')).min(1, 'At least one URL is required').max(50, 'Maximum 50 URLs per batch'),
});

export interface UrlImportResultItem {
  url: string;
  detected: boolean;
  atsType: string | null;
  boardIdentifier: string | null;
  confidence: number;
  status: 'imported' | 'queued' | 'unsupported_ats' | 'error';
  message: string;
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) return authResult.errorResponse;

    const body = await request.json().catch(() => ({}));
    const parseResult = ImportUrlsSchema.safeParse(body);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Validation failed: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { urls } = parseResult.data;
    const supabase = await createClient();
    const results: UrlImportResultItem[] = [];

    for (const rawUrl of urls) {
      const url = rawUrl.trim();
      const detection = ATSDetector.detect(url);

      if (!detection.detected || !detection.atsType) {
        results.push({
          url,
          detected: false,
          atsType: null,
          boardIdentifier: null,
          confidence: 0,
          status: 'unsupported_ats',
          message: 'Could not match URL to any recognized ATS platform (20 supported platforms).',
        });
        continue;
      }

      const { atsType, boardIdentifier, confidence } = detection;

      try {
        // Find or create company
        const companyName = (boardIdentifier || 'Unknown Company')
          .split(/[-_]/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        const slug = CompanyNormalizer.generateSlug(companyName);

        let { data: company } = await supabase
          .from('companies')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();

        if (!company) {
          const { data: newCompany, error: createCompanyErr } = await supabase
            .from('companies')
            .insert({
              name: companyName,
              slug,
              normalized_name: CompanyNormalizer.normalizeName(companyName),
              status: 'active',
              verified: true,
            })
            .select('id')
            .single();

          if (!createCompanyErr && newCompany) {
            company = newCompany;
          }
        }

        // Upsert company_source record
        if (company?.id && boardIdentifier) {
          await supabase.from('company_sources').upsert(
            {
              company_id: company.id,
              ats_platform: atsType,
              source_identifier: boardIdentifier,
              is_active: true,
              health_status: 'healthy',
              discovery_method: 'bulk_import',
            },
            { onConflict: 'company_id,ats_platform,source_identifier' }
          );
        }

        results.push({
          url,
          detected: true,
          atsType,
          boardIdentifier,
          confidence,
          status: 'queued',
          message: `Successfully detected ${atsType.toUpperCase()} board "${boardIdentifier}". Source registered and queued for discovery crawl.`,
        });
      } catch (err: unknown) {
        results.push({
          url,
          detected: true,
          atsType,
          boardIdentifier,
          confidence,
          status: 'error',
          message: err instanceof Error ? err.message : 'Database registration failed',
        });
      }
    }

    return ApiResponse.success({
      total: urls.length,
      detected_count: results.filter((r) => r.detected).length,
      results,
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred during URL import processing.', err, 500);
  }
}
