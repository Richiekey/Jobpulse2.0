import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionPipeline } from '../src/engine/pipeline.js';
import { supabase } from '../src/db.js';

describe('Deterministic Employer Company Resolution & Collision Safety Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    IngestionPipeline.clearCompanyCache();
  });

  it('Test 1 — First crawl: Guidehouse creates one company with deterministic slug', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'company_guidehouse_123' },
          error: null,
        }),
      }),
    });

    const mockFrom = vi.spyOn(supabase, 'from');

    // Mock DB: company doesn't exist, slug not taken, insert succeeds
    mockFrom.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: mockInsert,
        } as any;
      }
      return {} as any;
    });

    const companyId = await IngestionPipeline.resolveEmployerCompanyId('Guidehouse', 'https://guidehouse.com');

    expect(companyId).toBe('company_guidehouse_123');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Guidehouse',
        normalized_name: 'guidehouse',
        slug: 'guidehouse',
        website: 'https://guidehouse.com',
      })
    );
  });

  it('Test 2 — Second crawl: Same Guidehouse resolves to the exact same company ID without insert', async () => {
    const mockFrom = vi.spyOn(supabase, 'from');

    // Mock DB: company already exists
    const mockInsert = vi.fn();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'company_guidehouse_123' },
                error: null,
              }),
            }),
          }),
          insert: mockInsert,
        } as any;
      }
      return {} as any;
    });

    // 1st resolution
    const id1 = await IngestionPipeline.resolveEmployerCompanyId('Guidehouse');
    expect(id1).toBe('company_guidehouse_123');

    // 2nd resolution (served from memory cache)
    const id2 = await IngestionPipeline.resolveEmployerCompanyId('Guidehouse');
    expect(id2).toBe('company_guidehouse_123');

    // Clear memory cache to simulate next crawl run
    IngestionPipeline.clearCompanyCache();

    // 3rd resolution (served from database lookup)
    const id3 = await IngestionPipeline.resolveEmployerCompanyId('Guidehouse');
    expect(id3).toBe('company_guidehouse_123');

    // Verify insert was NEVER called
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('Test 3 — Different Jobright repositories: Same employer in different feeds resolves to same ID', async () => {
    const mockFrom = vi.spyOn(supabase, 'from');

    mockFrom.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'company_draper_456' },
                error: null,
              }),
            }),
          }),
          insert: vi.fn(),
        } as any;
      }
      return {} as any;
    });

    // In repository 1 (e.g. 2026-Software-Engineer-New-Grad)
    const repo1Id = await IngestionPipeline.resolveEmployerCompanyId('Draper');
    // In repository 2 (e.g. 2026-Engineering-New-Grad)
    const repo2Id = await IngestionPipeline.resolveEmployerCompanyId('Draper');

    expect(repo1Id).toBe(repo2Id);
    expect(repo1Id).toBe('company_draper_456');
  });

  it('Test 4 — Case and whitespace normalization: Equivalent variants resolve to same ID', async () => {
    const mockFrom = vi.spyOn(supabase, 'from');

    mockFrom.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              if (val === 'bloomberg') {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'company_bloomberg_789' },
                    error: null,
                  }),
                };
              }
              return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
            }),
          }),
          insert: vi.fn(),
        } as any;
      }
      return {} as any;
    });

    const id1 = await IngestionPipeline.resolveEmployerCompanyId('Bloomberg');
    const id2 = await IngestionPipeline.resolveEmployerCompanyId('  bloomberg  ');
    const id3 = await IngestionPipeline.resolveEmployerCompanyId('BLOOMBERG');

    expect(id1).toBe('company_bloomberg_789');
    expect(id2).toBe('company_bloomberg_789');
    expect(id3).toBe('company_bloomberg_789');
  });

  it('Test 5 — Deterministic Slug: Slugs are strictly deterministic lowercase alphanumeric, no randomness', async () => {
    const mockFrom = vi.spyOn(supabase, 'from');

    let insertedSlug = '';
    mockFrom.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            insertedSlug = payload.slug;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'company_id_101' },
                  error: null,
                }),
              }),
            };
          }),
        } as any;
      }
      return {} as any;
    });

    await IngestionPipeline.resolveEmployerCompanyId('EA SPORTS & Gaming!!');
    expect(insertedSlug).toBe('ea-sports-gaming');
    // Ensure zero random characters suffix (e.g. -ab12)
    expect(insertedSlug).not.toMatch(/-[0-9a-z]{4}$/i);
  });

  it('Test 6 — Slug collision with a different company: Generates deterministic suffix (-2, -3)', async () => {
    const mockFrom = vi.spyOn(supabase, 'from');

    let insertedSlug = '';
    mockFrom.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === 'normalized_name') {
                // Not found by normalized name (new company)
                return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
              }
              if (col === 'slug') {
                if (val === 'ramp') {
                  // Slug 'ramp' is already taken by a different company
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'existing_other_ramp_id', normalized_name: 'ramp-different' },
                      error: null,
                    }),
                  };
                }
                // 'ramp-2' is available
                return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
              }
              return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
            }),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            insertedSlug = payload.slug;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'new_ramp_id' },
                  error: null,
                }),
              }),
            };
          }),
        } as any;
      }
      return {} as any;
    });

    const companyId = await IngestionPipeline.resolveEmployerCompanyId('Ramp');
    expect(companyId).toBe('new_ramp_id');
    expect(insertedSlug).toBe('ramp-2');
  });

  it('Test 7 — Concurrent race scenario: Loser of race catches conflict and returns winner ID', async () => {
    const mockFrom = vi.spyOn(supabase, 'from');

    let isFirstLookup = true;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === 'normalized_name') {
                if (isFirstLookup) {
                  isFirstLookup = false;
                  // Initially not found
                  return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
                }
                // When re-checked after collision, winner's record is found
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'race_winner_company_id' },
                    error: null,
                  }),
                };
              }
              // Slug lookup returns null (appears free)
              return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'duplicate key value violates unique constraint "companies_normalized_name_key"', code: '23505' },
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const companyId = await IngestionPipeline.resolveEmployerCompanyId('Stoke Space');
    expect(companyId).toBe('race_winner_company_id');
  });
});
