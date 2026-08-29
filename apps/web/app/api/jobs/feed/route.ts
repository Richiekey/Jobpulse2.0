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
  has_salary: z.coerce.boolean().optional(),
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
      has_salary,
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
        annualized_min,
        annualized_max,
        has_salary,
        equity_mentioned,
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

    // 4. Compensation Filters (Batch H)
    if (has_salary) {
      dbQuery = dbQuery.eq('has_salary', true);
    }
    if (salary_min !== undefined) {
      dbQuery = dbQuery.gte('salary_max', salary_min);
    }
    if (salary_max !== undefined) {
      dbQuery = dbQuery.lte('salary_min', salary_max);
    }

    // 5. Skills Filter
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

    // 9. Keyset / Cursor Pagination with tamper validation
    if (decodedCursor) {
      dbQuery = dbQuery.or(`posted_at.lt.${decodedCursor.postedAt},and(posted_at.eq.${decodedCursor.postedAt},id.lt.${decodedCursor.id})`);
    }

    // 10. Stable compound sorting
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

    // Calculate Salary Distribution Facets for the result set
    const salaryFacets = {
      under_100k: 0,
      from_100k_to_150k: 0,
      from_150k_to_200k: 0,
      over_200k: 0,
      with_equity: 0,
      with_disclosed_salary: 0,
    };

    for (const item of resultItems as any[]) {
      if (item.has_salary || item.salary_min !== null || item.salary_max !== null) {
        salaryFacets.with_disclosed_salary++;
        const val = item.annualized_max || item.annualized_min || item.salary_max || item.salary_min || 0;
        if (val < 100000) salaryFacets.under_100k++;
        else if (val <= 150000) salaryFacets.from_100k_to_150k++;
        else if (val <= 200000) salaryFacets.from_150k_to_200k++;
        else salaryFacets.over_200k++;
      }
      if (item.equity_mentioned) {
        salaryFacets.with_equity++;
      }
    }

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
      facets: {
        salaries: salaryFacets,
      },
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while fetching the jobs feed.', err, 500);
  }
}
