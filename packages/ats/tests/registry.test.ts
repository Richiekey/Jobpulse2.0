import { describe, it, expect } from 'vitest';
import {
  ATSAdapterRegistry,
  UnsupportedATSError,
  UnimplementedATSError,
  UnknownATSError,
  GreenhouseAdapter,
  LeverAdapter,
  AshbyAdapter,
  JobrightAdapter,
} from '../src/index.js';

describe('ATSAdapterRegistry Comprehensive Verification (Finding 5)', () => {
  it('resolves all implemented ATS adapters cleanly by platform slug', () => {
    const gh = ATSAdapterRegistry.getAdapter('greenhouse');
    expect(gh).toBeInstanceOf(GreenhouseAdapter);
    expect(gh.platformSlug).toBe('greenhouse');

    const lever = ATSAdapterRegistry.getAdapter('lever');
    expect(lever).toBeInstanceOf(LeverAdapter);
    expect(lever.platformSlug).toBe('lever');

    const ashby = ATSAdapterRegistry.getAdapter('ashby');
    expect(ashby).toBeInstanceOf(AshbyAdapter);
    expect(ashby.platformSlug).toBe('ashby');

    const jobright = ATSAdapterRegistry.getAdapter('jobright');
    expect(jobright).toBeInstanceOf(JobrightAdapter);
    expect(jobright.platformSlug).toBe('jobright');
  });

  it('is strictly case-insensitive and whitespace-tolerant on platform slug resolution', () => {
    expect(ATSAdapterRegistry.getAdapter('  GREENHOUSE  ')).toBeInstanceOf(GreenhouseAdapter);
    expect(ATSAdapterRegistry.getAdapter('  LeVeR  ')).toBeInstanceOf(LeverAdapter);
    expect(ATSAdapterRegistry.getAdapter('  ashby  ')).toBeInstanceOf(AshbyAdapter);
    expect(ATSAdapterRegistry.getAdapter('  JOBRIGHT  ')).toBeInstanceOf(JobrightAdapter);
  });

  it('distinguishes known-but-unimplemented ATS platforms (e.g. Workable, BambooHR) from unknown platforms', () => {
    // Workable is in the catalog but not yet implemented
    expect(ATSAdapterRegistry.isKnownPlatform('workable')).toBe(true);
    expect(ATSAdapterRegistry.hasAdapter('workable')).toBe(false);
    expect(() => {
      ATSAdapterRegistry.getAdapter('workable');
    }).toThrowError(UnimplementedATSError);

    // Completely unknown ATS
    expect(ATSAdapterRegistry.isKnownPlatform('non_existent_ats_999')).toBe(false);
    expect(ATSAdapterRegistry.hasAdapter('non_existent_ats_999')).toBe(false);
    expect(() => {
      ATSAdapterRegistry.getAdapter('non_existent_ats_999');
    }).toThrowError(UnknownATSError);

    // Both inherit from UnsupportedATSError to prevent silent fallback
    expect(() => ATSAdapterRegistry.getAdapter('workable')).toThrowError(UnsupportedATSError);
    expect(() => ATSAdapterRegistry.getAdapter('non_existent_ats_999')).toThrowError(UnsupportedATSError);
  });

  it('provides platform definition metadata via getDefinition and getAllDefinitions', () => {
    const ghDef = ATSAdapterRegistry.getDefinition('greenhouse');
    expect(ghDef).not.toBeNull();
    expect(ghDef?.name).toBe('Greenhouse');
    expect(ghDef?.isImplemented).toBe(true);
    expect(ghDef?.capabilities.hasPublicApi).toBe(true);

    const workdayDef = ATSAdapterRegistry.getDefinition('workday');
    expect(workdayDef).not.toBeNull();
    expect(workdayDef?.name).toBe('Workday');
    expect(workdayDef?.isImplemented).toBe(true);

    const srDef = ATSAdapterRegistry.getDefinition('smartrecruiters');
    expect(srDef).not.toBeNull();
    expect(srDef?.name).toBe('SmartRecruiters');
    expect(srDef?.isImplemented).toBe(true);

    const icimsDef = ATSAdapterRegistry.getDefinition('icims');
    expect(icimsDef).not.toBeNull();
    expect(icimsDef?.name).toBe('iCIMS');
    expect(icimsDef?.isImplemented).toBe(true);

    const sfDef = ATSAdapterRegistry.getDefinition('successfactors');
    expect(sfDef).not.toBeNull();
    expect(sfDef?.name).toBe('SAP SuccessFactors');
    expect(sfDef?.isImplemented).toBe(true);

    const oracleDef = ATSAdapterRegistry.getDefinition('oracle');
    expect(oracleDef).not.toBeNull();
    expect(oracleDef?.name).toBe('Oracle Cloud HCM');
    expect(oracleDef?.isImplemented).toBe(true);

    const workableDef = ATSAdapterRegistry.getDefinition('workable');
    expect(workableDef).not.toBeNull();
    expect(workableDef?.name).toBe('Workable');
    expect(workableDef?.isImplemented).toBe(false);

    const allDefs = ATSAdapterRegistry.getAllDefinitions();
    expect(allDefs.length).toBeGreaterThanOrEqual(8);
    expect(allDefs.some((d) => d.slug === 'greenhouse')).toBe(true);
    expect(allDefs.some((d) => d.slug === 'workday')).toBe(true);
    expect(allDefs.some((d) => d.slug === 'smartrecruiters')).toBe(true);
    expect(allDefs.some((d) => d.slug === 'icims')).toBe(true);
    expect(allDefs.some((d) => d.slug === 'successfactors')).toBe(true);
    expect(allDefs.some((d) => d.slug === 'oracle')).toBe(true);
    expect(allDefs.some((d) => d.slug === 'workable')).toBe(true);
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

  it('detects Jobright URLs and board tokens', () => {
    const result = ATSAdapterRegistry.detectATS('https://jobright.ai/jobs/jr_123456');
    expect(result).not.toBeNull();
    expect(result?.detected).toBe(true);
    expect(result?.atsType).toBe('jobright');
    expect(result?.boardIdentifier).toBe('jr_123456');
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
