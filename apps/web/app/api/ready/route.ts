import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('ats_platforms').select('id').limit(1);

    if (error) {
      return NextResponse.json({ status: 'degraded', error: error.message }, { status: 503 });
    }

    return NextResponse.json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'unready', error: err instanceof Error ? err.message : 'Unknown' },
      { status: 503 }
    );
  }
}
