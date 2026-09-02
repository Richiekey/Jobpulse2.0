import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { decodeCursor, encodeCursor } from '@/lib/cursor';
import { z } from 'zod';

const FeedQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().max(300).optional(),
    q: z.string().max(200).optional(),
    search: z.string().max(200).optional(),
    function: z.string().max(300).optional(),
    job_function: z.string().max(300).optional(),
    ats: z.string().max(300).optional(),
    ats_platform: z.string().max(300).optional(),
    workplace: z.string().max(200).optional(),
    employment: z.string().max(200).optional(),
    country: z.string().max(200).optional(),
    location_country: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    location_city: z.string().max(100).optional(),
    is_remote: z.coerce.boolean().optional(),
    company_id: z.string().uuid().optional(),
    salary_min: z.coerce.number().min(0, 'salary_min must be greater than or equal to 0').optional(),
    salary_max: z.coerce.number().min(0, 'salary_max must be greater than or equal to 0').optional(),
    currency: z.string().trim().max(10).toUpperCase().optional(),
    has_salary: z.coerce.boolean().optional(),
    skill: z.string().max(100).optional(),
    location: z.string().max(100).optional(),
    date_preset: z.enum(['24h', '3d', '7d', '14d', '30d', 'all']).optional(),
    posted_after: z.string().optional(),
    sort: z.enum(['posted_at_desc', 'posted_at_asc', 'salary_desc', 'salary_asc']).default('posted_at_desc'),
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
      q,
      search,
      function: fnParam,
      job_function: jobFnParam,
      ats: atsParam,
      ats_platform: atsPlatformParam,
      workplace,
      employment,
      country,
      location_country,
      city,
      location_city,
      is_remote,
      company_id,
      salary_min,
      salary_max,
      currency,
      has_salary,
      skill,
      location,
      date_preset,
      posted_after: explicitPostedAfter,
      sort,
    } = parseResult.data;

    const searchTerm = (q || search || '').trim();
    const functionSlugParam = fnParam || jobFnParam;
    const atsSlugParam = atsParam || atsPlatformParam;
    const countryParam = country || location_country;
    const cityParam = city || location_city;

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
        ats_platform_slug,
        job_function_slug,
        job_function_confidence,
        location_country,
        location_region,
        location_city,
        is_remote,
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

    // 1. Job Function Filter (Multi-Select)
    if (functionSlugParam && functionSlugParam !== 'all') {
      const functionsList = functionSlugParam
        .split(',')
        .map((f) => f.trim().toLowerCase())
        .filter(Boolean);
      if (functionsList.length === 1) {
        dbQuery = dbQuery.eq('job_function_slug', functionsList[0]!);
      } else if (functionsList.length > 1) {
        dbQuery = dbQuery.in('job_function_slug', functionsList);
      }
    }

    // 2. ATS Platform Filter (Multi-Select)
    if (atsSlugParam && atsSlugParam !== 'all') {
      const atsList = atsSlugParam
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);
      if (atsList.length === 1) {
        dbQuery = dbQuery.eq('ats_platform_slug', atsList[0]!);
      } else if (atsList.length > 1) {
        dbQuery = dbQuery.in('ats_platform_slug', atsList);
      }
    }

    // 3. Workplace Type Filter (Multi-Select)
    if (workplace && workplace !== 'all') {
      const workplaceList = workplace
        .split(',')
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean);
      if (workplaceList.length === 1) {
        dbQuery = dbQuery.eq('workplace_type', workplaceList[0] as any);
      } else if (workplaceList.length > 1) {
        dbQuery = dbQuery.in('workplace_type', workplaceList as any[]);
      }
    }

    // 4. Remote Flag Filter
    if (is_remote === true) {
      dbQuery = dbQuery.eq('is_remote', true);
    }

    // 5. Employment Type Filter (Multi-Select)
    if (employment && employment !== 'all') {
      const empList = employment
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      if (empList.length === 1) {
        dbQuery = dbQuery.eq('employment_type', empList[0] as any);
      } else if (empList.length > 1) {
        dbQuery = dbQuery.in('employment_type', empList as any[]);
      }
    }

    // 6. Country Filter (Multi-Select)
    if (countryParam && countryParam !== 'all') {
      const countriesList = countryParam
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      if (countriesList.length === 1) {
        dbQuery = dbQuery.eq('location_country', countriesList[0]!);
      } else if (countriesList.length > 1) {
        dbQuery = dbQuery.in('location_country', countriesList);
      }
    }

    // 7. City Filter
    if (cityParam && cityParam.trim()) {
      dbQuery = dbQuery.ilike('location_city', `%${cityParam.trim()}%`);
    }

    // 8. Company Filter
    if (company_id) {
      dbQuery = dbQuery.eq('company_id', company_id);
    }

    // 9. Currency Filter
    if (currency && currency !== 'ALL') {
      dbQuery = dbQuery.eq('salary_currency', currency);
    }

    // 10. Compensation Filters
    if (has_salary || salary_min !== undefined || salary_max !== undefined) {
      dbQuery = dbQuery.eq('has_salary', true);
    }
    if (salary_min !== undefined) {
      dbQuery = dbQuery.gte('salary_max', salary_min);
    }
    if (salary_max !== undefined) {
      dbQuery = dbQuery.lte('salary_min', salary_max);
    }

    // 11. Skills Filter
    if (skill) {
      const skillsList = skill.split(',').map((s) => s.trim()).filter(Boolean);
      if (skillsList.length > 0) {
        dbQuery = dbQuery.contains('skills', skillsList);
      }
    }

    // 12. Location Legacy String Filter
    if (location && location.trim()) {
      dbQuery = dbQuery.contains('locations', [location.trim()]);
    }

    // 13. Date Preset / Posted After Filter
    let effectivePostedAfter = explicitPostedAfter;
    if (date_preset && date_preset !== 'all') {
      const hoursMap: Record<string, number> = {
        '24h': 24,
        '3d': 72,
        '7d': 168,
        '14d': 336,
        '30d': 720,
      };
      const hours = hoursMap[date_preset];
      if (hours) {
        effectivePostedAfter = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      }
    }

    if (effectivePostedAfter) {
      dbQuery = dbQuery.gte('posted_at', effectivePostedAfter);
    }

    // 14. Full-Text Search Query
    if (searchTerm) {
      dbQuery = dbQuery.textSearch('search_vector', searchTerm, {
        type: 'websearch',
        config: 'english',
      });
    }

    // 15. Keyset / Cursor Pagination
    if (decodedCursor) {
      dbQuery = dbQuery.or(`posted_at.lt.${decodedCursor.postedAt},and(posted_at.eq.${decodedCursor.postedAt},id.lt.${decodedCursor.id})`);
    }

    // 16. Sort Order
    if (sort === 'posted_at_asc') {
      dbQuery = dbQuery.order('posted_at', { ascending: true }).order('id', { ascending: true });
    } else if (sort === 'salary_desc') {
      dbQuery = dbQuery.order('salary_max', { ascending: false, nullsFirst: false }).order('posted_at', { ascending: false });
    } else if (sort === 'salary_asc') {
      dbQuery = dbQuery.order('salary_min', { ascending: true, nullsFirst: false }).order('posted_at', { ascending: false });
    } else {
      // Default: posted_at_desc
      dbQuery = dbQuery.order('posted_at', { ascending: false }).order('id', { ascending: false });
    }

    dbQuery = dbQuery.limit(limit + 1);

    const { data: rows, error: queryError } = await dbQuery;

    if (queryError) {
      return ApiResponse.error('Failed to retrieve jobs feed.', queryError, 500);
    }

    const items = rows || [];
    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;

    // Calculate Currency-Isolated Salary Distribution Facets
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
        facet_scope: 'page',
        salaries_by_currency: salariesByCurrency,
      },
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while fetching the jobs feed.', err, 500);
  }
}
