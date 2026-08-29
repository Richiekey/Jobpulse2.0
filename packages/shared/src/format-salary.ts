export type SalaryInterval = 'yearly' | 'monthly' | 'weekly' | 'daily' | 'hourly';

export interface FormatSalaryOptions {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  interval?: SalaryInterval | string | null;
}

/**
 * Formats compensation values deterministically based on currency, interval, and numbers.
 * Completely replaces magic magnitude heuristics (< 1000).
 */
export function formatSalary({ min, max, currency = 'USD', interval = 'yearly' }: FormatSalaryOptions): string | null {
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

  const currCode = (currency || 'USD').toUpperCase();
  const symbol = symbolMap[currCode] || `${currCode} `;

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
