import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: job, error } = await supabase
      .from('jobs')
      .select(`
        *,
        companies (
          id,
          name,
          normalized_name,
          logo_url,
          website,
          careers_url,
          industry
        ),
        job_sources (
          id,
          source_id,
          discovery_url,
          source_job_url,
          first_seen_at,
          last_seen_at,
          sources (
            id,
            name,
            adapter_name,
            domain
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({ data: job });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
