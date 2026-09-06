export interface SalaryShieldInput {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  interval?: string | null;
}

export type SalaryShieldValue =
  | SalaryShieldInput
  | string
  | number
  | null
  | undefined;

/**
 * Generic presentation-layer safety shield for salary values (P0-DQ-02).
 * 
 * Rejects obvious scraper corruptions and URL tracking artifacts without
 * imposing arbitrary economic thresholds (such as minimum wage requirements),
 * respecting international jobs, internships, contract roles, and varied compensation.
 * 
 * Invariants:
 * 1. Operates generically — never hardcodes specific IDs ($619, $103, etc.).
 * 2. Does NOT mutate stored database records.
 * 3. Returns boolean indicating whether values are credible for UI presentation.
 */
export function isPresentableSalary(
  salary: SalaryShieldValue,
  options: { allowCompetitiveText?: boolean } = {}
): boolean {
  if (salary === null || salary === undefined) return false;

  const suspiciousPatterns = [
    /https?:\/\//i,
    /:\/\//i,
    /[?&#]/,
    /utm[_-]/i,
    /gh_jid/i,
    /jobright/i,
    /\.html?/i,
    /\.php/i,
    /id=\d+/i,
    /token/i,
  ];

  // If salary is passed as a string
  if (typeof salary === 'string') {
    const trimmed = salary.trim();
    if (!trimmed) return false;

    // Check for URL tracking tokens or query strings
    if (suspiciousPatterns.some((pattern) => pattern.test(trimmed))) {
      return false;
    }

    if (options.allowCompetitiveText) {
      if (/^(competitive|market\s*rate|doe|depends\s*on\s*experience)$/i.test(trimmed)) {
        return true;
      }
    }

    // Attempt to extract numeric components
    const numbers = trimmed
      .replace(/,/g, '')
      .match(/\d+(?:\.\d+)?/g);

    if (!numbers || numbers.length === 0) {
      return false;
    }

    // Check if it represents an untyped number between 100 and 999 without 'k', '/hr', or currency
    const hasK = /k\b/i.test(trimmed);
    const hasHr = /\/(?:hr|hour)\b/i.test(trimmed);
    const parsedNums = numbers.map(Number);

    // If pure number string like "619" or "105"
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (num < 1000 && num > 100) return false; // 3-digit tracking token
      if (num >= 100_000_000) return false;
      if (num <= 0) return false;
      return true;
    }

    // Check bounds
    for (const num of parsedNums) {
      if (num >= 100_000_000) return false;
      if (!hasK && !hasHr && num >= 100 && num < 1000 && !/\b(per|an|\/)\s*hour\b/i.test(trimmed)) {
        // e.g. "$619/yr" without k
        if (/\/(?:yr|year|annual)\b/i.test(trimmed)) {
          return false;
        }
      }
    }

    return true;
  }

  // If salary is passed as a number
  if (typeof salary === 'number') {
    if (isNaN(salary) || salary <= 0 || salary >= 100_000_000) return false;
    // 3-digit number without context (likely a token or ID)
    if (salary >= 100 && salary < 1000) return false;
    return true;
  }

  // If salary is passed as SalaryShieldInput object
  const { min, max, currency, interval } = salary;

  const hasMin = typeof min === 'number' && !isNaN(min);
  const hasMax = typeof max === 'number' && !isNaN(max);

  // If both are missing or zero/negative without meaningful context
  if (!hasMin && !hasMax) return false;

  const minVal = hasMin ? min! : 0;
  const maxVal = hasMax ? max! : minVal;

  if (minVal <= 0 && maxVal <= 0) return false;
  if (hasMin && hasMax && minVal > maxVal) return false;

  if (currency && suspiciousPatterns.some((pattern) => pattern.test(currency))) {
    return false;
  }

  if (interval && suspiciousPatterns.some((pattern) => pattern.test(interval))) {
    return false;
  }

  const normalizedInterval = (interval || 'yearly').toLowerCase();

  // Obvious non-currency corruption checks:
  // 1. Extreme astronomical bounds (database integers representing timestamps or hashes)
  if (minVal >= 100_000_000 || maxVal >= 100_000_000) {
    return false;
  }

  // 2. Annual salary that is an exact match for 3-digit tracking IDs (e.g. 100 to 999 as annual salary)
  // An annual compensation below 1000 in any primary fiat currency is almost certainly an extracted ID or percentage.
  if (normalizedInterval === 'yearly') {
    if (hasMin && minVal > 0 && minVal < 1000) return false;
    if (hasMax && maxVal > 0 && maxVal < 1000) return false;
  }

  // 3. Hourly rate exceeding plausible upper bounds (e.g. tracking number 1103 as hourly rate)
  // When currency is missing and hourly rate is an exact integer matching common tracking token ranges (> 300/hr without currency)
  if (normalizedInterval === 'hourly') {
    if (!currency && (minVal > 300 || maxVal > 300)) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitizes salary for display. Returns formatted string if presentable, or fallback.
 */
export function sanitizeSalaryForDisplay(
  formattedOrRaw: string | SalaryShieldValue,
  rawSalary?: SalaryShieldInput | null,
  fallback: string | null = null
): string | null {
  if (formattedOrRaw === null || formattedOrRaw === undefined || formattedOrRaw === '') {
    return fallback;
  }

  if (typeof formattedOrRaw === 'string') {
    if (rawSalary !== undefined) {
      if (!formattedOrRaw || !isPresentableSalary(rawSalary)) {
        return fallback;
      }
      return formattedOrRaw;
    } else {
      if (!isPresentableSalary(formattedOrRaw)) {
        return fallback;
      }
      return formattedOrRaw;
    }
  }

  if (isPresentableSalary(formattedOrRaw)) {
    return String(formattedOrRaw);
  }
  return fallback;
}
