import type { ATSDetectionResult } from '@jobpulse/domain';
import { CompanySourceNormalizer } from '@jobpulse/domain';
import { ATSAdapterRegistry } from '../registry.js';

export class ATSDetector {
  /**
   * Evaluates a URL and optional HTML content to detect which ATS platform hosts the job board.
   * Runs all registered adapters and catalog matchers, resolving competing matches deterministically
   * based on confidence score, implementation availability, and deterministic tie-breaking.
   */
  public static detect(rawUrl: string, html?: string): ATSDetectionResult {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return {
        detected: false,
        atsType: null,
        boardIdentifier: null,
        confidence: 0,
        sourceUrl: '',
      };
    }

    const cleanUrl = CompanySourceNormalizer.normalizeSourceUrl(rawUrl) || rawUrl.trim();
    const candidates: ATSDetectionResult[] = [];

    // 1. Run all registered ATS adapters
    const adapters = ATSAdapterRegistry.getAllAdapters();
    for (const adapter of adapters) {
      const result = adapter.detect(cleanUrl, html);
      if (result.detected && result.boardIdentifier) {
        candidates.push({
          detected: true,
          atsType: result.atsType,
          boardIdentifier: CompanySourceNormalizer.normalizeIdentifier(result.boardIdentifier),
          confidence: result.confidence,
          sourceUrl: cleanUrl,
        });
      }
    }

    // 2. Known but not yet implemented ATS platforms (e.g. Workday, SmartRecruiters)
    try {
      const parsed = new URL(cleanUrl);
      const hostname = parsed.hostname.toLowerCase();

      // Workday detection pattern
      if (hostname.includes('.myworkdayjobs.com')) {
        const subdomain = hostname.split('.myworkdayjobs.com')[0];
        if (subdomain) {
          candidates.push({
            detected: true,
            atsType: 'workday',
            boardIdentifier: subdomain.toLowerCase(),
            confidence: 0.95,
            sourceUrl: cleanUrl,
          });
        }
      }

      // SmartRecruiters detection pattern
      if (hostname === 'jobs.smartrecruiters.com') {
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length > 0 && parts[0]) {
          candidates.push({
            detected: true,
            atsType: 'smartrecruiters',
            boardIdentifier: parts[0].toLowerCase(),
            confidence: 0.95,
            sourceUrl: cleanUrl,
          });
        }
      }
    } catch {
      // Invalid URL syntax
    }

    // 3. Fallback: Check HTML for embedded links to external ATSs if HTML was supplied
    if (html) {
      // Look for greenhouse links
      const ghLinkMatch = html.match(/https?:\/\/boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i);
      if (ghLinkMatch && ghLinkMatch[1] && ghLinkMatch[1].toLowerCase() !== 'embed') {
        candidates.push({
          detected: true,
          atsType: 'greenhouse',
          boardIdentifier: ghLinkMatch[1].toLowerCase(),
          confidence: 0.65,
          sourceUrl: cleanUrl,
        });
      }

      // Look for lever links
      const leverLinkMatch = html.match(/https?:\/\/jobs\.lever\.co\/([a-zA-Z0-9_-]+)/i);
      if (leverLinkMatch && leverLinkMatch[1]) {
        candidates.push({
          detected: true,
          atsType: 'lever',
          boardIdentifier: leverLinkMatch[1].toLowerCase(),
          confidence: 0.65,
          sourceUrl: cleanUrl,
        });
      }

      // Look for ashby links
      const ashbyLinkMatch = html.match(/https?:\/\/jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/i);
      if (ashbyLinkMatch && ashbyLinkMatch[1]) {
        candidates.push({
          detected: true,
          atsType: 'ashby',
          boardIdentifier: ashbyLinkMatch[1].toLowerCase(),
          confidence: 0.65,
          sourceUrl: cleanUrl,
        });
      }
    }

    if (candidates.length === 0) {
      return {
        detected: false,
        atsType: null,
        boardIdentifier: null,
        confidence: 0,
        sourceUrl: cleanUrl,
      };
    }

    // 4. Deterministic Resolution:
    // Criterion 1: Highest confidence score
    // Criterion 2: Implemented adapter preference
    // Criterion 3: Deterministic alphabetical slug tie-breaker
    candidates.sort((a, b) => {
      if (Math.abs(b.confidence - a.confidence) > 0.001) {
        return b.confidence - a.confidence;
      }
      const aImplemented = a.atsType ? ATSAdapterRegistry.hasAdapter(a.atsType) : false;
      const bImplemented = b.atsType ? ATSAdapterRegistry.hasAdapter(b.atsType) : false;
      if (aImplemented !== bImplemented) {
        return bImplemented ? 1 : -1;
      }
      return (a.atsType || '').localeCompare(b.atsType || '');
    });

    return candidates[0]!;
  }
}
