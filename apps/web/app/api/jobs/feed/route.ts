import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { decodeCursor, encodeCursor } from '@/lib/cursor';
import { z } from 'zod';

const FeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(300).optional(),
  q: z.string().max(200).optional(),
  workplace: z.enum(['all', 'remote', 'hybrid', 'on_site']).optional(),
  employment: z.enum(['all', 'full_time', 'part_time', 'contract', 'internship', 'temporary', 'other']).optional(),
  company_id: z.string().uuid().optional(),
  salary_min: z.coerce.number().min(0).optional(),
  salary_max: z.coerce.number().min(0).optional(),
  skill: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  posted_after: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const parseResult = FeedQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid feed query parameters: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const {
      limit,
      cursor,
      q: query,
      workplace,
      employment,
      company_id,
      salary_min,
      salary_max,
      skill,
      location,
      posted_after,
    } = parseResult.data;

    let decodedCursor: { postedAt: string; id: string } | null = null;
    if (cursor) {
      decodedCursor = decodeCursor(cursor);
      if (!decodedCursor) {
        return ApiResponse.error('Invalid or malformed cursor token.', null, 400);
      }
    }

    const supabase = await createClient();

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
          slug,
          domain,
          normalized_name,
          logo_url,
          website,
          industry
        )
      `)
      .eq('status', 'active');

    // 1. Workplace Type Filter
    if (workplace && workplace !== 'all') {
      dbQuery = dbQuery.eq('workplace_type', workplace as any);
    }

    // 2. Employment Type Filter
    if (employment && employment !== 'all') {
      dbQuery = dbQuery.eq('employment_type', employment as any);
    }

    // 3. Company Filter
    if (company_id) {
      dbQuery = dbQuery.eq('company_id', company_id);
    }

    // 4. Salary Floor & Ceiling Filters
    if (salary_min !== undefined) {
      dbQuery = dbQuery.gte('salary_max', salary_min);
    }
    if (salary_max !== undefined) {
      dbQuery = dbQuery.lte('salary_min', salary_max);
    }

    // 5. Skills Filter (supports single skill or comma-separated list)
    if (skill) {
      const skillsList = skill.split(',').map((s) => s.trim()).filter(Boolean);
      if (skillsList.length > 0) {
        dbQuery = dbQuery.contains('skills', skillsList);
      }
    }

    // 6. Location Filter
    if (location && location.trim()) {
      dbQuery = dbQuery.contains('locations', [location.trim()]);
    }

    // 7. Date Filter (posted_after)
    if (posted_after) {
      dbQuery = dbQuery.gte('posted_at', posted_after);
    }

    // 8. Weighted Full-Text Search Query
    if (query && query.trim()) {
      dbQuery = dbQuery.textSearch('search_vector', query.trim(), {
        type: 'websearch',
        config: 'english',
      });
    }

    // 9. Keyset / Cursor Pagination with tamper validation (M10.3, M10.4)
    if (decodedCursor) {
      dbQuery = dbQuery.or(`posted_at.lt.${decodedCursor.postedAt},and(posted_at.eq.${decodedCursor.postedAt},id.lt.${decodedCursor.id})`);
    }

    // 10. Stable compound sorting (M10.1)
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
        nextCursor = encodeCursor(lastItem.posted_at, lastItem.id);
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
