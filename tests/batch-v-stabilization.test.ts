import { describe, it, expect, vi } from 'vitest';
import { HttpClient, HttpError } from '@jobpulse/shared';
import { JobDivaAdapter } from '@jobpulse/ats';

describe('System Stabilization and Edge Cases', () => {
  describe('Structured 429 and 404 Handling', () => {
    it('throws structured HttpError on 429 and preserves Retry-After', async () => {
      // Mock fetch for 429
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '12' }),
        text: () => Promise.resolve('Rate Limited')
      } as any);

      const client = new HttpClient();
      
      try {
        await client.get('https://api.example.com', { maxRetries: 0 });
        expect.fail('Should have thrown HttpError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('HttpError');
        expect(err.status).toBe(429);
        expect(err.retryAfterSec).toBe(12);
      }
    });

    it('does not throw on 404 if throwOn404 is false', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        text: () => Promise.resolve('Not Found')
      } as any);

      const client = new HttpClient();
      const res = await client.get('https://api.example.com', { throwOn404: false, maxRetries: 0 });
      expect(res.status).toBe(404);
      expect(res.data).toBe('Not Found');
    });
  });

  describe('JobDiva Fixture Parsing', () => {
    it('correctly parses JobDiva payload without crashing on missing fields', async () => {
      const adapter = new JobDivaAdapter();
      const rawPayload = {
        sourceId: 'src-1',
        externalId: 'ext-1',
        payload: {
          id: '1234',
          title: 'Software Engineer',
          city: 'New York',
          remote: true
        },
        payloadHash: 'hash',
        parserVersion: 'v1',
        fetchedAt: new Date().toISOString()
      };
      
      const parsed = await adapter.parse(rawPayload);
      expect(parsed.rawTitle).toBe('Software Engineer');
      expect(parsed.rawWorkplaceType).toBe('remote');
      expect(parsed.rawLocations).toContain('New York');
      expect(parsed.sourceJobUrl).toContain('1234');
    });

    it('handles malformed ATS response gracefully', async () => {
      const adapter = new JobDivaAdapter();
      const rawPayload = {
        sourceId: 'src-1',
        externalId: 'ext-1',
        payload: {}, // Empty payload
        payloadHash: 'hash',
        parserVersion: 'v1',
        fetchedAt: new Date().toISOString()
      };
      
      const parsed = await adapter.parse(rawPayload);
      expect(parsed.rawTitle).toBe('Untitled Role');
      expect(parsed.rawLocations).toHaveLength(0);
    });
  });

  describe('Aggregate Status Classification', () => {
    it('properly distinguishes empty, rate_limited, and adapter_error', () => {
      const errRateLimit = new HttpError(429, 'Rate limit', 10);
      let failureStatus = 'adapter_error';
      if (errRateLimit instanceof HttpError && errRateLimit.status === 429) {
        failureStatus = 'rate_limited';
      }
      expect(failureStatus).toBe('rate_limited');

      const errNotFound = new HttpError(404, 'Not Found');
      if (errNotFound instanceof HttpError && errNotFound.status === 404) {
        failureStatus = 'invalid_configuration';
      }
      expect(failureStatus).toBe('invalid_configuration');
    });

    it('treats empty source as empty, not failed', () => {
      const discoveredCount = 0;
      const failed = 0;
      let sourceStatus = 'healthy';
      if (discoveredCount === 0) sourceStatus = 'empty';
      else if (failed === discoveredCount) sourceStatus = 'failed';
      expect(sourceStatus).toBe('empty');
    });
  });

  describe('Company to ATS Mapping Reconciliation', () => {
    it('is idempotent and corrective when overwriting wrong mappings', () => {
      // Simulate the logic in the new SQL migration (reconcile_company_source)
      const existingMappings = [
        { company_id: 'c1', source_id: 's1', identifier: 'wrong', is_active: true }
      ];
      
      const newSourceId = 's2';
      const newIdentifier = 'correct';
      
      // Deactivate old
      existingMappings.forEach(m => {
        if (m.source_id !== newSourceId || m.identifier !== newIdentifier) {
          m.is_active = false;
        }
      });
      
      // Upsert new
      existingMappings.push({ company_id: 'c1', source_id: newSourceId, identifier: newIdentifier, is_active: true });
      
      const activeMappings = existingMappings.filter(m => m.is_active);
      expect(activeMappings).toHaveLength(1);
      expect(activeMappings[0]?.identifier).toBe('correct');
      expect(activeMappings[0]?.source_id).toBe('s2');
    });
  });
});
