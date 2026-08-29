import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from '../lib/cursor';

interface MockJob {
  id: string;
  posted_at: string;
  display_title: string;
}

describe('Keyset Cursor Pagination Complete Dataset Simulation (V10)', () => {
  // Generate 50 items with identical timestamps across groups
  const mockDataset: MockJob[] = [];
  const baseTimestamp = '2026-08-29T12:00:00.000Z';

  for (let i = 50; i >= 1; i--) {
    // 5 groups of 10 items sharing the exact same timestamp
    const group = Math.floor((i - 1) / 10);
    const ts = new Date(Date.parse(baseTimestamp) + group * 60000).toISOString();
    const id = `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
    mockDataset.push({
      id,
      posted_at: ts,
      display_title: `Job Requisition #${i}`,
    });
  }

  // Sorted strictly by posted_at DESC, id DESC
  mockDataset.sort((a, b) => {
    const timeCmp = b.posted_at.localeCompare(a.posted_at);
    if (timeCmp !== 0) return timeCmp;
    return b.id.localeCompare(a.id);
  });

  function paginate(limit: number, cursor?: string): { items: MockJob[]; nextCursor: string | null; hasMore: boolean } {
    let filtered = mockDataset;

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) throw new Error('Invalid cursor');

      filtered = mockDataset.filter((item) => {
        if (item.posted_at < decoded.postedAt) return true;
        if (item.posted_at === decoded.postedAt && item.id < decoded.id) return true;
        return false;
      });
    }

    const items = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]!.posted_at, items[items.length - 1]!.id) : null;

    return { items, nextCursor, hasMore };
  }

  it('paginates entire dataset with zero duplicate records and zero skipped records across identical timestamps', () => {
    const pageSize = 8;
    const collected: MockJob[] = [];
    let currentCursor: string | undefined = undefined;
    let pageCount = 0;

    while (true) {
      const res = paginate(pageSize, currentCursor);
      collected.push(...res.items);
      pageCount++;

      if (!res.hasMore || !res.nextCursor) {
        break;
      }
      currentCursor = res.nextCursor;

      // Prevent infinite loops
      if (pageCount > 20) throw new Error('Infinite pagination loop detected!');
    }

    expect(collected.length).toBe(50);

    // Verify all 50 IDs are present and unique
    const uniqueIds = new Set(collected.map((c) => c.id));
    expect(uniqueIds.size).toBe(50);

    // Verify deterministic ordering
    for (let i = 0; i < collected.length; i++) {
      expect(collected[i]!.id).toBe(mockDataset[i]!.id);
    }
  });
});
