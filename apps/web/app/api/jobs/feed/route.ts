import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const cursor = searchParams.get('cursor');
    const query = searchParams.get('q')?.trim();
    const workplace = searchParams.get('workplace');
    const employment = searchParams.get('employment');
    const companyId = searchParams.get('company_id');
    const salaryMin = searchParams.get('salary_min');
    const skill = searchParams.get('skill');

    let dbQuery = supabase
      .from('jobs')
      .select(`
        id,
        canonical_title,
        display_title,
        description,
        description_html,
        employment_type,
        workplace_type,
        locations,
        salary_min,
        salary_max,
        salary_currency,
        salary_interval,
        skills,
        posted_at,
        first_seen_at,
        status,
        canonical_url,
        apply_url,
        url_resolution_confidence,
        companies (
          id,
          name,
          normalized_name,
          logo_url,
          website,
          industry
        )
      `)
      .eq('status', 'active');

    // Workplace filter
    if (workplace && workplace !== 'all') {
      dbQuery = dbQuery.eq('workplace_type', workplace as any);
    }

    // Employment type filter
    if (employment && employment !== 'all') {
      dbQuery = dbQuery.eq('employment_type', employment as any);
    }

    // Company filter
    if (companyId) {
      dbQuery = dbQuery.eq('company_id', companyId);
    }

    // Minimum salary filter
    if (salaryMin) {
      const minNum = parseFloat(salaryMin);
      if (!isNaN(minNum)) {
        dbQuery = dbQuery.gte('salary_max', minNum);
      }
    }

    // Skill filter
    if (skill) {
      dbQuery = dbQuery.contains('skills', [skill]);
    }

    // Full-Text Search Query
    if (query) {
      dbQuery = dbQuery.textSearch('search_vector', query, {
        type: 'websearch',
        config: 'english',
      });
    }

    // Keyset / Cursor Pagination: (posted_at, id) < (cursorPostedAt, cursorId)
    if (cursor) {
      const [cursorPostedAt, cursorId] = cursor.split(':');
      if (cursorPostedAt && cursorId) {
        dbQuery = dbQuery.lt('posted_at', cursorPostedAt);
      }
    }

    // Stable Sorting
    dbQuery = dbQuery
      .order('posted_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    const { data: rows, error } = await dbQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = rows || [];
    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;

    let nextCursor: string | null = null;
    if (hasMore && resultItems.length > 0) {
      const lastItem = resultItems[resultItems.length - 1];
      if (lastItem) {
        nextCursor = `${lastItem.posted_at}:${lastItem.id}`;
      }
    }

    return NextResponse.json({
      data: resultItems,
      pagination: {
        next_cursor: nextCursor,
        has_more: hasMore,
        count: resultItems.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
