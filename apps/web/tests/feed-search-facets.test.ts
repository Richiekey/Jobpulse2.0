import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as feedRoute } from '../app/api/jobs/feed/route';
import * as serverClient from '../lib/supabase/server';
import { AuthGuard } from '../lib/auth-guard';
import { encodeCursor } from '../lib/cursor';

describe('Search & Multi-Faceted Filtering Feed API (S17/S18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock authenticated user for all feed tests
    vi.spyOn(AuthGuard, 'requireAuthenticatedUser').mockResolvedValue({
      user: { id: 'test-user-id' } as any,
      supabase: {} as any,
    });
  });

  it('rejects invalid query parameters with 400 Bad Request', async () => {
    const req = new NextRequest('http://localhost:3000/api/jobs/feed?limit=-5');
    const res = await feedRoute(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain('Invalid feed query parameters');
  });

  it('rejects malformed or tampered cursor tokens with 400 Bad Request', async () => {
    const req = new NextRequest('http://localhost:3000/api/jobs/feed?cursor=not-a-valid-base64-cursor');
    const res = await feedRoute(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain('Invalid or malformed cursor token');
  });

  it('applies multi-faceted filters (workplace, employment, salary, skills, location)', async () => {
    const mockJobs = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        display_title: 'Senior Distributed Systems Engineer',
        canonical_title: 'senior distributed systems engineer',
        employment_type: 'full_time',
        workplace_type: 'remote',
        locations: ['San Francisco, CA', 'Remote'],
        salary_min: 180000,
        salary_max: 240000,
        skills: ['Rust', 'PostgreSQL', 'Distributed Systems'],
        posted_at: '2026-08-29T10:00:00Z',
        canonical_url: 'https://boards.greenhouse.io/stripe/jobs/111',
        apply_url: 'https://boards.greenhouse.io/stripe/jobs/111#app',
        url_resolution_confidence: 1.0,
        companies: {
          id: 'comp_1',
          name: 'Stripe',
          slug: 'stripe',
          domain: 'stripe.com',
        },
      },
    ];

    const mockEq = vi.fn().mockReturnThis();
    const mockGte = vi.fn().mockReturnThis();
    const mockLte = vi.fn().mockReturnThis();
    const mockContains = vi.fn().mockReturnThis();
    const mockTextSearch = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockReturnThis();
    const mockLimit = vi.fn().mockResolvedValue({ data: mockJobs, error: null });

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: mockEq,
          gte: mockGte,
          lte: mockLte,
          contains: mockContains,
          textSearch: mockTextSearch,
          order: mockOrder,
          limit: mockLimit,
          or: vi.fn().mockReturnThis(),
        }),
      }),
    };

    vi.spyOn(serverClient, 'createClient').mockResolvedValue(mockSupabase as any);

    const req = new NextRequest(
      'http://localhost:3000/api/jobs/feed?q=distributed&workplace=remote&employment=full_time&salary_min=150000&salary_max=300000&skill=Rust,PostgreSQL&location=San+Francisco'
    );

    const res = await feedRoute(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].display_title).toBe('Senior Distributed Systems Engineer');
    expect(json.meta.pagination.has_more).toBe(false);
    expect(json.meta.facets.facet_scope).toBe('page');

    // Verify filter parameters applied to DB query
    expect(mockEq).toHaveBeenCalledWith('status', 'active');
    expect(mockEq).toHaveBeenCalledWith('workplace_type', 'remote');
    expect(mockEq).toHaveBeenCalledWith('employment_type', 'full_time');
    expect(mockGte).toHaveBeenCalledWith('salary_max', 150000);
    expect(mockLte).toHaveBeenCalledWith('salary_min', 300000);
    expect(mockContains).toHaveBeenCalledWith('skills', ['Rust', 'PostgreSQL']);
    expect(mockContains).toHaveBeenCalledWith('locations', ['San Francisco']);
    expect(mockTextSearch).toHaveBeenCalledWith('search_vector', 'distributed', {
      type: 'websearch',
      config: 'english',
    });
  });

  it('correctly handles cursor pagination and returns next_cursor when more items exist', async () => {
    const validCursor = encodeCursor('2026-08-29T12:00:00.000Z', '00000000-0000-0000-0000-000000000001');

    const mockJobs = [
      { id: 'job_1', posted_at: '2026-08-29T11:00:00Z', display_title: 'Job 1' },
      { id: 'job_2', posted_at: '2026-08-29T10:00:00Z', display_title: 'Job 2' },
      { id: 'job_3', posted_at: '2026-08-29T09:00:00Z', display_title: 'Job 3' }, // Extra item for has_more
    ];

    const mockOr = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockReturnThis();
    const mockLimit = vi.fn().mockResolvedValue({ data: mockJobs, error: null });

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          or: mockOr,
          order: mockOrder,
          limit: mockLimit,
        }),
      }),
    };

    vi.spyOn(serverClient, 'createClient').mockResolvedValue(mockSupabase as any);

    const req = new NextRequest(`http://localhost:3000/api/jobs/feed?limit=2&cursor=${validCursor}`);
    const res = await feedRoute(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toHaveLength(2);
    expect(json.meta.pagination.has_more).toBe(true);
    expect(json.meta.pagination.next_cursor).not.toBeNull();
  });
});
