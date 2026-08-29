import { describe, it, expect, vi } from 'vitest';

describe('Distributed Scrape Lease Locking & Recovery (M05)', () => {
  it('simulates atomic lease acquisition and contention', async () => {
    const lockTable = new Map<string, { holderId: string; expiresAt: number }>();

    const tryAcquireLock = (lockKey: string, holderId: string, ttlMs = 1000): boolean => {
      const now = Date.now();
      const existing = lockTable.get(lockKey);

      if (!existing || existing.expiresAt < now) {
        lockTable.set(lockKey, { holderId, expiresAt: now + ttlMs });
        return true;
      }
      return false;
    };

    const releaseLock = (lockKey: string, holderId: string): boolean => {
      const existing = lockTable.get(lockKey);
      if (existing && existing.holderId === holderId) {
        lockTable.delete(lockKey);
        return true;
      }
      return false;
    };

    // Worker 1 acquires lock
    expect(tryAcquireLock('global_lock', 'worker_1', 500)).toBe(true);

    // Worker 2 attempts while lock is active -> rejected
    expect(tryAcquireLock('global_lock', 'worker_2', 500)).toBe(false);

    // Worker 1 releases lock
    expect(releaseLock('global_lock', 'worker_1')).toBe(true);

    // Worker 2 acquires successfully
    expect(tryAcquireLock('global_lock', 'worker_2', 500)).toBe(true);
  });
});
