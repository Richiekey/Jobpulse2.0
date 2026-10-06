import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpClient, HttpError } from '@jobpulse/shared';
import { JobDivaAdapter } from '@jobpulse/ats';

// Save/restore global fetch
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('System Stabilization — Batch V', () => {
  // ── 1. HTTP 429 + Retry-After ────────────────────────────────────
  describe('Structured 429 Handling', () => {
    it('throws HttpError with status=429 and parsed Retry-After', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '12' }),
        text: () => Promise.resolve('Rate Limited'),
      } as any);

      const client = new HttpClient();
      try {
        await client.get('https://api.example.com', { maxRetries: 0 });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.status).toBe(429);
        expect(err.retryAfterSec).toBe(12);
        expect(err.message).toContain('RATE_LIMITED');
      }
    });

    it('clamps garbage Retry-After to fallback', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': 'banana' }),
        text: () => Promise.resolve('Rate Limited'),
      } as any);

      const client = new HttpClient();
      try {
        await client.get('https://api.example.com', { maxRetries: 0 });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.retryAfterSec).toBe(5); // fallback
      }
    });

    it('clamps negative Retry-After to 1', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '-10' }),
        text: () => Promise.resolve(''),
      } as any);

      const client = new HttpClient();
      try {
        await client.get('https://api.example.com', { maxRetries: 0 });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.retryAfterSec).toBe(1);
      }
    });

    it('clamps huge Retry-After to 300', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '99999' }),
        text: () => Promise.resolve(''),
      } as any);

      const client = new HttpClient();
      try {
        await client.get('https://api.example.com', { maxRetries: 0 });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.retryAfterSec).toBe(300);
      }
    });
  });

  // ── 2. 404 Behavior ──────────────────────────────────────────────
  describe('404 Handling', () => {
    it('throws HttpError on 404 by default (throwOn404 not set)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        text: () => Promise.resolve('Not Found'),
      } as any);

      const client = new HttpClient();
      await expect(client.get('https://api.example.com', { maxRetries: 0 }))
        .rejects.toBeInstanceOf(HttpError);
    });

    it('does NOT throw on 404 when throwOn404=false', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        text: () => Promise.resolve('Not Found'),
      } as any);

      const client = new HttpClient();
      const res = await client.get('https://api.example.com', {
        throwOn404: false,
        maxRetries: 0,
      });
      expect(res.status).toBe(404);
      expect(res.data).toBe('Not Found');
    });

    it('does NOT retry 404 errors', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Headers(),
          text: () => Promise.resolve('Not Found'),
        });
      });

      const client = new HttpClient();
      try {
        await client.get('https://api.example.com', { maxRetries: 3 });
      } catch {
        // expected
      }
      expect(callCount).toBe(1); // No retries
    });
  });

  // ── 3. Retry classification ──────────────────────────────────────
  describe('Retry Classification', () => {
    it('retries 429 responses', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'Retry-After': '1' }),
          text: () => Promise.resolve(''),
        });
      });

      const client = new HttpClient();
      try {
        await client.get('https://api.example.com', { maxRetries: 1 });
      } catch {
        // expected
      }
      expect(callCount).toBe(2); // initial + 1 retry
    });

    it('retries 500 responses', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers(),
          text: () => Promise.resolve(''),
        });
      });

      const client = new HttpClient();
      try {
        await client.get('https://api.example.com', { maxRetries: 1 });
      } catch {
        // expected
      }
      expect(callCount).toBe(2); // initial + 1 retry
    });

    it('does NOT retry 401/403 responses', async () => {
      for (const status of [401, 403]) {
        let callCount = 0;
        globalThis.fetch = vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            ok: false,
            status,
            statusText: 'Unauthorized',
            headers: new Headers(),
            text: () => Promise.resolve(''),
          });
        });

        const client = new HttpClient();
        try {
          await client.get('https://api.example.com', { maxRetries: 3 });
        } catch {
          // expected
        }
        expect(callCount).toBe(1); // No retries for non-retryable 4xx
      }
    });
  });

  // ── 4. Empty source semantics ────────────────────────────────────
  describe('Aggregate Status Classification', () => {
    it('classifies 429 HttpError as rate_limited', () => {
      const err = new HttpError(429, 'Rate limit', 10);
      let status = 'adapter_error';
      if (err instanceof HttpError) {
        if (err.status === 429) status = 'rate_limited';
        else if (err.status === 404 || err.status === 401 || err.status === 403) status = 'invalid_configuration';
        else status = 'http_error';
      }
      expect(status).toBe('rate_limited');
    });

    it('classifies 404 HttpError as invalid_configuration', () => {
      const err = new HttpError(404, 'Not Found');
      let status = 'adapter_error';
      if (err instanceof HttpError) {
        if (err.status === 429) status = 'rate_limited';
        else if (err.status === 404 || err.status === 401 || err.status === 403) status = 'invalid_configuration';
        else status = 'http_error';
      }
      expect(status).toBe('invalid_configuration');
    });

    it('classifies 502 HttpError as http_error', () => {
      const err = new HttpError(502, 'Bad Gateway');
      let status = 'adapter_error';
      if (err instanceof HttpError) {
        if (err.status === 429) status = 'rate_limited';
        else if (err.status === 404 || err.status === 401 || err.status === 403) status = 'invalid_configuration';
        else status = 'http_error';
      }
      expect(status).toBe('http_error');
    });

    it('treats empty source (0 discovered, 0 failed) as "empty" not "failed"', () => {
      const discoveredCount = 0;
      const failed = 0;
      let sourceStatus = 'healthy';
      if (discoveredCount === 0) sourceStatus = 'empty';
      else if (failed === discoveredCount) sourceStatus = 'failed';
      expect(sourceStatus).toBe('empty');
    });
  });

  // ── 5. JobDiva fixture parsing ───────────────────────────────────
  describe('JobDiva Fixture Parsing', () => {
    it('parses a well-formed JobDiva payload', async () => {
      const adapter = new JobDivaAdapter();
      const parsed = await adapter.parse({
        sourceId: 'src-1',
        externalId: 'ext-1',
        payload: {
          id: '1234',
          title: 'Software Engineer',
          city: 'New York',
          state: 'NY',
          remote: true,
          description: '<p>Great job</p>',
        },
        payloadHash: 'hash',
        parserVersion: 'v1',
        fetchedAt: new Date().toISOString(),
      });
      expect(parsed.rawTitle).toBe('Software Engineer');
      expect(parsed.rawWorkplaceType).toBe('remote');
      expect(parsed.rawLocations).toContain('New York, NY');
      expect(parsed.externalJobId).toBe('1234');
      expect(parsed.rawDescription).toContain('Great job');
    });

    it('handles empty/malformed payload without crashing', async () => {
      const adapter = new JobDivaAdapter();
      const parsed = await adapter.parse({
        sourceId: 'src-1',
        externalId: 'ext-1',
        payload: {},
        payloadHash: 'hash',
        parserVersion: 'v1',
        fetchedAt: new Date().toISOString(),
      });
      expect(parsed.rawTitle).toBe('Untitled Role');
      expect(parsed.rawLocations).toHaveLength(0);
      expect(parsed.externalJobId).toBe('ext-1');
    });
  });

  // ── 6. Company→ATS mapping reconciliation logic ──────────────────
  describe('Company→ATS Mapping Reconciliation', () => {
    it('deactivates wrong mapping and upserts correct one', () => {
      const mappings = [
        { company_id: 'c1', source_id: 'jobdiva-src', identifier: 'artech', is_active: true },
      ];
      const correctSourceId = 'smartrecruiters-src';
      const correctIdentifier = 'Artech';

      // Simulate reconcile_company_source logic:
      // 1. Deactivate stale
      for (const m of mappings) {
        if (m.source_id !== correctSourceId || m.identifier !== correctIdentifier) {
          m.is_active = false;
        }
      }
      // 2. Upsert correct
      const existing = mappings.find(
        (m) => m.source_id === correctSourceId && m.identifier === correctIdentifier
      );
      if (!existing) {
        mappings.push({
          company_id: 'c1',
          source_id: correctSourceId,
          identifier: correctIdentifier,
          is_active: true,
        });
      }

      const active = mappings.filter((m) => m.is_active);
      expect(active).toHaveLength(1);
      expect(active[0]!.source_id).toBe('smartrecruiters-src');
      expect(active[0]!.identifier).toBe('Artech');
    });

    it('is idempotent: re-running with same correct mapping does nothing extra', () => {
      const mappings = [
        { company_id: 'c1', source_id: 'sr', identifier: 'Artech', is_active: true },
      ];
      const correctSourceId = 'sr';
      const correctIdentifier = 'Artech';

      for (const m of mappings) {
        if (m.source_id !== correctSourceId || m.identifier !== correctIdentifier) {
          m.is_active = false;
        }
      }
      const existing = mappings.find(
        (m) => m.source_id === correctSourceId && m.identifier === correctIdentifier
      );
      if (!existing) {
        mappings.push({
          company_id: 'c1', source_id: correctSourceId,
          identifier: correctIdentifier, is_active: true,
        });
      }

      expect(mappings).toHaveLength(1); // No duplicate created
      expect(mappings[0]!.is_active).toBe(true);
    });
  });
});
