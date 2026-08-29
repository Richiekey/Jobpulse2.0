import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { decodeCursor, encodeCursor } from '@/lib/cursor';
import { z } from 'zod';

const FeedQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(300).optional(),
    q: z.string().max(200).optional(),
    workplace: z.enum(['all', 'remote', 'hybrid', 'on_site']).optional(),
    employment: z.enum(['all', 'full_time', 'part_time', 'contract', 'internship', 'temporary', 'other']).optional(),
    company_id: z.string().uuid().optional(),
    salary_min: z.coerce.number().min(0, 'salary_min must be greater than or equal to 0').optional(),
    salary_max: z.coerce.number().min(0, 'salary_max must be greater than or equal to 0').optional(),
    currency: z.string().trim().max(10).toUpperCase().optional(),
    has_salary: z.coerce.boolean().optional(),
    skill: z.string().max(100).optional(),
    location: z.string().max(100).optional(),
    posted_after: z.string().datetime().optional(),
  })
  .refine(
    (data) => {
      if (data.salary_min !== undefined && data.salary_max !== undefined) {
        return data.salary_min <= data.salary_max;
      }
      return true;
    },
    {
      message: 'salary_min cannot exceed salary_max',
      path: ['salary_min'],
    }
  );

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
      currency,
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

    // 4. Currency Isolation Filter (P1 Remediation)
    if (currency && currency !== 'ALL') {
      dbQuery = dbQuery.eq('salary_currency', currency);
    }

    // 5. Compensation Filters (Batch H & P1 Overlap Semantics)
    if (has_salary || salary_min !== undefined || salary_max !== undefined) {
      dbQuery = dbQuery.eq('has_salary', true);
    }
    if (salary_min !== undefined) {
      dbQuery = dbQuery.gte('salary_max', salary_min);
    }
    if (salary_max !== undefined) {
      dbQuery = dbQuery.lte('salary_min', salary_max);
    }

    // 6. Skills Filter
    if (skill) {
      const skillsList = skill.split(',').map((s) => s.trim()).filter(Boolean);
      if (skillsList.length > 0) {
        dbQuery = dbQuery.contains('skills', skillsList);
      }
    }

    // 7. Location Filter
    if (location && location.trim()) {
      dbQuery = dbQuery.contains('locations', [location.trim()]);
    }

    // 8. Date Filter (posted_after)
    if (posted_after) {
      dbQuery = dbQuery.gte('posted_at', posted_after);
    }

    // 9. Weighted Full-Text Search Query
    if (query && query.trim()) {
      dbQuery = dbQuery.textSearch('search_vector', query.trim(), {
        type: 'websearch',
        config: 'english',
      });
    }

    // 10. Keyset / Cursor Pagination with tamper validation
    if (decodedCursor) {
      dbQuery = dbQuery.or(`posted_at.lt.${decodedCursor.postedAt},and(posted_at.eq.${decodedCursor.postedAt},id.lt.${decodedCursor.id})`);
    }

    // 11. Stable compound sorting
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

    // Calculate Currency-Isolated Salary Distribution Facets (P0 Remediation)
    const salariesByCurrency: Record<
      string,
      {
        under_100k: number;
        from_100k_to_150k: number;
        from_150k_to_200k: number;
        over_200k: number;
        with_equity: number;
        with_disclosed_salary: number;
      }
    > = {};

    for (const item of resultItems as any[]) {
      const curr = item.salary_currency && item.salary_currency.trim() ? item.salary_currency.trim().toUpperCase() : 'UNKNOWN';
      if (!salariesByCurrency[curr]) {
        salariesByCurrency[curr] = {
          under_100k: 0,
          from_100k_to_150k: 0,
          from_150k_to_200k: 0,
          over_200k: 0,
          with_equity: 0,
          with_disclosed_salary: 0,
        };
      }

      const currFacet = salariesByCurrency[curr]!;

      if (item.has_salary || item.salary_min !== null || item.salary_max !== null) {
        currFacet.with_disclosed_salary++;
        const val = item.annualized_max || item.annualized_min || item.salary_max || item.salary_min || 0;
        if (val < 100000) currFacet.under_100k++;
        else if (val <= 150000) currFacet.from_100k_to_150k++;
        else if (val <= 200000) currFacet.from_150k_to_200k++;
        else currFacet.over_200k++;
      }
      if (item.equity_mentioned) {
        currFacet.with_equity++;
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
        salaries_by_currency: salariesByCurrency,
      },
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while fetching the jobs feed.', err, 500);
  }
}
