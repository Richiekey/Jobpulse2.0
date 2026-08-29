import { describe, it, expect } from 'vitest';
import { ATSAdapterRegistry, UnsupportedATSError, GreenhouseAdapter, LeverAdapter, AshbyAdapter } from '../src/index.js';

describe('ATSAdapterRegistry (Batch A — S04/S05)', () => {
  it('resolves registered adapters cleanly by platform slug', () => {
    const gh = ATSAdapterRegistry.getAdapter('greenhouse');
    expect(gh).toBeInstanceOf(GreenhouseAdapter);
    expect(gh.platformSlug).toBe('greenhouse');

    const lever = ATSAdapterRegistry.getAdapter('lever');
    expect(lever).toBeInstanceOf(LeverAdapter);
    expect(lever.platformSlug).toBe('lever');

    const ashby = ATSAdapterRegistry.getAdapter('ashby');
    expect(ashby).toBeInstanceOf(AshbyAdapter);
    expect(ashby.platformSlug).toBe('ashby');
  });

  it('is case-insensitive and whitespace-tolerant on platform slug resolution', () => {
    const ghUpper = ATSAdapterRegistry.getAdapter('  GREENHOUSE  ');
    expect(ghUpper).toBeInstanceOf(GreenhouseAdapter);
  });

  it('throws UnsupportedATSError with zero silent fallback when requested adapter is unregistered', () => {
    expect(() => {
      ATSAdapterRegistry.getAdapter('workday_xml');
    }).toThrowError(UnsupportedATSError);

    try {
      ATSAdapterRegistry.getAdapter('fake_ats_unknown');
    } catch (err: any) {
      expect(err.message).toContain('Unsupported ATS platform or adapter not registered');
      expect(err.message).toContain('JobPulse does not permit silent fallback');
    }
  });

  it('detects Greenhouse URLs and board tokens', () => {
    const result = ATSAdapterRegistry.detectATS('https://boards.greenhouse.io/stripe/jobs/123456');
    expect(result).not.toBeNull();
    expect(result?.detected).toBe(true);
    expect(result?.atsType).toBe('greenhouse');
    expect(result?.boardIdentifier).toBe('stripe');
  });

  it('detects Lever URLs and board tokens', () => {
    const result = ATSAdapterRegistry.detectATS('https://jobs.lever.co/netflix/d32f14c2-901a-4d43-85cb');
    expect(result).not.toBeNull();
    expect(result?.detected).toBe(true);
    expect(result?.atsType).toBe('lever');
    expect(result?.boardIdentifier).toBe('netflix');
  });

  it('detects Ashby URLs and board tokens', () => {
    const result = ATSAdapterRegistry.detectATS('https://jobs.ashbyhq.com/openai/94318c64-42ea-4a41');
    expect(result).not.toBeNull();
    expect(result?.detected).toBe(true);
    expect(result?.atsType).toBe('ashby');
    expect(result?.boardIdentifier).toBe('openai');
  });

  it('detects embedded Greenhouse job boards from HTML content', () => {
    const htmlSnippet = '<div id="grnh_board"><script src="https://boards.greenhouse.io/embed/job_board.js?for=figma"></script></div>';
    const result = ATSAdapterRegistry.detectATS('https://figma.com/careers', htmlSnippet);
    expect(result).not.toBeNull();
    expect(result?.detected).toBe(true);
    expect(result?.atsType).toBe('greenhouse');
    expect(result?.boardIdentifier).toBe('figma');
  });

  it('returns null when URL does not match any registered ATS', () => {
    const result = ATSAdapterRegistry.detectATS('https://example.com/about-us');
    expect(result).toBeNull();
  });
});
