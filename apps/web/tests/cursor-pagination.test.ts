import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from '../lib/cursor';

describe('Keyset / Cursor Pagination Stability (M10)', () => {
  it('correctly encodes and decodes versioned cursor tokens', () => {
    const postedAt = '2026-08-29T08:00:00.000Z';
    const id = '11111111-2222-3333-4444-555555555555';

    const token = encodeCursor(postedAt, id);
    const decoded = decodeCursor(token);

    expect(decoded).not.toBeNull();
    expect(decoded?.postedAt).toBe(postedAt);
    expect(decoded?.id).toBe(id);
  });

  it('handles identical timestamps across different record IDs consistently', () => {
    const postedAt = '2026-08-29T12:00:00.000Z';
    const idA = '00000000-0000-0000-0000-000000000001';
    const idB = '00000000-0000-0000-0000-000000000002';

    const tokenA = encodeCursor(postedAt, idA);
    const tokenB = encodeCursor(postedAt, idB);

    expect(tokenA).not.toBe(tokenB);

    const decodedA = decodeCursor(tokenA);
    const decodedB = decodeCursor(tokenB);

    expect(decodedA?.id).toBe(idA);
    expect(decodedB?.id).toBe(idB);
  });

  it('rejects tampered or malformed cursor tokens safely', () => {
    expect(decodeCursor('invalid-base64-payload!')).toBeNull();
    expect(decodeCursor(Buffer.from('{"v":"v1","postedAt":"not-a-date","id":"uuid"}').toString('base64'))).toBeNull();
    expect(decodeCursor(Buffer.from('{"v":"v1","postedAt":"2026-08-29T08:00:00Z","id":"not-a-uuid"}').toString('base64'))).toBeNull();
    expect(decodeCursor(Buffer.from('{"v":"v2"}').toString('base64'))).toBeNull();
  });
});
