import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getFeedRoute } from '../app/api/jobs/feed/route';
import { GET as getBenchmarksRoute } from '../app/api/salaries/benchmarks/route';
import { AuthGuard } from '../lib/auth-guard';
import * as serverDb from '../lib/supabase/server';

describe('Salary & Compensation Intelligence (Batch H Remediation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock authenticated user for all tests
    vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
      user: { id: 'test-user-id' } as any,
      supabase: {} as any,
    });
  });

  describe('Salary Range Cross-Field Validation (P1)', () => {
    it('rejects inverted salary range where salary_min > salary_max with 400 Bad Request', async () => {
      const req = new NextRequest('http://localhost:3000/api/jobs/feed?salary_min=150000&salary_max=100000');
      const res = await getFeedRoute(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
      expect(json.error).toContain('salary_min cannot exceed salary_max');
    });

    it('rejects negative salary values with 400 Bad Request', async () => {
      const req = new NextRequest('http://localhost:3000/api/jobs/feed?salary_min=-5000');
      const res = await getFeedRoute(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
      expect(json.error).toContain('salary_min');
    });

    it('accepts legitimate zero values (salary_min=0) without treating as falsy error', async () => {
      const queryBuilder: any = {};
      queryBuilder.select = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.eq = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.gte = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.lte = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.order = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.limit = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue(queryBuilder),
      };
      vi.spyOn(serverDb, 'createClient').mockResolvedValue(mockSupabase as any);

      const req = new NextRequest('http://localhost:3000/api/jobs/feed?salary_min=0&salary_max=100000');
      const res = await getFeedRoute(req);

      expect(res.status).toBe(200);
      expect(queryBuilder.gte).toHaveBeenCalledWith('salary_max', 0);
      expect(queryBuilder.lte).toHaveBeenCalledWith('salary_min', 100000);
    });

    it('accepts equal bounds (salary_min === salary_max)', async () => {
      const queryBuilder: any = {};
      queryBuilder.select = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.eq = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.gte = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.lte = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.order = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.limit = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue(queryBuilder),
      };
      vi.spyOn(serverDb, 'createClient').mockResolvedValue(mockSupabase as any);

      const req = new NextRequest('http://localhost:3000/api/jobs/feed?salary_min=120000&salary_max=120000');
      const res = await getFeedRoute(req);

      expect(res.status).toBe(200);
    });
  });

  describe('Currency Integrity in Salary Facets & Filtering (P0 & P1)', () => {
    it('isolates salary facets by currency and never mixes raw numbers across currencies', async () => {
      const mockJobs = [
        {
          id: 'job-usd',
          canonical_title: 'Staff Engineer',
          display_title: 'Staff Engineer',
          salary_min: 160000,
          salary_max: 200000,
          salary_currency: 'USD',
          annualized_min: 160000,
          annualized_max: 200000,
          has_salary: true,
          equity_mentioned: true,
          posted_at: new Date().toISOString(),
          companies: { name: 'Vercel' },
        },
        {
          id: 'job-gbp',
          canonical_title: 'Lead Architect',
          display_title: 'Lead Architect',
          salary_min: 110000,
          salary_max: 130000,
          salary_currency: 'GBP',
          annualized_min: 110000,
          annualized_max: 130000,
          has_salary: true,
          equity_mentioned: false,
          posted_at: new Date().toISOString(),
          companies: { name: 'Monzo' },
        },
        {
          id: 'job-eur',
          canonical_title: 'Backend Lead',
          display_title: 'Backend Lead',
          salary_min: 85000,
          salary_max: 95000,
          salary_currency: 'EUR',
          annualized_min: 85000,
          annualized_max: 95000,
          has_salary: true,
          equity_mentioned: true,
          posted_at: new Date().toISOString(),
          companies: { name: 'Spotify' },
        },
      ];

      const queryBuilder: any = {};
      queryBuilder.select = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.eq = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.order = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.limit = vi.fn().mockResolvedValue({
        data: mockJobs,
        error: null,
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue(queryBuilder),
      };
      vi.spyOn(serverDb, 'createClient').mockResolvedValue(mockSupabase as any);

      const req = new NextRequest('http://localhost:3000/api/jobs/feed');
      const res = await getFeedRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();

      const facetsByCurrency = json.meta.facets.salaries_by_currency;
      expect(facetsByCurrency).toBeDefined();

      // USD Facet Check
      expect(facetsByCurrency.USD).toBeDefined();
      expect(facetsByCurrency.USD.from_150k_to_200k).toBe(1);
      expect(facetsByCurrency.USD.with_equity).toBe(1);
      expect(facetsByCurrency.USD.with_disclosed_salary).toBe(1);

      // GBP Facet Check (Strictly isolated from USD)
      expect(facetsByCurrency.GBP).toBeDefined();
      expect(facetsByCurrency.GBP.from_100k_to_150k).toBe(1);
      expect(facetsByCurrency.GBP.with_equity).toBe(0);
      expect(facetsByCurrency.GBP.with_disclosed_salary).toBe(1);

      // EUR Facet Check (Strictly isolated from USD and GBP)
      expect(facetsByCurrency.EUR).toBeDefined();
      expect(facetsByCurrency.EUR.under_100k).toBe(1);
      expect(facetsByCurrency.EUR.with_equity).toBe(1);
      expect(facetsByCurrency.EUR.with_disclosed_salary).toBe(1);
    });

    it('filters strictly by requested currency when currency parameter is passed', async () => {
      const queryBuilder: any = {};
      queryBuilder.select = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.eq = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.gte = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.order = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.limit = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue(queryBuilder),
      };
      vi.spyOn(serverDb, 'createClient').mockResolvedValue(mockSupabase as any);

      const req = new NextRequest('http://localhost:3000/api/jobs/feed?currency=GBP&salary_min=80000');
      const res = await getFeedRoute(req);

      expect(res.status).toBe(200);
      expect(queryBuilder.eq).toHaveBeenCalledWith('salary_currency', 'GBP');
      expect(queryBuilder.gte).toHaveBeenCalledWith('salary_max', 80000);
    });
  });

  describe('Market Salary Benchmarks Semantics (P0 & P1)', () => {
    it('returns single currency benchmark with explicit currency metadata and statistical fields', async () => {
      const mockBenchmarkUSD = {
        currency: 'USD',
        sample_size: 50,
        p25: 140000,
        median: 170000,
        p75: 205000,
        min: 115000,
        max: 260000,
        equity_rate: 82.0,
        insufficient_data: false,
      };

      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: mockBenchmarkUSD,
          error: null,
        }),
      };
      vi.spyOn(serverDb, 'createClient').mockResolvedValue(mockSupabase as any);

      const req = new NextRequest('http://localhost:3000/api/salaries/benchmarks?q=Engineer&currency=USD');
      const res = await getBenchmarksRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.data.currency).toBe('USD');
      expect(json.data.benchmarks.currency).toBe('USD');
      expect(json.data.benchmarks.sample_size).toBe(50);
      expect(json.data.benchmarks.median).toBe(170000);
      expect(json.data.benchmarks.insufficient_data).toBe(false);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_salary_benchmarks', {
        p_query: 'Engineer',
        p_department: null,
        p_workplace_type: 'all',
        p_currency: 'USD',
      });
    });

    it('handles small sample sizes (< 3) with insufficient_data semantics and null percentiles', async () => {
      const mockSmallSample = {
        currency: 'EUR',
        sample_size: 2,
        p25: null,
        median: null,
        p75: null,
        min: 90000,
        max: 95000,
        equity_rate: 50.0,
        insufficient_data: true,
      };

      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: mockSmallSample,
          error: null,
        }),
      };
      vi.spyOn(serverDb, 'createClient').mockResolvedValue(mockSupabase as any);

      const req = new NextRequest('http://localhost:3000/api/salaries/benchmarks?currency=EUR');
      const res = await getBenchmarksRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.data.benchmarks.sample_size).toBe(2);
      expect(json.data.benchmarks.insufficient_data).toBe(true);
      expect(json.data.benchmarks.median).toBeNull();
      expect(json.data.benchmarks.p25).toBeNull();
      expect(json.data.benchmarks.p75).toBeNull();
    });

    it('returns grouped per-currency benchmark list when currency is omitted (never combining cross currencies)', async () => {
      const mockGroupedBenchmarks = [
        {
          currency: 'USD',
          sample_size: 35,
          p25: 135000,
          median: 165000,
          p75: 195000,
          min: 100000,
          max: 240000,
          equity_rate: 80.0,
          insufficient_data: false,
        },
        {
          currency: 'GBP',
          sample_size: 15,
          p25: 85000,
          median: 110000,
          p75: 130000,
          min: 75000,
          max: 150000,
          equity_rate: 60.0,
          insufficient_data: false,
        },
      ];

      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: mockGroupedBenchmarks,
          error: null,
        }),
      };
      vi.spyOn(serverDb, 'createClient').mockResolvedValue(mockSupabase as any);

      const req = new NextRequest('http://localhost:3000/api/salaries/benchmarks?q=Staff');
      const res = await getBenchmarksRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();

      expect(Array.isArray(json.data.benchmarks)).toBe(true);
      expect(json.data.benchmarks.length).toBe(2);
      expect(json.data.benchmarks[0].currency).toBe('USD');
      expect(json.data.benchmarks[1].currency).toBe('GBP');
    });
  });
});
