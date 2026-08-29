import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { SourceValidator } from '@jobpulse/ats';
import { assertSafeUrl } from '@jobpulse/shared';
import { z } from 'zod';
import type { CompanySourceConfig } from '@jobpulse/domain';

const ValidateSchema = z.object({
  atsType: z.string().trim().min(1).max(100),
  sourceIdentifier: z.string().trim().min(1).max(100),
  sourceUrl: z.string().url().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAdmin();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = ValidateSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid request payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { atsType, sourceIdentifier, sourceUrl } = parseResult.data;

    // SSRF Defense: If sourceUrl is explicitly provided, validate it
    if (sourceUrl) {
      try {
        assertSafeUrl(sourceUrl);
      } catch (err: any) {
        return ApiResponse.error(`SSRF Protection: Blocked target URL: ${err.message}`, undefined, 400);
      }
    }

    const mockConfig: CompanySourceConfig = {
      id: 'preflight_validation',
      companyId: 'preflight_company',
      sourceId: 'preflight_source',
      sourceIdentifier,
      sourceUrl: sourceUrl || null,
      adapterConfig: { atsType },
      isActive: false,
      healthStatus: 'healthy',
      priority: 100,
      scheduleIntervalMinutes: 360,
      consecutiveFailures: 0,
      lastJobCount: 0,
      discoveryMethod: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validationResult = await SourceValidator.validate(mockConfig, atsType);

    return ApiResponse.success(validationResult);
  } catch (err) {
    return ApiResponse.error(
      'An unexpected error occurred while validating company source.',
      err,
      500
    );
  }
}
