import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const FeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
  q: z.string().max(200).optional(),
  workplace: z.enum(['all', 'remote', 'hybrid', 'on_site']).optional(),
  employment: z.enum(['all', 'full_time', 'part_time', 'contract', 'internship', 'temporary', 'other']).optional(),
  company_id: z.string().uuid().optional(),
  salary_min: z.coerce.number().min(0).optional(),
  skill: z.string().max(60).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const parseResult = FeedQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid feed query parameters: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { limit, cursor, q: query, workplace, employment, company_id, salary_min, skill } = parseResult.data;

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
    if (company_id) {
      dbQuery = dbQuery.eq('company_id', company_id);
    }

    // Minimum salary filter
    if (salary_min !== undefined) {
      dbQuery = dbQuery.gte('salary_max', salary_min);
    }

    // Skill filter
    if (skill) {
      dbQuery = dbQuery.contains('skills', [skill]);
    }

    // Full-Text Search Query
    if (query && query.trim()) {
      dbQuery = dbQuery.textSearch('search_vector', query.trim(), {
        type: 'websearch',
        config: 'english',
      });
    }

    // Compound Keyset / Cursor Pagination: (posted_at < cursorPostedAt) OR (posted_at = cursorPostedAt AND id < cursorId)
    if (cursor) {
      let cursorPostedAt: string | undefined;
      let cursorId: string | undefined;

      try {
        // Decode base64 or colon-separated token
        const decoded = cursor.includes(':') ? cursor : Buffer.from(cursor, 'base64').toString('utf-8');
        const parts = decoded.split(':');
        cursorPostedAt = parts[0];
        cursorId = parts[1];
      } catch {
        return ApiResponse.error('Invalid cursor token provided.', { cursor }, 400);
      }

      if (cursorPostedAt && cursorId) {
        dbQuery = dbQuery.or(`posted_at.lt.${cursorPostedAt},and(posted_at.eq.${cursorPostedAt},id.lt.${cursorId})`);
      }
    }

    // Stable compound sorting
    dbQuery = dbQuery
      .order('posted_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    const { data: rows, error: queryError } = await dbQuery;

    if (queryError) {
      return ApiResponse.error('Failed to retrieve jobs feed.', queryError, 500);
    }

    const items = rows || [];
    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;

    let nextCursor: string | null = null;
    if (hasMore && resultItems.length > 0) {
      const lastItem = resultItems[resultItems.length - 1];
      if (lastItem) {
        nextCursor = Buffer.from(`${lastItem.posted_at}:${lastItem.id}`).toString('base64');
      }
    }

    return ApiResponse.success(resultItems, {
      pagination: {
        next_cursor: nextCursor,
        has_more: hasMore,
        count: resultItems.length,
      },
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while fetching the jobs feed.', err, 500);
  }
}
