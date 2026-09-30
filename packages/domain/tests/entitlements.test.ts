import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserEntitlements, FREE_ENTITLEMENTS, PRO_ENTITLEMENTS } from '../src/entitlements';
import { SupabaseClient } from '@supabase/supabase-js';

describe('Entitlements Resolver', () => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn()
  } as unknown as SupabaseClient<any>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return FREE entitlements for anonymous user', async () => {
    const result = await getUserEntitlements(mockSupabase, '');
    expect(result).toEqual(FREE_ENTITLEMENTS);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('should return FREE entitlements if no subscription exists', async () => {
    (mockSupabase.maybeSingle as any).mockResolvedValue({ data: null, error: null });
    const result = await getUserEntitlements(mockSupabase, 'user-123');
    expect(result).toEqual(FREE_ENTITLEMENTS);
  });

  it('should return PRO entitlements for active monthly plan', async () => {
    (mockSupabase.maybeSingle as any).mockResolvedValue({
      data: {
        status: 'active',
        billing_plans: { code: 'pro_monthly' }
      },
      error: null
    });
    
    const result = await getUserEntitlements(mockSupabase, 'user-123');
    expect(result.plan).toBe('pro_monthly');
    expect(result.can_use_advanced_filters).toBe(true);
    expect(result.max_saved_jobs).toBe(Infinity);
  });

  it('should return PRO entitlements for active annual plan', async () => {
    (mockSupabase.maybeSingle as any).mockResolvedValue({
      data: {
        status: 'active',
        billing_plans: { code: 'pro_annual' }
      },
      error: null
    });
    
    const result = await getUserEntitlements(mockSupabase, 'user-123');
    expect(result.plan).toBe('pro_annual');
    expect(result.can_use_advanced_filters).toBe(true);
  });

  it('should return FREE entitlements on database error', async () => {
    (mockSupabase.maybeSingle as any).mockResolvedValue({
      data: null,
      error: new Error('DB Connection Failed')
    });
    
    const result = await getUserEntitlements(mockSupabase, 'user-123');
    expect(result).toEqual(FREE_ENTITLEMENTS);
  });
});
