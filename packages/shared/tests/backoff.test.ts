import { describe, it, expect } from 'vitest';
import { calculateBackoffDelay, withRetry } from '../src/backoff.js';

describe('Backoff and Retry', () => {
  it('calculates bounded backoff delay with jitter', () => {
    const delay = calculateBackoffDelay(2, { baseDelayMs: 100, maxDelayMs: 1000, factor: 2, jitter: true });
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThanOrEqual(400);
  });

  it('calculates deterministic delay when jitter is false', () => {
    const delay = calculateBackoffDelay(3, { baseDelayMs: 100, factor: 2, jitter: false });
    expect(delay).toBe(800);
  });

  it('retries failing operation until success', async () => {
    let attempts = 0;
    const result = await withRetry(
      async (att) => {
        attempts++;
        if (att < 2) {
          throw new Error('Transient error');
        }
        return 'success';
      },
      { maxRetries: 3, baseDelayMs: 10 }
    );

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });
});
