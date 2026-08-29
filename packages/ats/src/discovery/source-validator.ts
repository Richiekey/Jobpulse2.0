import type { CompanySourceConfig, SourceValidationResult } from '@jobpulse/domain';
import { ATSAdapterRegistry, UnimplementedATSError, UnknownATSError } from '../registry.js';

export class SourceValidator {
  /**
   * Performs non-mutating pre-flight validation on a candidate company source configuration.
   * Tests connectivity, board identifier presence, and job discovery capabilities.
   */
  public static async validate(
    config: CompanySourceConfig,
    adapterName?: string
  ): Promise<SourceValidationResult> {
    const start = Date.now();
    const targetAts = adapterName || config.adapterConfig?.atsType as string || '';

    try {
      const adapter = ATSAdapterRegistry.getAdapter(targetAts);
      return await adapter.validateSource(config);
    } catch (err: any) {
      const durationMs = Date.now() - start;

      if (err instanceof UnimplementedATSError) {
        return {
          isValid: false,
          atsType: targetAts,
          boardIdentifier: config.sourceIdentifier,
          jobsDiscoveredCount: 0,
          sampleJobTitles: [],
          error: `ATS platform "${targetAts}" is recognized in catalog but adapter implementation is pending (S05).`,
          durationMs,
        };
      }

      if (err instanceof UnknownATSError) {
        return {
          isValid: false,
          atsType: targetAts,
          boardIdentifier: config.sourceIdentifier,
          jobsDiscoveredCount: 0,
          sampleJobTitles: [],
          error: `Unknown or unsupported ATS platform: "${targetAts}".`,
          durationMs,
        };
      }

      return {
        isValid: false,
        atsType: targetAts,
        boardIdentifier: config.sourceIdentifier,
        jobsDiscoveredCount: 0,
        sampleJobTitles: [],
        error: err.message || 'Pre-flight validation failed unexpectedly.',
        durationMs,
      };
    }
  }
}
