export interface DecodedCursor {
  version: 'v1';
  postedAt: string;
  id: string;
}

export function decodeCursor(cursorToken: string): { postedAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursorToken, 'base64').toString('utf-8');
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.v === 'v1' &&
      typeof parsed.postedAt === 'string' &&
      !isNaN(Date.parse(parsed.postedAt)) &&
      typeof parsed.id === 'string' &&
      /^[0-9a-f-]{36}$/i.test(parsed.id)
    ) {
      return { postedAt: parsed.postedAt, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

export function encodeCursor(postedAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ v: 'v1', postedAt, id })).toString('base64');
}
