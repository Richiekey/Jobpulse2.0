import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getFeedRoute } from '../app/api/jobs/feed/route';
import { GET as getBenchmarksRoute } from '../app/api/salaries/benchmarks/route';
import * as serverDb from '../lib/supabase/server';

describe('Salary & Compensation Intelligence (Batch H)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/jobs/feed (Compensation Filtering & Facets)', () => {
    it('applies annualized salary floor and returns salary distribution facets', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          canonical_title: 'Staff Engineer',
          display_title: 'Staff Engineer',
          salary_min: 160000,
          salary_max: 200000,
          annualized_min: 160000,
          annualized_max: 200000,
          has_salary: true,
          equity_mentioned: true,
          posted_at: new Date().toISOString(),
          companies: { name: 'Vercel' },
        },
        {
          id: 'job-2',
          canonical_title: 'Senior Frontend Engineer',
          display_title: 'Senior Frontend Engineer',
          salary_min: 120000,
          salary_max: 150000,
          annualized_min: 120000,
          annualized_max: 150000,
          has_salary: true,
          equity_mentioned: false,
          posted_at: new Date().toISOString(),
          companies: { name: 'Stripe' },
        },
      ];

      const queryBuilder: any = {};
      queryBuilder.select = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.eq = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.gte = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.lte = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.order = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.limit = vi.fn().mockResolvedValue({
        data: mockJobs,
        error: null,
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue(queryBuilder),
      };

      vi.spyOn(serverDb, 'createClient').mockResolvedValue(mockSupabase as any);

      const req = new NextRequest('http://localhost:3000/api/jobs/feed?salary_min=120000&has_salary=true');
      const res = await getFeedRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.length).toBe(2);
      expect(json.meta.facets.salaries.with_disclosed_salary).toBe(2);
      expect(json.meta.facets.salaries.with_equity).toBe(1);
      expect(json.meta.facets.salaries.from_150k_to_200k).toBe(1);
      expect(json.meta.facets.salaries.from_100k_to_150k).toBe(1);
    });
  });

  describe('GET /api/salaries/benchmarks (Market Percentiles RPC)', () => {
    it('calls get_salary_benchmarks RPC with filter query and returns market percentiles', async () => {
      const mockBenchmarkData = {
        sample_size: 42,
        p25: 135000,
        median: 165000,
        p75: 195000,
        min: 110000,
        max: 250000,
        equity_rate: 78.5,
      };

      const mockSupabase = {
        rpc: vi.fn().mockImplementation((fnName: string, params: any) => {
          if (fnName === 'get_salary_benchmarks') {
            return Promise.resolve({
              data: mockBenchmarkData,
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      vi.spyOn(serverDb, 'createClient').mockResolvedValue(mockSupabase as any);

      const req = new NextRequest('http://localhost:3000/api/salaries/benchmarks?q=Staff&workplace=remote');
      const res = await getBenchmarksRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.data.benchmarks.sample_size).toBe(42);
      expect(json.data.benchmarks.median).toBe(165000);
      expect(json.data.benchmarks.p25).toBe(135000);
      expect(json.data.benchmarks.p75).toBe(195000);
      expect(json.data.benchmarks.equity_rate).toBe(78.5);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_salary_benchmarks', {
        p_query: 'Staff',
        p_department: null,
        p_workplace_type: 'remote',
      });
    });
  });
});
