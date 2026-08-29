import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as detectRoute } from '../app/api/admin/sources/detect/route.js';
import { POST as validateRoute } from '../app/api/admin/sources/validate/route.js';
import { AuthGuard } from '../lib/auth-guard.js';

describe('Admin Source Intelligence APIs Security & Behavior (S14)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValueOnce({
      errorResponse: new Response(
        JSON.stringify({ error: { message: 'Unauthorized: Authentication is required.' } }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      ),
    } as any);

    const req = new NextRequest('http://localhost:3000/api/admin/sources/detect', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://boards.greenhouse.io/stripe' }),
    });

    const res = await detectRoute(req);
    expect(res.status).toBe(401);
  });

  it('rejects non-admin users with 403 Forbidden', async () => {
    vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValueOnce({
      errorResponse: new Response(
        JSON.stringify({ error: { message: 'Forbidden: You do not have administrator permissions.' } }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      ),
    } as any);

    const req = new NextRequest('http://localhost:3000/api/admin/sources/validate', {
      method: 'POST',
      body: JSON.stringify({ atsType: 'greenhouse', sourceIdentifier: 'stripe' }),
    });

    const res = await validateRoute(req);
    expect(res.status).toBe(403);
  });

  it('successfully detects ATS platform and returns 200 OK for authorized admin', async () => {
    vi.spyOn(AuthGuard, 'requireAdmin').mockResolvedValueOnce({
      user: { id: 'admin_123', email: 'admin@jobpulse.ai' },
      profile: { id: 'admin_123', role: 'admin' },
      supabase: {} as any,
    } as any);

    const req = new NextRequest('http://localhost:3000/api/admin/sources/detect', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://boards.greenhouse.io/stripe' }),
    });

    const res = await detectRoute(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.detected).toBe(true);
    expect(json.data.atsType).toBe('greenhouse');
    expect(json.data.boardIdentifier).toBe('stripe');
  });
});
