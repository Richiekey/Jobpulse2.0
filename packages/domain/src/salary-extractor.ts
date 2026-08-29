/**
 * JobPulse 2.0 — Salary & Compensation Extractor, Normalizer & Formatter
 * Standardizes compensation ranges, currencies, pay intervals, annualization, and equity disclosures.
 */

export type SalaryInterval = 'yearly' | 'monthly' | 'weekly' | 'daily' | 'hourly';

export interface ExtractedSalary {
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  interval: SalaryInterval;
  annualizedMin: number | null;
  annualizedMax: number | null;
  hasSalary: boolean;
  equityMentioned: boolean;
  rawString?: string;
}

export interface FormatSalaryOptions {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  interval?: SalaryInterval | string | null;
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
   * Annualizes compensation amounts based on 5 explicit mathematical formulas:
   * 
   * 1. Hourly:  amount * 2,080
   *    Assumption: Standard full-time baseline (40 hours/week * 52 weeks/year = 2,080 hours)
   * 
   * 2. Daily:   amount * 260
   *    Assumption: Standard working year (5 working days/week * 52 weeks/year = 260 workdays)
   * 
   * 3. Weekly:  amount * 52
   *    Assumption: 52 standard calendar weeks per year
   * 
   * 4. Monthly: amount * 12
   *    Assumption: 12 standard calendar months per year
   * 
   * 5. Yearly:  amount * 1
   *    Assumption: 1:1 direct annualized compensation
   */
  public static annualize(amount: number, interval: SalaryInterval): number {
    switch (interval) {
      case 'hourly':
        return Math.round(amount * 2080);
      case 'daily':
        return Math.round(amount * 260);
      case 'weekly':
        return Math.round(amount * 52);
      case 'monthly':
        return Math.round(amount * 12);
      case 'yearly':
      default:
        return Math.round(amount);
    }
  }

  /**
   * Detects whether equity, stock options, or RSUs are mentioned in the job description or perks.
   * Explicitly ignores negation phrases such as "no equity" or "without stock options".
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
   * Never assumes missing currency is USD.
   */
  public static normalize(
    min?: number | null,
    max?: number | null,
    currency?: string | null,
    interval: SalaryInterval = 'yearly',
    textForEquity = ''
  ): ExtractedSalary {
    let cleanMin = typeof min === 'number' && !isNaN(min) && min >= 0 ? min : null;
    let cleanMax = typeof max === 'number' && !isNaN(max) && max >= 0 ? max : null;

    if (cleanMin !== null && cleanMax !== null && cleanMin > cleanMax) {
      // Swap if min > max to protect bounds
      const tmp = cleanMin;
      cleanMin = cleanMax;
      cleanMax = tmp;
    }

    const hasSalary = cleanMin !== null || cleanMax !== null;
    const annualizedMin = cleanMin !== null ? this.annualize(cleanMin, interval) : null;
    const annualizedMax = cleanMax !== null ? this.annualize(cleanMax, interval) : null;
    const equityMentioned = this.hasEquityMention(textForEquity);
    const cleanCurrency = currency && typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : null;

    return {
      salaryMin: cleanMin,
      salaryMax: cleanMax,
      currency: cleanCurrency,
      interval,
      annualizedMin,
      annualizedMax,
      hasSalary,
      equityMentioned,
    };
  }

  /**
   * Extracts salary data from unstructured job text, titles, or description blocks.
   * Does not silently default missing currency to USD.
   */
  public static extractFromText(text: string): ExtractedSalary {
    if (!text || typeof text !== 'string') {
      return this.normalize(null, null, null, 'yearly', '');
    }

    const equityMentioned = this.hasEquityMention(text);

    // 1. Regex pattern for salary ranges:
    // e.g. "$140,000 - $180,000 / year", "£70k - £90k", "$60 - $80 / hr", "$2,000 - $3,000 / wk"
    const salaryRangeRegex = /(?:(\$|€|£|USD|EUR|GBP|CAD|AUD)\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3})\s*(k|K)?\s*(?:-|–|—|to)\s*(?:(\$|€|£|USD|EUR|GBP|CAD|AUD)\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3})\s*(k|K)?\s*(?:(USD|EUR|GBP|CAD|AUD))?\s*(?:\/|\s+per\s+|\s+a\s+|\s+an\s+)?(yr|year|annually|yearly|mo|month|monthly|wk|week|weekly|hr|hour|hourly|day|daily)?\b/i;

    // 2. Single salary pattern:
    // e.g. "$150,000 / year", "$75/hr", "£90k annually", "$2,500 / week"
    const singleSalaryRegex = /(?:(\$|€|£|USD|EUR|GBP|CAD|AUD)\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3})\s*(k|K)?\s*(?:(USD|EUR|GBP|CAD|AUD))?\s*(?:\/|\s+per\s+|\s+a\s+|\s+an\s+)?(yr|year|annually|yearly|mo|month|monthly|wk|week|weekly|hr|hour|hourly|day|daily)?\b/i;

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

      const rawCurr = prefixCurr1 || prefixCurr2 || suffixCurr;
      const currency = rawCurr ? (this.CURRENCY_MAP[rawCurr.toLowerCase()] || rawCurr.toUpperCase()) : null;

      let min = parseFloat((numStr1 || '0').replace(/,/g, ''));
      let max = parseFloat((numStr2 || '0').replace(/,/g, ''));

      const isK = Boolean(k1 || k2 || (fullMatch && /k\b/i.test(fullMatch)));
      if (isK) {
        if (min < 1000) min *= 1000;
        if (max < 1000) max *= 1000;
      }

      let interval: SalaryInterval = 'yearly';
      if (intervalStr) {
        if (/hr|hour|hourly/i.test(intervalStr)) interval = 'hourly';
        else if (/wk|week|weekly/i.test(intervalStr)) interval = 'weekly';
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
      const rawCurr = prefixCurr || suffixCurr;
      const currency = rawCurr ? (this.CURRENCY_MAP[rawCurr.toLowerCase()] || rawCurr.toUpperCase()) : null;

      let amount = parseFloat((numStr || '0').replace(/,/g, ''));

      const isK = Boolean(k || (fullMatch && /k\b/i.test(fullMatch)));
      if (isK) {
        if (amount < 1000) amount *= 1000;
      }

      let interval: SalaryInterval = 'yearly';
      if (intervalStr) {
        if (/hr|hour|hourly/i.test(intervalStr)) interval = 'hourly';
        else if (/wk|week|weekly/i.test(intervalStr)) interval = 'weekly';
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
      currency: null,
      interval: 'yearly',
      annualizedMin: null,
      annualizedMax: null,
      hasSalary: false,
      equityMentioned,
    };
  }
}

/**
 * Formats compensation values deterministically based on currency, interval, and numbers.
 * Completely replaces magic magnitude heuristics (< 1000).
 * Never assumes missing currency is USD.
 */
export function formatSalary({ min, max, currency, interval = 'yearly' }: FormatSalaryOptions): string | null {
  if ((min === null || min === undefined) && (max === null || max === undefined)) {
    return null;
  }

  const symbolMap: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    CAD: 'C$',
    AUD: 'A$',
    CHF: 'CHF ',
  };

  const currCode = currency ? currency.trim().toUpperCase() : null;
  const symbol = currCode ? (symbolMap[currCode] || `${currCode} `) : '';

  const intervalSuffixMap: Record<string, string> = {
    hourly: '/hr',
    daily: '/day',
    weekly: '/wk',
    monthly: '/mo',
    yearly: '/yr',
  };
  const intervalKey = ((interval || 'yearly') as string).toLowerCase();
  const suffix = intervalSuffixMap[intervalKey] || '/yr';

  const formatAmount = (num: number): string => {
    if (intervalKey === 'hourly') {
      return `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }
    if (intervalKey === 'daily' || intervalKey === 'weekly' || intervalKey === 'monthly') {
      return `${symbol}${Math.round(num).toLocaleString('en-US')}`;
    }
    // yearly
    if (num >= 1000 && num % 1000 === 0) {
      return `${symbol}${num / 1000}k`;
    }
    return `${symbol}${Math.round(num).toLocaleString('en-US')}`;
  };

  const hasMin = typeof min === 'number' && !isNaN(min);
  const hasMax = typeof max === 'number' && !isNaN(max);

  if (hasMin && hasMax) {
    if (min === max) {
      return `${formatAmount(min)}${suffix}`;
    }
    return `${formatAmount(min)} - ${formatAmount(max)}${suffix}`;
  }
  if (hasMin) {
    return `From ${formatAmount(min)}${suffix}`;
  }
  if (hasMax) {
    return `Up to ${formatAmount(max)}${suffix}`;
  }
  return null;
}
