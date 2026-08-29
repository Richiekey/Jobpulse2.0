import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { ATSDetector } from '@jobpulse/ats';
import { z } from 'zod';

const DetectSchema = z.object({
  url: z.string().trim().min(1).max(1000),
  html: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAdmin();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = DetectSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid request payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { url, html } = parseResult.data;
    const result = ATSDetector.detect(url, html);

    return ApiResponse.success({
      detected: result.detected,
      atsType: result.atsType,
      boardIdentifier: result.boardIdentifier,
      confidence: result.confidence,
      sourceUrl: result.sourceUrl,
    });
  } catch (err) {
    return ApiResponse.error(
      'An unexpected error occurred while detecting ATS platform.',
      err,
      500
    );
  }
}
