import { describe, it, expect } from 'vitest';
import { ScraperRunner } from '../src/engine/runner.ts';

describe('ScraperRunner', () => {
  it('instantiates cleanly with custom concurrency', () => {
    const runner = new ScraperRunner({ concurrency: 3 });
    expect(runner).toBeInstanceOf(ScraperRunner);
  });
});
