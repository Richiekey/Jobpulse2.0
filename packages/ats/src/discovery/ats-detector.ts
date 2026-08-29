import type { ATSDetectionResult } from '@jobpulse/domain';
import { CompanySourceNormalizer } from '@jobpulse/domain';
import { ATSAdapterRegistry } from '../registry.js';

export class ATSDetector {
  /**
   * Evaluates a URL and optional HTML content to detect which ATS platform hosts the job board.
   * Dispatches across all registered ATS adapters and falls back to structural patterns.
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

    // 1. Check all registered ATS adapters first
    const adapters = ATSAdapterRegistry.getAllAdapters();
    for (const adapter of adapters) {
      const result = adapter.detect(cleanUrl, html);
      if (result.detected && result.boardIdentifier) {
        return {
          detected: true,
          atsType: result.atsType,
          boardIdentifier: CompanySourceNormalizer.normalizeIdentifier(result.boardIdentifier),
          confidence: result.confidence,
          sourceUrl: cleanUrl,
        };
      }
    }

    // 2. Known but not yet fully implemented ATS platforms (e.g. Workday)
    try {
      const parsed = new URL(cleanUrl);
      const hostname = parsed.hostname.toLowerCase();

      // Workday detection pattern
      if (hostname.includes('.myworkdayjobs.com')) {
        const subdomain = hostname.split('.myworkdayjobs.com')[0];
        return {
          detected: true,
          atsType: 'workday',
          boardIdentifier: subdomain || null,
          confidence: 0.95,
          sourceUrl: cleanUrl,
        };
      }

      // SmartRecruiters detection pattern
      if (hostname === 'jobs.smartrecruiters.com') {
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length > 0 && parts[0]) {
          return {
            detected: true,
            atsType: 'smartrecruiters',
            boardIdentifier: parts[0].toLowerCase(),
            confidence: 0.95,
            sourceUrl: cleanUrl,
          };
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
        return {
          detected: true,
          atsType: 'greenhouse',
          boardIdentifier: ghLinkMatch[1].toLowerCase(),
          confidence: 0.65,
          sourceUrl: cleanUrl,
        };
      }

      // Look for lever links
      const leverLinkMatch = html.match(/https?:\/\/jobs\.lever\.co\/([a-zA-Z0-9_-]+)/i);
      if (leverLinkMatch && leverLinkMatch[1]) {
        return {
          detected: true,
          atsType: 'lever',
          boardIdentifier: leverLinkMatch[1].toLowerCase(),
          confidence: 0.65,
          sourceUrl: cleanUrl,
        };
      }

      // Look for ashby links
      const ashbyLinkMatch = html.match(/https?:\/\/jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/i);
      if (ashbyLinkMatch && ashbyLinkMatch[1]) {
        return {
          detected: true,
          atsType: 'ashby',
          boardIdentifier: ashbyLinkMatch[1].toLowerCase(),
          confidence: 0.65,
          sourceUrl: cleanUrl,
        };
      }
    }

    return {
      detected: false,
      atsType: null,
      boardIdentifier: null,
      confidence: 0,
      sourceUrl: cleanUrl,
    };
  }
}
