import { NextRequest, NextResponse } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { processPendingSyncBatch } from '@/lib/sync-processor';

/**
 * POST /api/sync/process
 *
 * Serverless-compatible sync processor. Processes pending Google Sheets sync events
 * directly within a Vercel function. Designed to be called by:
 *   - Vercel Cron (every minute or configured schedule)
 *   - Authenticated user / manual trigger
 *
 * Protected by CRON_SECRET / SYNC_CRON_SECRET or authenticated user session.
 */
export const maxDuration = 10; // Max allowed duration on Vercel Hobby plan

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env['CRON_SECRET'] || process.env['SYNC_CRON_SECRET'];

  let isAuthorized = false;

  // 1. Check Cron / Bearer token authorization
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    isAuthorized = true;
  }

  // 2. Check if authenticated user session is making the request
  if (!isAuthorized) {
    const authResult = await AuthGuard.requireAuthenticatedUser().catch(() => null);
    if (authResult && !('errorResponse' in authResult)) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized: missing or invalid CRON_SECRET or authenticated session' },
      { status: 401 }
    );
  }

  try {
    const result = await processPendingSyncBatch(10);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Sync processor failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

// Also support GET for Vercel Cron (which sends GET requests)
export async function GET(request: NextRequest) {
  return POST(request);
}
