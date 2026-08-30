import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

let lastDbCheck: { ok: boolean; at: number } = { ok: true, at: 0 };
const DB_CHECK_CACHE_MS = 30_000; // 30s cache to avoid query saturation on frequent liveness checks

export async function GET() {
  const now = Date.now();

  // Probe database if cache has expired
  if (now - lastDbCheck.at > DB_CHECK_CACHE_MS) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from('sources').select('id').limit(1);
      lastDbCheck = { ok: !error, at: now };
    } catch {
      lastDbCheck = { ok: false, at: now };
    }
  }

  if (!lastDbCheck.ok) {
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'error',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: 'ok',
    database: 'connected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}

