import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const SalaryBenchmarkQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  department: z.string().trim().max(100).optional(),
  workplace: z.enum(['all', 'remote', 'hybrid', 'on_site']).default('all'),
  currency: z.string().trim().max(10).toUpperCase().optional(),
});

/**
 * GET /api/salaries/benchmarks
 * Returns currency-isolated compensation market percentiles (25th, median, 75th, min, max, equity rate).
 * Raw cross-currency figures are never combined.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const parseResult = SalaryBenchmarkQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid query parameters: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { q, department, workplace, currency } = parseResult.data;
    const supabase = await createClient();

    const { data: benchmarkData, error } = await supabase.rpc('get_salary_benchmarks', {
      p_query: q || null,
      p_department: department || null,
      p_workplace_type: workplace,
      p_currency: currency || null,
    });

    if (error) {
      return ApiResponse.error('Failed to compute salary benchmarks.', error, 500);
    }

    if (currency) {
      // Single currency response
      return ApiResponse.success({
        query: q || null,
        department: department || null,
        workplace,
        currency,
        benchmarks: benchmarkData || {
          currency,
          sample_size: 0,
          p25: null,
          median: null,
          p75: null,
          min: 0,
          max: 0,
          equity_rate: 0,
          insufficient_data: true,
        },
      });
    }

    // Grouped multi-currency response
    return ApiResponse.success({
      query: q || null,
      department: department || null,
      workplace,
      benchmarks: Array.isArray(benchmarkData) ? benchmarkData : benchmarkData ? [benchmarkData] : [],
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while computing salary benchmarks.', err, 500);
  }
}
