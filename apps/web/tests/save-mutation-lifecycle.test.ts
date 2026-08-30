import { describe, it, expect, vi } from 'vitest';

describe('Saved Jobs Mutation Lifecycle & Rollback Consistency (Batch J0 P1)', () => {
  it('successfully transitions state on valid save API confirmation', async () => {
    let savedJobIds = new Set<string>();
    const jobId = 'job-save-test-1';

    // Simulated optimistic save handler
    const handleSave = async (id: string, fetchFn: () => Promise<{ ok: boolean }>) => {
      const prev = new Set(savedJobIds);
      savedJobIds = new Set(prev).add(id);

      const res = await fetchFn();
      if (!res.ok) {
        // Rollback
        savedJobIds = prev;
        throw new Error('Save failed');
      }
    };

    // Succeeded
    const mockSuccessFetch = vi.fn().mockResolvedValue({ ok: true });
    await handleSave(jobId, mockSuccessFetch);
    expect(savedJobIds.has(jobId)).toBe(true);
  });

  it('rolls back to previous state when save API fails', async () => {
    let savedJobIds = new Set<string>(['job-existing']);
    const jobId = 'job-fail-test';

    const handleSave = async (id: string, fetchFn: () => Promise<{ ok: boolean }>) => {
      const prev = new Set(savedJobIds);
      savedJobIds = new Set(prev).add(id);

      try {
        const res = await fetchFn();
        if (!res.ok) {
          savedJobIds = prev;
          throw new Error('Save failed');
        }
      } catch (err) {
        savedJobIds = prev;
        throw err;
      }
    };

    // Failed
    const mockFailFetch = vi.fn().mockResolvedValue({ ok: false });
    await expect(handleSave(jobId, mockFailFetch)).rejects.toThrow('Save failed');
    expect(savedJobIds.has(jobId)).toBe(false);
    expect(savedJobIds.has('job-existing')).toBe(true);
  });

  it('prevents concurrent duplicate submissions while save request is in flight', async () => {
    const pendingIds = new Set<string>();
    const mockFetch = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 50))
    );

    const handleToggle = async (jobId: string) => {
      if (pendingIds.has(jobId)) {
        return 'blocked';
      }
      pendingIds.add(jobId);
      try {
        await mockFetch();
        return 'saved';
      } finally {
        pendingIds.delete(jobId);
      }
    };

    const promise1 = handleToggle('job-race-1');
    const promise2 = handleToggle('job-race-1'); // Duplicate concurrent click

    const [res1, res2] = await Promise.all([promise1, promise2]);
    expect(res1).toBe('saved');
    expect(res2).toBe('blocked');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
