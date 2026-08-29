import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { ATSDetector } from '@jobpulse/ats';
import { assertSafeUrl } from '@jobpulse/shared';
import { z } from 'zod';

// Maximum allowed HTML size: 2MB to prevent DoS via payload memory exhaustion
const MAX_HTML_SIZE_BYTES = 2 * 1024 * 1024;

const DetectSchema = z.object({
  url: z.string().trim().min(1).max(1000),
  html: z.string().max(MAX_HTML_SIZE_BYTES, 'HTML payload exceeds 2MB maximum limit').optional(),
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

    // SSRF Defense: Validate URL before processing
    try {
      assertSafeUrl(url);
    } catch (err: any) {
      return ApiResponse.error(`SSRF Protection: Blocked target URL: ${err.message}`, undefined, 400);
    }

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
