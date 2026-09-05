import { NextRequest } from 'next/server';
import { ApiResponse } from '@/lib/api-response';
import { SyncRetryService } from '@/lib/sync-retry-service';
import { z } from 'zod';

const RetrySchema = z.object({
  eventId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = RetrySchema.safeParse(body);

    if (!parseResult.success) {
      return ApiResponse.error(
        'Invalid retry payload',
        parseResult.error.flatten(),
        400
      );
    }

    return await SyncRetryService.executeRetry(parseResult.data);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred during sync retry.', err, 500);
  }
}

