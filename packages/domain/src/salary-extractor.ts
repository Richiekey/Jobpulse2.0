/**
 * JobPulse 2.0 — Salary & Compensation Extractor & Normalizer
 * Extracts and standardizes salary ranges, currency, pay periods, and equity disclosures.
 */

export interface ExtractedSalary {
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  interval: 'yearly' | 'monthly' | 'hourly' | 'daily';
  annualizedMin: number | null;
  annualizedMax: number | null;
  hasSalary: boolean;
  equityMentioned: boolean;
  rawString?: string;
}

export class SalaryExtractor {
  // Regex pattern matching currency symbols and codes
  private static readonly CURRENCY_MAP: Record<string, string> = {
    '$': 'USD',
    'usd': 'USD',
    'us$': 'USD',
    '€': 'EUR',
    'eur': 'EUR',
    '£': 'GBP',
    'gbp': 'GBP',
    'c$': 'CAD',
    'cad': 'CAD',
    'a$': 'AUD',
    'aud': 'AUD',
    'chf': 'CHF',
  };

  /**
   * Annualizes a given compensation amount based on interval.
   */
  public static annualize(amount: number, interval: 'yearly' | 'monthly' | 'hourly' | 'daily'): number {
    switch (interval) {
      case 'hourly':
        return Math.round(amount * 2080); // 40h/week * 52 weeks
      case 'daily':
        return Math.round(amount * 260); // 5 days/week * 52 weeks
      case 'monthly':
        return Math.round(amount * 12);
      case 'yearly':
      default:
        return Math.round(amount);
    }
  }

  /**
   * Detects whether equity, stock options, or RSUs are mentioned in the job description or perks.
   */
  public static hasEquityMention(text: string): boolean {
    if (!text) return false;
    if (/\b(no|without|zero)\s+(equity|stock|options?|rsus?)\b/i.test(text)) {
      return false;
    }
    const equityRegex = /\b(equity|stock\s*options?|rsus?|restricted\s*stock|shares|token\s*grant|profit\s*sharing)\b/i;
    return equityRegex.test(text);
  }

  /**
   * Normalizes structured or parsed salary inputs into a validated ExtractedSalary object.
   */
  public static normalize(
    min?: number | null,
    max?: number | null,
    currency = 'USD',
    interval: 'yearly' | 'monthly' | 'hourly' | 'daily' = 'yearly',
    textForEquity = ''
  ): ExtractedSalary {
    let cleanMin = typeof min === 'number' && !isNaN(min) && min > 0 ? min : null;
    let cleanMax = typeof max === 'number' && !isNaN(max) && max > 0 ? max : null;

    if (cleanMin !== null && cleanMax !== null && cleanMin > cleanMax) {
      // Swap if min > max
      const tmp = cleanMin;
      cleanMin = cleanMax;
      cleanMax = tmp;
    }

    const hasSalary = cleanMin !== null || cleanMax !== null;
    const annualizedMin = cleanMin !== null ? this.annualize(cleanMin, interval) : null;
    const annualizedMax = cleanMax !== null ? this.annualize(cleanMax, interval) : null;
    const equityMentioned = this.hasEquityMention(textForEquity);

    return {
      salaryMin: cleanMin,
      salaryMax: cleanMax,
      currency: currency.toUpperCase(),
      interval,
      annualizedMin,
      annualizedMax,
      hasSalary,
      equityMentioned,
    };
  }

  /**
   * Extracts salary data from unstructured job text, titles, or description blocks.
   */
  public static extractFromText(text: string): ExtractedSalary {
    if (!text || typeof text !== 'string') {
      return this.normalize(null, null, 'USD', 'yearly', '');
    }

    const equityMentioned = this.hasEquityMention(text);

    // 1. Regex pattern for salary ranges:
    // e.g. "$140,000 - $180,000 / year", "£70k - £90k", "$60 - $80 / hr", "100k - 140k USD"
    const salaryRangeRegex = /(?:(\$|€|£|USD|EUR|GBP|CAD|AUD)\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3})\s*(k|K)?\s*(?:-|–|—|to)\s*(?:(\$|€|£|USD|EUR|GBP|CAD|AUD)\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3})\s*(k|K)?\s*(?:(USD|EUR|GBP|CAD|AUD))?\s*(?:\/|\s+per\s+|\s+a\s+|\s+an\s+)?(yr|year|annually|yearly|mo|month|monthly|hr|hour|hourly|day|daily)?\b/i;

    // 2. Single salary pattern:
    // e.g. "$150,000 / year", "$75/hr", "£90k annually"
    const singleSalaryRegex = /(?:(\$|€|£|USD|EUR|GBP|CAD|AUD)\s*)(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3})\s*(k|K)?\s*(?:(USD|EUR|GBP|CAD|AUD))?\s*(?:\/|\s+per\s+|\s+a\s+|\s+an\s+)?(yr|year|annually|yearly|mo|month|monthly|hr|hour|hourly|day|daily)?\b/i;

    const rangeMatch = text.match(salaryRangeRegex);
    if (rangeMatch && rangeMatch[2] && rangeMatch[5]) {
      const [
        fullMatch,
        prefixCurr1,
        numStr1,
        k1,
        prefixCurr2,
        numStr2,
        k2,
        suffixCurr,
        intervalStr,
      ] = rangeMatch;

      const currencyKey = (prefixCurr1 || prefixCurr2 || suffixCurr || '$').toLowerCase();
      const currency = this.CURRENCY_MAP[currencyKey] || 'USD';

      let min = parseFloat((numStr1 || '0').replace(/,/g, ''));
      let max = parseFloat((numStr2 || '0').replace(/,/g, ''));

      const isK = Boolean(k1 || k2 || (fullMatch && /k\b/i.test(fullMatch)));
      if (isK) {
        if (min < 1000) min *= 1000;
        if (max < 1000) max *= 1000;
      }

      let interval: 'yearly' | 'monthly' | 'hourly' | 'daily' = 'yearly';
      if (intervalStr) {
        if (/hr|hour|hourly/i.test(intervalStr)) interval = 'hourly';
        else if (/mo|month|monthly/i.test(intervalStr)) interval = 'monthly';
        else if (/day|daily/i.test(intervalStr)) interval = 'daily';
      } else if (max < 300 && !isK) {
        interval = 'hourly';
      }

      const result = this.normalize(min, max, currency, interval, text);
      result.rawString = fullMatch?.trim();
      return result;
    }

    const singleMatch = text.match(singleSalaryRegex);
    if (singleMatch && singleMatch[2]) {
      const [fullMatch, prefixCurr, numStr, k, suffixCurr, intervalStr] = singleMatch;
      const currencyKey = (prefixCurr || suffixCurr || '$').toLowerCase();
      const currency = this.CURRENCY_MAP[currencyKey] || 'USD';

      let amount = parseFloat((numStr || '0').replace(/,/g, ''));

      const isK = Boolean(k || (fullMatch && /k\b/i.test(fullMatch)));
      if (isK) {
        if (amount < 1000) amount *= 1000;
      }

      let interval: 'yearly' | 'monthly' | 'hourly' | 'daily' = 'yearly';
      if (intervalStr) {
        if (/hr|hour|hourly/i.test(intervalStr)) interval = 'hourly';
        else if (/mo|month|monthly/i.test(intervalStr)) interval = 'monthly';
        else if (/day|daily/i.test(intervalStr)) interval = 'daily';
      } else if (amount < 300 && !isK) {
        interval = 'hourly';
      }

      const result = this.normalize(amount, amount, currency, interval, text);
      result.rawString = fullMatch?.trim();
      return result;
    }

    return {
      salaryMin: null,
      salaryMax: null,
      currency: 'USD',
      interval: 'yearly',
      annualizedMin: null,
      annualizedMax: null,
      hasSalary: false,
      equityMentioned,
    };
  }
}
